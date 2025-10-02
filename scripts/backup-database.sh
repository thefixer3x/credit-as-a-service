#!/bin/bash

# Database backup script for CaaS Platform
set -euo pipefail

ENVIRONMENT="${1:-production}"
BACKUP_DIR="/home/caas/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="caas_${ENVIRONMENT}_${TIMESTAMP}.sql"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"

log_info "Starting database backup for $ENVIRONMENT environment..."

# Load environment variables
if [[ -f ".env.${ENVIRONMENT}" ]]; then
    set -a
    source ".env.${ENVIRONMENT}"
    set +a
else
    log_error "Environment file .env.${ENVIRONMENT} not found"
    exit 1
fi

# Perform database backup
log_info "Creating database backup: $BACKUP_FILE"

docker-compose -f docker-compose.production.yml exec -T postgres pg_dump \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --no-password \
    --verbose \
    --clean \
    --if-exists \
    --create \
    --format=plain > "${BACKUP_DIR}/${BACKUP_FILE}"

if [[ $? -eq 0 ]]; then
    log_info "Database backup completed successfully"
    
    # Compress the backup
    gzip "${BACKUP_DIR}/${BACKUP_FILE}"
    log_info "Backup compressed: ${BACKUP_FILE}.gz"
    
    # Set proper permissions
    chmod 600 "${BACKUP_DIR}/${BACKUP_FILE}.gz"
    
    # Show backup size
    BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}.gz" | cut -f1)
    log_info "Backup size: $BACKUP_SIZE"
    
    # Cleanup old backups (keep last 30 days)
    find "$BACKUP_DIR" -name "caas_${ENVIRONMENT}_*.sql.gz" -mtime +30 -delete
    log_info "Old backups cleaned up (>30 days)"
    
else
    log_error "Database backup failed"
    exit 1
fi

log_info "Backup process completed successfully"