#!/usr/bin/env bash
# Shared helpers for backup/restore scripts. Run scripts from the repository root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found in $ROOT_DIR" >&2
  exit 1
fi
# Load only the variables we need (values are never echoed).
while IFS='=' read -r key value; do
  case "$key" in
    POSTGRES_SUPERUSER|APP_DB_USER|APP_DB_NAME|MINIO_ACCESS_KEY|MINIO_SECRET_KEY|MINIO_BUCKET|BACKUP_DIR|BACKUP_RETENTION_DAYS)
      export "$key=$value" ;;
  esac
done < <(grep -E '^[A-Z_]+=' .env)

POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}"
APP_DB_NAME="${APP_DB_NAME:-psu_kp}"
MINIO_BUCKET="${MINIO_BUCKET:-psu-knowledge-media}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

COMPOSE_PROJECT="psu-blog-km-api"
MC_IMAGE="cgr.dev/chainguard/minio-client@sha256:94433f625c8057d18c69675dbaa33da6e4864f084f9c44faf30d3eb8e3754e0b"

# Absolute host path usable as a Docker bind mount (Git Bash on Windows needs the Windows form).
host_path() {
  (cd "$1" && (pwd -W 2>/dev/null || pwd))
}

# Run MinIO client on the internal network; credentials passed via env, never on the command line.
mc_run() {
  local mount="$1"; shift
  MSYS_NO_PATHCONV=1 docker run --rm \
    --network "${COMPOSE_PROJECT}_backend" \
    --user "$(id -u 2>/dev/null || echo 0):$(id -g 2>/dev/null || echo 0)" \
    -e "MC_HOST_local=http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@minio:9000" \
    -e "MC_CONFIG_DIR=/tmp/.mc" \
    -v "${mount}:/backup" \
    "$MC_IMAGE" "$@"
}

psql_super() {
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_SUPERUSER" "$@"
}

sha_tool() {
  if command -v sha256sum >/dev/null 2>&1; then echo sha256sum; else echo "shasum -a 256"; fi
}
