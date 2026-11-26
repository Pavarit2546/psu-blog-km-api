#!/usr/bin/env bash
# Verify a backup set:
#  1. checksums match (SHA256SUMS)
#  2. the dump is readable (pg_restore --list)
#  3. a real restore into a throw-away database succeeds and contains data
#  4. MinIO object count matches the manifest
#
#   ./scripts/verify-backup.sh backups/20261120T090000Z
source "$(dirname "$0")/lib.sh"

SRC="${1:?usage: verify-backup.sh <backup-dir>}"
[[ -f "$SRC/postgres.dump" ]] || { echo "ERROR: $SRC/postgres.dump missing" >&2; exit 1; }

echo "==> Checksums"
( cd "$SRC" && $(sha_tool) -c --quiet SHA256SUMS )
echo "    OK"

echo "==> Dump readable"
docker compose exec -T postgres pg_restore --list < "$SRC/postgres.dump" > /dev/null
echo "    OK"

CHECK_DB="psu_kp_restore_check"
echo "==> Test restore into scratch database $CHECK_DB"
psql_super -d postgres -q -c "DROP DATABASE IF EXISTS $CHECK_DB;" -c "CREATE DATABASE $CHECK_DB;"
docker compose exec -T postgres pg_restore -U "$POSTGRES_SUPERUSER" -d "$CHECK_DB" --no-owner --exit-on-error < "$SRC/postgres.dump"
COUNTS="$(psql_super -d "$CHECK_DB" -tA -c "SELECT (SELECT count(*) FROM users)||' users, '||(SELECT count(*) FROM articles)||' articles, '||(SELECT count(*) FROM payload_migrations)||' migrations';")"
psql_super -d postgres -q -c "DROP DATABASE $CHECK_DB;"
echo "    Restored: $COUNTS"

echo "==> MinIO objects"
EXPECTED="$(grep '^object_count=' "$SRC/manifest.txt" | cut -d= -f2)"
ACTUAL="$(find "$SRC/minio" -type f | wc -l | tr -d ' ')"
[[ "$EXPECTED" == "$ACTUAL" ]] || { echo "ERROR: expected $EXPECTED objects, found $ACTUAL" >&2; exit 1; }
echo "    $ACTUAL objects OK"
echo "==> Backup verified"
