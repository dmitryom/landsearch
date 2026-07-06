#!/bin/bash
# LandSearch PostgreSQL backup script
# Run daily via cron: 0 3 * * * /root/landsearch/scripts/backup-db.sh
# Requires ~/.pgpass with 600 permissions for passwordless auth

set -euo pipefail

BACKUP_DIR="/root/landsearch/backups"
DB_NAME="landsearch"
DB_USER="landsearch"
DB_HOST="localhost"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/landsearch_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

pg_dump -U "$DB_USER" -h "$DB_HOST" "$DB_NAME" | gzip > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

find "$BACKUP_DIR" -name "landsearch_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# Off-site sync (uncomment and configure when S3 is ready):
# rclone copy "$BACKUP_DIR" "s3-backup:landsearch-backups/" --quiet

echo "Backups older than ${RETENTION_DAYS} days removed."
