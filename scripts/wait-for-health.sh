#!/bin/bash

# Health check script for CaaS Platform services
set -euo pipefail

# Configuration
MAX_WAIT_TIME=300  # 5 minutes
CHECK_INTERVAL=10  # 10 seconds
HOST="localhost"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Service health check endpoints
declare -A SERVICES=(
    ["Web Dashboard"]="$HOST:3000/api/health"
    ["Admin Portal"]="$HOST:3001/health"
    ["Core API"]="$HOST:3002/health"
    ["Notifications"]="$HOST:3003/health"
    ["Documents"]="$HOST:3004/health"
    ["Risk Assessment"]="$HOST:3005/health"
    ["Payments"]="$HOST:3006/health"
    ["Monitoring"]="$HOST:3007/health"
    ["Credit Providers"]="$HOST:3008/health"
    ["Provider Dashboard"]="$HOST:3009/api/health"
    ["Admin Provider Management"]="$HOST:3012/health"
    ["Prometheus"]="$HOST:9091/api/v1/status/config"
    ["Grafana"]="$HOST:3011/api/health"
)

# Function to check if a service is healthy
check_service_health() {
    local service_name="$1"
    local endpoint="$2"
    local timeout=5
    
    if curl -f -s --max-time $timeout "http://$endpoint" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a specific service
wait_for_service() {
    local service_name="$1"
    local endpoint="$2"
    local elapsed=0
    
    log_info "Waiting for $service_name to be healthy..."
    
    while [[ $elapsed -lt $MAX_WAIT_TIME ]]; do
        if check_service_health "$service_name" "$endpoint"; then
            log_success "$service_name is healthy"
            return 0
        fi
        
        sleep $CHECK_INTERVAL
        elapsed=$((elapsed + CHECK_INTERVAL))
        
        # Show progress every 30 seconds
        if [[ $((elapsed % 30)) -eq 0 ]]; then
            log_info "Still waiting for $service_name... (${elapsed}s elapsed)"
        fi
    done
    
    log_error "$service_name failed to become healthy within ${MAX_WAIT_TIME}s"
    return 1
}

# Function to check Docker container status
check_container_status() {
    local container_name="$1"
    
    if docker ps --filter "name=$container_name" --filter "status=running" --format "{{.Names}}" | grep -q "$container_name"; then
        return 0
    else
        return 1
    fi
}

# Main health check function
main() {
    log_info "Starting health checks for CaaS Platform services..."
    log_info "Maximum wait time: ${MAX_WAIT_TIME}s"
    log_info "Check interval: ${CHECK_INTERVAL}s"
    
    # First, check if Docker containers are running
    log_info "Checking Docker container status..."
    
    local containers=(
        "caas_postgres"
        "caas_redis"
        "caas_web"
        "caas_admin"
        "caas_api"
        "caas_notifications"
        "caas_documents"
        "caas_risk_assessment"
        "caas_payments"
        "caas_monitoring"
        "caas_credit_providers"
        "caas_provider_dashboard"
        "caas_admin_provider_management"
        "caas_prometheus"
        "caas_grafana"
        "caas_nginx"
    )
    
    local failed_containers=()
    
    for container in "${containers[@]}"; do
        if check_container_status "$container"; then
            log_success "$container is running"
        else
            log_warning "$container is not running"
            failed_containers+=("$container")
        fi
    done
    
    if [[ ${#failed_containers[@]} -gt 0 ]]; then
        log_warning "Some containers are not running: ${failed_containers[*]}"
        log_info "Continuing with health checks for running services..."
    fi
    
    # Wait for core infrastructure services first
    log_info "Checking core infrastructure services..."
    
    # Wait for database
    log_info "Waiting for PostgreSQL database..."
    local db_ready=false
    local elapsed=0
    
    while [[ $elapsed -lt 60 ]] && [[ "$db_ready" == "false" ]]; do
        if docker-compose -f docker-compose.production.yml exec -T postgres pg_isready 2>/dev/null; then
            log_success "PostgreSQL is ready"
            db_ready=true
        else
            sleep 5
            elapsed=$((elapsed + 5))
        fi
    done
    
    if [[ "$db_ready" == "false" ]]; then
        log_error "PostgreSQL failed to become ready"
        exit 1
    fi
    
    # Wait for Redis
    log_info "Waiting for Redis..."
    local redis_ready=false
    elapsed=0
    
    while [[ $elapsed -lt 30 ]] && [[ "$redis_ready" == "false" ]]; do
        if docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log_success "Redis is ready"
            redis_ready=true
        else
            sleep 5
            elapsed=$((elapsed + 5))
        fi
    done
    
    if [[ "$redis_ready" == "false" ]]; then
        log_error "Redis failed to become ready"
        exit 1
    fi
    
    # Now check application services
    log_info "Checking application service health endpoints..."
    
    local failed_services=()
    local successful_services=()
    
    # Priority order for service startup
    local priority_services=(
        "Core API"
        "Notifications"
        "Credit Providers"
        "Admin Provider Management"
    )
    
    # Check priority services first
    for service in "${priority_services[@]}"; do
        if [[ -n "${SERVICES[$service]:-}" ]]; then
            if wait_for_service "$service" "${SERVICES[$service]}"; then
                successful_services+=("$service")
            else
                failed_services+=("$service")
            fi
        fi
    done
    
    # Check remaining services
    for service in "${!SERVICES[@]}"; do
        # Skip if already checked
        if [[ " ${priority_services[*]} " =~ " ${service} " ]]; then
            continue
        fi
        
        if wait_for_service "$service" "${SERVICES[$service]}"; then
            successful_services+=("$service")
        else
            failed_services+=("$service")
        fi
    done
    
    # Report results
    log_info "Health check summary:"
    log_success "Healthy services (${#successful_services[@]}): ${successful_services[*]}"
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "Unhealthy services (${#failed_services[@]}): ${failed_services[*]}"
        
        # Show detailed information about failed services
        log_info "Checking logs for failed services..."
        for service in "${failed_services[@]}"; do
            log_info "Recent logs for $service:"
            
            # Map service name to container name
            case "$service" in
                "Web Dashboard") container="caas_web" ;;
                "Admin Portal") container="caas_admin" ;;
                "Core API") container="caas_api" ;;
                "Notifications") container="caas_notifications" ;;
                "Documents") container="caas_documents" ;;
                "Risk Assessment") container="caas_risk_assessment" ;;
                "Payments") container="caas_payments" ;;
                "Monitoring") container="caas_monitoring" ;;
                "Credit Providers") container="caas_credit_providers" ;;
                "Provider Dashboard") container="caas_provider_dashboard" ;;
                "Admin Provider Management") container="caas_admin_provider_management" ;;
                "Prometheus") container="caas_prometheus" ;;
                "Grafana") container="caas_grafana" ;;
                *) container="" ;;
            esac
            
            if [[ -n "$container" ]]; then
                docker logs --tail 10 "$container" 2>/dev/null || echo "No logs available for $container"
            fi
        done
        
        exit 1
    else
        log_success "All services are healthy! 🚀"
        
        # Show service URLs
        log_info "Service URLs:"
        echo "  🌐 Web Dashboard: http://srv896342.hstgr.cloud:3000"
        echo "  👩‍💼 Admin Portal: http://srv896342.hstgr.cloud:3001"
        echo "  🔌 Core API: http://srv896342.hstgr.cloud:3002"
        echo "  🏦 Credit Providers API: http://srv896342.hstgr.cloud:3008"
        echo "  📊 Provider Dashboard: http://srv896342.hstgr.cloud:3009"
        echo "  ⚙️ Admin Provider Management: http://srv896342.hstgr.cloud:3012"
        echo "  📈 Monitoring: http://srv896342.hstgr.cloud:3011"
        echo "  📊 Prometheus: http://srv896342.hstgr.cloud:9091"
        
        exit 0
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --timeout=N    Set maximum wait time in seconds (default: 300)"
        echo "  --interval=N   Set check interval in seconds (default: 10)"
        echo "  --host=HOST    Set target host (default: localhost)"
        exit 0
        ;;
    --timeout=*)
        MAX_WAIT_TIME="${1#*=}"
        ;;
    --interval=*)
        CHECK_INTERVAL="${1#*=}"
        ;;
    --host=*)
        HOST="${1#*=}"
        # Update service endpoints with new host
        for service in "${!SERVICES[@]}"; do
            SERVICES[$service]="${SERVICES[$service]//localhost/$HOST}"
        done
        ;;
esac

# Run main function
main