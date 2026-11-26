#!/usr/bin/env bash
# Backup PostgreSQL (pg_dump custom format) + MinIO bucket into $BACKUP_DIR/<UTC timestamp>/
# and write SHA256SUMS. Applies retention (BACKUP_RETENTION_DAYS) to older local backups.
#
#   ./scripts/backup.sh
#
# The backup directory is a HOST directory, outside the Docker volumes it protects.
# Copy it off-site afterwards (see README "Off-site backup").
source "$(dirname "$0")/lib.sh"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$TS"
mkdir -p "$DEST/minio"
echo "==> Backup to $DEST"

echo "--> PostgreSQL ($APP_DB_NAME)"
docker compose exec -T postgres pg_dump -U "$POSTGRES_SUPERUSER" -d "$APP_DB_NAME" -Fc -Z 6 > "$DEST/postgres.dump"
docker compose exec -T postgres pg_dumpall -U "$POSTGRES_SUPERUSER" --roles-only --no-role-passwords > "$DEST/roles.sql"

echo "--> MinIO (bucket $MINIO_BUCKET)"
mc_run "$(host_path "$DEST/minio")" mirror --quiet "local/$MINIO_BUCKET" /backup >/dev/null

cat > "$DEST/manifest.txt" <<EOF
created_utc=$TS
database=$APP_DB_NAME
bucket=$MINIO_BUCKET
postgres_image=$(docker compose images postgres --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -1)
object_count=$(find "$DEST/minio" -type f | wc -l | tr -d ' ')
EOF

( cd "$DEST" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 $(sha_tool) > SHA256SUMS )
echo "--> $(wc -l < "$DEST/SHA256SUMS" | tr -d ' ') files checksummed"

# Retention: remove local backup sets older than N days (directories named by timestamp only).
if [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_RETENTION_DAYS > 0 )); then
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime +"$BACKUP_RETENTION_DAYS" -print -exec rm -rf {} +
fi

echo "==> Done: $DEST"
echo "    Verify with: ./scripts/verify-backup.sh $DEST"
