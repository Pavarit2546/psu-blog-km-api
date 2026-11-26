#!/usr/bin/env bash
# Restore a backup set.
#
#   Drill (safe, does not touch live data):
#     ./scripts/restore.sh backups/<ts> --target-db psu_kp_drill --target-bucket psu-knowledge-drill
#
#   Real restore (DESTRUCTIVE — replaces the live database and bucket contents):
#     ./scripts/restore.sh backups/<ts> --yes-replace-live-data
#
# Blast radius of a real restore: every row in $APP_DB_NAME and every object in $MINIO_BUCKET
# is replaced by the backup's contents; changes made after the backup are lost.
# Take a fresh backup first (the script does this automatically before a live restore).
source "$(dirname "$0")/lib.sh"

SRC="${1:?usage: restore.sh <backup-dir> [--target-db NAME --target-bucket NAME | --yes-replace-live-data]}"
shift || true
TARGET_DB=""; TARGET_BUCKET=""; LIVE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-db) TARGET_DB="$2"; shift 2 ;;
    --target-bucket) TARGET_BUCKET="$2"; shift 2 ;;
    --yes-replace-live-data) LIVE=true; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

if $LIVE; then
  TARGET_DB="$APP_DB_NAME"; TARGET_BUCKET="$MINIO_BUCKET"
elif [[ "$TARGET_DB" == "$APP_DB_NAME" || "$TARGET_BUCKET" == "$MINIO_BUCKET" ]]; then
  echo "Drill targets must differ from the live database and bucket" >&2; exit 2
elif [[ -z "$TARGET_DB" || -z "$TARGET_BUCKET" ]]; then
  echo "Refusing: pass --target-db/--target-bucket for a drill, or --yes-replace-live-data for a live restore." >&2
  exit 2
fi
[[ "$TARGET_DB" =~ ^[a-z0-9_]+$ ]] || { echo "invalid db name" >&2; exit 2; }
[[ "$TARGET_BUCKET" =~ ^[a-z0-9.-]+$ ]] || { echo "invalid bucket name" >&2; exit 2; }

echo "==> Verifying backup first"
"$(dirname "$0")/verify-backup.sh" "$SRC"

if $LIVE; then
  echo "==> Safety backup of current state"
  "$(dirname "$0")/backup.sh"
  echo "==> Stopping app"
  docker compose stop api
fi

echo "==> Restoring PostgreSQL into $TARGET_DB"
if $LIVE; then
  docker compose exec -T postgres pg_restore -U "$POSTGRES_SUPERUSER" -d "$TARGET_DB" --clean --if-exists \
    --no-owner --role="$APP_DB_USER" --exit-on-error < "$SRC/postgres.dump"
else
  psql_super -d postgres -q -c "DROP DATABASE IF EXISTS $TARGET_DB;" -c "CREATE DATABASE $TARGET_DB OWNER $APP_DB_USER;"
  docker compose exec -T postgres pg_restore -U "$POSTGRES_SUPERUSER" -d "$TARGET_DB" \
    --no-owner --role="$APP_DB_USER" --exit-on-error < "$SRC/postgres.dump"
fi

echo "==> Restoring MinIO objects into bucket $TARGET_BUCKET"
mc_run "$(host_path "$SRC/minio")" mb --ignore-existing "local/$TARGET_BUCKET" >/dev/null
# --remove makes the bucket an exact copy of the backup (objects added later are deleted).
mc_run "$(host_path "$SRC/minio")" mirror --quiet --overwrite --remove /backup "local/$TARGET_BUCKET" >/dev/null
OBJ="$(mc_run "$(host_path "$SRC/minio")" ls --recursive "local/$TARGET_BUCKET" | wc -l | tr -d ' ')"
ROWS="$(psql_super -d "$TARGET_DB" -tA -c "SELECT count(*) FROM articles;")"
echo "    $TARGET_DB: $ROWS articles · $TARGET_BUCKET: $OBJ objects"

if $LIVE; then
  echo "==> Starting app"
  docker compose start api
fi
echo "==> Restore complete"
