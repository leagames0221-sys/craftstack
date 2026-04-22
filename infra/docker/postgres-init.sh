#!/bin/bash
set -e

# Create app and migrator roles + per-app databases with extensions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_USER" <<-EOSQL
  CREATE ROLE app WITH LOGIN PASSWORD 'app';
  CREATE ROLE migrator WITH LOGIN PASSWORD 'migrator' BYPASSRLS;
EOSQL

for db in boardly knowlex; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $db OWNER migrator;
    GRANT CONNECT ON DATABASE $db TO app;
EOSQL

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
done

# pgvector only on knowlex
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "knowlex" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "[init] boardly + knowlex databases ready"
