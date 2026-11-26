#!/bin/sh
# Runs once, on first initialisation of the postgres volume.
# Creates a least-privilege application role (no SUPERUSER/CREATEDB/CREATEROLE)
# that owns the application database, plus a separate database for automated tests.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname postgres \
  -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" \
  -v app_db="$APP_DB_NAME" -v test_db="${APP_TEST_DB_NAME:-psu_kp_test}" <<'EOSQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE :"app_db" OWNER :"app_user" ENCODING 'UTF8' TEMPLATE template0;
CREATE DATABASE :"test_db" OWNER :"app_user" ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE :"app_db" FROM PUBLIC;
REVOKE ALL ON DATABASE :"test_db" FROM PUBLIC;
EOSQL

# pg_trgm is a trusted extension, but create it up front so the app role never needs elevated rights.
for db in "$APP_DB_NAME" "${APP_TEST_DB_NAME:-psu_kp_test}"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -v app_user="$APP_DB_USER" <<'EOSQL'
ALTER SCHEMA public OWNER TO :"app_user";
EOSQL
done
