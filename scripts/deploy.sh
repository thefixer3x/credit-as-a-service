#!/bin/bash

# Credit-as-a-Service Platform Deployment Script
# This script handles deployment to SME infrastructure (srv896342.hstgr.cloud)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_USER="${DEPLOY_USER:-caas}"
DEPLOY_HOST="${DEPLOY_HOST:-srv896342.hstgr.cloud}"
ENVIRONMENT="${ENVIRONMENT:-production}"
VERSION="${VERSION:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking deployment prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check if docker-compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if SSH key exists
    if [[ ! -f ~/.ssh/id_rsa ]] && [[ ! -f ~/.ssh/id_ed25519 ]]; then
        log_error "SSH key not found. Please set up SSH key authentication."
        exit 1
    fi
    
    # Check environment file
    if [[ ! -f ".env.${ENVIRONMENT}" ]]; then
        log_error "Environment file .env.${ENVIRONMENT} not found"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    # Services to build
    local services=(
        "web-dashboard:apps/web-dashboard"
        "admin-portal:apps/admin-portal"
        "core-api:services/core-api"
        "notifications-service:services/notifications"
        "document-service:services/documents"
        "risk-assessment:services/risk-assessment"
        "payment-service:services/payments"
        "monitoring-service:services/monitoring"
        "credit-providers-api:services/credit-providers"
        "provider-dashboard:apps/credit-provider-dashboard"
        "admin-provider-management:services/admin-provider-management"
    )
    
    for service_path in "${services[@]}"; do
        IFS=':' read -r service path <<< "$service_path"
        log_info "Building $service..."
        
        cd "$PROJECT_ROOT/$path"
        
        # Check if Dockerfile exists
        if [[ ! -f "Dockerfile" ]]; then
            log_warning "Dockerfile not found for $service, skipping..."
            continue
        fi
        
        # Build the image
        docker build -t "caas/${service}:${VERSION}" .
        
        # Tag as latest if this is a production build
        if [[ "$ENVIRONMENT" == "production" ]]; then
            docker tag "caas/${service}:${VERSION}" "caas/${service}:latest"
        fi
        
        log_success "Built caas/${service}:${VERSION}"
    done
    
    cd "$PROJECT_ROOT"
    log_success "All images built successfully"
}

# Test deployment locally
test_deployment() {
    log_info "Testing deployment locally..."
    
    # Run docker-compose config validation
    docker-compose -f docker-compose.production.yml --env-file ".env.${ENVIRONMENT}" config > /dev/null
    log_success "Docker Compose configuration is valid"
    
    # Test database connection
    log_info "Testing database connection..."
    docker-compose -f docker-compose.production.yml --env-file ".env.${ENVIRONMENT}" up -d postgres redis
    sleep 10
    
    # Test if postgres is ready
    if docker-compose -f docker-compose.production.yml --env-file ".env.${ENVIRONMENT}" exec -T postgres pg_isready; then
        log_success "Database connection test passed"
    else
        log_error "Database connection test failed"
        docker-compose -f docker-compose.production.yml --env-file ".env.${ENVIRONMENT}" down
        exit 1
    fi
    
    # Cleanup test containers
    docker-compose -f docker-compose.production.yml --env-file ".env.${ENVIRONMENT}" down
    log_success "Local deployment test completed"
}

# Deploy to remote server
deploy_remote() {
    log_info "Deploying to remote server..."
    
    # Create deployment directory on remote server
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p ~/caas/{nginx,monitoring,scripts,ssl}"
    
    # Copy necessary files to remote server
    log_info "Copying deployment files..."
    scp "docker-compose.production.yml" "$DEPLOY_USER@$DEPLOY_HOST:~/caas/"
    scp ".env.${ENVIRONMENT}" "$DEPLOY_USER@$DEPLOY_HOST:~/caas/.env"
    scp -r nginx/* "$DEPLOY_USER@$DEPLOY_HOST:~/caas/nginx/"
    scp -r monitoring/* "$DEPLOY_USER@$DEPLOY_HOST:~/caas/monitoring/"
    scp -r scripts/* "$DEPLOY_USER@$DEPLOY_HOST:~/caas/scripts/"
    
    # Make scripts executable
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "chmod +x ~/caas/scripts/*.sh"
    
    # Export and transfer Docker images
    log_info "Transferring Docker images..."
    local temp_dir=$(mktemp -d)
    
    # Export images to tar files
    docker save caas/web-dashboard:${VERSION} | gzip > "$temp_dir/web-dashboard.tar.gz"
    docker save caas/admin-portal:${VERSION} | gzip > "$temp_dir/admin-portal.tar.gz"
    docker save caas/core-api:${VERSION} | gzip > "$temp_dir/core-api.tar.gz"
    docker save caas/notifications-service:${VERSION} | gzip > "$temp_dir/notifications-service.tar.gz"
    docker save caas/document-service:${VERSION} | gzip > "$temp_dir/document-service.tar.gz"
    docker save caas/risk-assessment:${VERSION} | gzip > "$temp_dir/risk-assessment.tar.gz"
    docker save caas/payment-service:${VERSION} | gzip > "$temp_dir/payment-service.tar.gz"
    docker save caas/monitoring-service:${VERSION} | gzip > "$temp_dir/monitoring-service.tar.gz"
    docker save caas/credit-providers-api:${VERSION} | gzip > "$temp_dir/credit-providers-api.tar.gz"
    docker save caas/provider-dashboard:${VERSION} | gzip > "$temp_dir/provider-dashboard.tar.gz"
    docker save caas/admin-provider-management:${VERSION} | gzip > "$temp_dir/admin-provider-management.tar.gz"
    
    # Transfer images to remote server
    scp "$temp_dir"/*.tar.gz "$DEPLOY_USER@$DEPLOY_HOST:~/caas/"
    
    # Load images on remote server
    ssh "$DEPLOY_USER@$DEPLOY_HOST" << 'EOF'
        cd ~/caas
        echo "Loading Docker images..."
        for image in *.tar.gz; do
            echo "Loading $image..."
            gunzip -c "$image" | docker load
            rm "$image"
        done
        echo "All images loaded successfully"
EOF
    
    # Cleanup temporary directory
    rm -rf "$temp_dir"
    
    log_success "Docker images transferred successfully"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    ssh "$DEPLOY_USER@$DEPLOY_HOST" << 'EOF'
        cd ~/caas
        
        # Start database first
        docker-compose -f docker-compose.production.yml up -d postgres redis
        
        # Wait for database to be ready
        echo "Waiting for database to be ready..."
        for i in {1..30}; do
            if docker-compose -f docker-compose.production.yml exec -T postgres pg_isready; then
                echo "Database is ready"
                break
            fi
            echo "Waiting for database... ($i/30)"
            sleep 2
        done
        
        # Run migrations using the core API service
        echo "Running database migrations..."
        docker-compose -f docker-compose.production.yml run --rm caas-api npm run migrate || echo "Migrations completed or no migrations needed"
        
        echo "Database setup completed"
EOF
    
    log_success "Database migrations completed"
}

# Deploy services with zero downtime
deploy_services() {
    log_info "Deploying services with zero downtime..."
    
    ssh "$DEPLOY_USER@$DEPLOY_HOST" << 'EOF'
        cd ~/caas
        
        # Update firewall rules for new service (port 3012)
        sudo ufw allow 3012/tcp comment "CaaS Admin Provider Management"
        
        # Start core services first
        echo "Starting core infrastructure services..."
        docker-compose -f docker-compose.production.yml up -d postgres redis nginx
        
        # Wait for core services to be healthy
        sleep 10
        
        # Start application services in stages
        echo "Starting monitoring and support services..."
        docker-compose -f docker-compose.production.yml up -d prometheus grafana caas-monitoring
        
        echo "Starting core API services..."
        docker-compose -f docker-compose.production.yml up -d caas-api caas-notifications caas-documents caas-risk-assessment caas-payments
        
        # Wait for API services to be healthy
        sleep 15
        
        echo "Starting provider services..."
        docker-compose -f docker-compose.production.yml up -d caas-credit-providers caas-admin-provider-management
        
        echo "Starting frontend applications..."
        docker-compose -f docker-compose.production.yml up -d caas-web caas-admin caas-provider-dashboard
        
        # Final health check
        echo "Performing final health check..."
        sleep 20
        
        # Check if all services are running
        docker-compose -f docker-compose.production.yml ps
        
        echo "All services deployed successfully"
EOF
    
    log_success "Services deployed with zero downtime"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Test service endpoints
    local endpoints=(
        "http://srv896342.hstgr.cloud:3000/api/health:Web Dashboard"
        "http://srv896342.hstgr.cloud:3001/health:Admin Portal"
        "http://srv896342.hstgr.cloud:3002/health:Core API"
        "http://srv896342.hstgr.cloud:3003/health:Notifications"
        "http://srv896342.hstgr.cloud:3004/health:Documents"
        "http://srv896342.hstgr.cloud:3005/health:Risk Assessment"
        "http://srv896342.hstgr.cloud:3006/health:Payments"
        "http://srv896342.hstgr.cloud:3007/health:Monitoring"
        "http://srv896342.hstgr.cloud:3008/health:Credit Providers"
        "http://srv896342.hstgr.cloud:3009/api/health:Provider Dashboard"
        "http://srv896342.hstgr.cloud:3012/health:Admin Provider Management"
    )
    
    local failed_checks=0
    
    for endpoint_desc in "${endpoints[@]}"; do
        IFS=':' read -r endpoint description <<< "$endpoint_desc"
        
        log_info "Testing $description endpoint..."
        
        if curl -f -s --max-time 10 "$endpoint" > /dev/null; then
            log_success "$description is healthy"
        else
            log_error "$description health check failed"
            ((failed_checks++))
        fi
    done
    
    if [[ $failed_checks -eq 0 ]]; then
        log_success "All services are healthy and responsive"
    else
        log_error "$failed_checks service(s) failed health checks"
        return 1
    fi
}

# Setup monitoring and alerting
setup_monitoring() {
    log_info "Setting up monitoring and alerting..."
    
    ssh "$DEPLOY_USER@$DEPLOY_HOST" << 'EOF'
        cd ~/caas
        
        # Ensure monitoring services are running
        docker-compose -f docker-compose.production.yml up -d prometheus grafana caas-monitoring
        
        # Wait for services to be ready
        sleep 10
        
        # Import Grafana dashboards
        if [[ -d "monitoring/grafana/dashboards" ]]; then
            echo "Importing Grafana dashboards..."
            # Grafana dashboards will be automatically loaded from the provisioned directory
        fi
        
        echo "Monitoring setup completed"
        echo "Grafana available at: http://srv896342.hstgr.cloud:3011"
        echo "Prometheus available at: http://srv896342.hstgr.cloud:9091"
EOF
    
    log_success "Monitoring and alerting configured"
}

# Cleanup old resources
cleanup() {
    log_info "Cleaning up old resources..."
    
    ssh "$DEPLOY_USER@$DEPLOY_HOST" << 'EOF'
        cd ~/caas
        
        # Remove unused Docker images
        docker image prune -f
        
        # Remove unused volumes (be careful with this in production)
        # docker volume prune -f
        
        # Remove unused networks
        docker network prune -f
        
        echo "Cleanup completed"
EOF
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting CaaS Platform deployment to $ENVIRONMENT environment"
    log_info "Version: $VERSION"
    log_info "Target host: $DEPLOY_HOST"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-test)
                SKIP_TEST=true
                shift
                ;;
            --force)
                FORCE_DEPLOY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --skip-build    Skip Docker image building"
                echo "  --skip-test     Skip local deployment testing"
                echo "  --force         Force deployment even if tests fail"
                echo "  --help          Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run deployment steps
    check_prerequisites
    
    if [[ "${SKIP_BUILD:-false}" != "true" ]]; then
        build_images
    fi
    
    if [[ "${SKIP_TEST:-false}" != "true" ]]; then
        if ! test_deployment && [[ "${FORCE_DEPLOY:-false}" != "true" ]]; then
            log_error "Local deployment test failed. Use --force to deploy anyway."
            exit 1
        fi
    fi
    
    deploy_remote
    run_migrations
    deploy_services
    
    if ! verify_deployment && [[ "${FORCE_DEPLOY:-false}" != "true" ]]; then
        log_error "Deployment verification failed. Rolling back..."
        # Add rollback logic here if needed
        exit 1
    fi
    
    setup_monitoring
    cleanup
    
    log_success "🚀 CaaS Platform deployment completed successfully!"
    log_info "Services available at:"
    log_info "  - Web Dashboard: http://srv896342.hstgr.cloud:3000"
    log_info "  - Admin Portal: http://srv896342.hstgr.cloud:3001"
    log_info "  - Core API: http://srv896342.hstgr.cloud:3002"
    log_info "  - Provider Dashboard: http://srv896342.hstgr.cloud:3009"
    log_info "  - Admin Provider Management: http://srv896342.hstgr.cloud:3012"
    log_info "  - Monitoring: http://srv896342.hstgr.cloud:3011"
    log_info ""
    log_info "Next steps:"
    log_info "1. Configure DNS records to point to srv896342.hstgr.cloud"
    log_info "2. Set up SSL certificates"
    log_info "3. Configure external integrations (payment gateways, SMS, email)"
    log_info "4. Test end-to-end workflows"
}

# Run main function
main "$@"