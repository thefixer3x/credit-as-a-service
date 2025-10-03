#!/bin/bash

# CaaS Platform Kubernetes Deployment Script
# This script deploys the Credit-as-a-Service Platform to Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="caas-platform"
CHART_PATH="./helm-charts/caas-platform"
MANIFESTS_PATH="./manifests"
RELEASE_NAME="caas-platform"

# Functions
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

# Check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    log_success "kubectl is available"
}

# Check if helm is available
check_helm() {
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed or not in PATH"
        exit 1
    fi
    log_success "helm is available"
}

# Check if cluster is accessible
check_cluster() {
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    log_success "Connected to Kubernetes cluster"
}

# Create namespace if it doesn't exist
create_namespace() {
    if kubectl get namespace $NAMESPACE &> /dev/null; then
        log_info "Namespace $NAMESPACE already exists"
    else
        log_info "Creating namespace $NAMESPACE"
        kubectl create namespace $NAMESPACE
        log_success "Namespace $NAMESPACE created"
    fi
}

# Deploy using Helm
deploy_with_helm() {
    log_info "Deploying CaaS Platform using Helm"
    
    # Add required Helm repositories
    log_info "Adding Helm repositories"
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Deploy the platform
    log_info "Installing/upgrading CaaS Platform"
    helm upgrade --install $RELEASE_NAME $CHART_PATH \
        --namespace $NAMESPACE \
        --create-namespace \
        --wait \
        --timeout 10m \
        --values $CHART_PATH/values.yaml
    
    log_success "CaaS Platform deployed successfully"
}

# Deploy using manifests
deploy_with_manifests() {
    log_info "Deploying CaaS Platform using Kubernetes manifests"
    
    # Apply manifests in order
    log_info "Applying namespace and RBAC"
    kubectl apply -f $MANIFESTS_PATH/namespace.yaml
    kubectl apply -f $MANIFESTS_PATH/service-account.yaml
    
    log_info "Applying ConfigMaps and Secrets"
    kubectl apply -f $MANIFESTS_PATH/configmap.yaml
    kubectl apply -f $MANIFESTS_PATH/secret.yaml
    
    log_info "Applying deployments and services"
    kubectl apply -f $MANIFESTS_PATH/api-gateway-deployment.yaml
    
    log_info "Applying ingress"
    kubectl apply -f $MANIFESTS_PATH/ingress.yaml
    
    log_success "CaaS Platform deployed successfully"
}

# Check deployment status
check_deployment() {
    log_info "Checking deployment status"
    
    # Check pods
    log_info "Pod status:"
    kubectl get pods -n $NAMESPACE
    
    # Check services
    log_info "Service status:"
    kubectl get services -n $NAMESPACE
    
    # Check ingress
    log_info "Ingress status:"
    kubectl get ingress -n $NAMESPACE
    
    # Check if all pods are ready
    READY_PODS=$(kubectl get pods -n $NAMESPACE --field-selector=status.phase=Running --no-headers | wc -l)
    TOTAL_PODS=$(kubectl get pods -n $NAMESPACE --no-headers | wc -l)
    
    if [ "$READY_PODS" -eq "$TOTAL_PODS" ] && [ "$TOTAL_PODS" -gt 0 ]; then
        log_success "All pods are running"
    else
        log_warning "Some pods may not be ready yet"
    fi
}

# Get deployment information
get_info() {
    log_info "Deployment Information:"
    echo "Namespace: $NAMESPACE"
    echo "Release Name: $RELEASE_NAME"
    echo "Chart Path: $CHART_PATH"
    echo "Manifests Path: $MANIFESTS_PATH"
    echo ""
    
    log_info "Access URLs (if ingress is configured):"
    echo "Web Dashboard: https://caas-platform.com"
    echo "Admin Portal: https://admin.caas-platform.com"
    echo "Provider Dashboard: https://provider.caas-platform.com"
    echo "API: https://api.caas-platform.com"
    echo "GraphQL: https://graphql.caas-platform.com"
    echo ""
    
    log_info "Useful commands:"
    echo "kubectl get pods -n $NAMESPACE"
    echo "kubectl get services -n $NAMESPACE"
    echo "kubectl get ingress -n $NAMESPACE"
    echo "kubectl logs -f deployment/caas-api-gateway -n $NAMESPACE"
    echo "helm status $RELEASE_NAME -n $NAMESPACE"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up CaaS Platform deployment"
    
    if [ "$1" = "helm" ]; then
        helm uninstall $RELEASE_NAME -n $NAMESPACE
    else
        kubectl delete -f $MANIFESTS_PATH/ --ignore-not-found=true
    fi
    
    log_success "Cleanup completed"
}

# Main function
main() {
    case "${1:-deploy}" in
        "deploy")
            log_info "Starting CaaS Platform deployment"
            check_kubectl
            check_helm
            check_cluster
            create_namespace
            
            if [ "${2:-helm}" = "manifests" ]; then
                deploy_with_manifests
            else
                deploy_with_helm
            fi
            
            check_deployment
            get_info
            ;;
        "status")
            check_deployment
            ;;
        "info")
            get_info
            ;;
        "cleanup")
            cleanup "${2:-helm}"
            ;;
        "help"|"-h"|"--help")
            echo "Usage: $0 [command] [method]"
            echo ""
            echo "Commands:"
            echo "  deploy     Deploy the CaaS Platform (default)"
            echo "  status     Check deployment status"
            echo "  info       Show deployment information"
            echo "  cleanup    Remove the deployment"
            echo "  help       Show this help message"
            echo ""
            echo "Methods (for deploy/cleanup):"
            echo "  helm       Use Helm charts (default)"
            echo "  manifests  Use Kubernetes manifests"
            echo ""
            echo "Examples:"
            echo "  $0 deploy helm"
            echo "  $0 deploy manifests"
            echo "  $0 status"
            echo "  $0 cleanup helm"
            ;;
        *)
            log_error "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
