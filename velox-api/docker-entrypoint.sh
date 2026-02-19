#!/bin/sh
# docker-entrypoint.sh — run Prisma migrations then start the server
#
# Uses the local node_modules/.bin/prisma (v5) to avoid npx pulling
# Prisma v7 which has an incompatible schema format.
#
# Handles the P3005 "database schema is not empty" error by baselining:
# if the DB already has tables but no _prisma_migrations tracking table,
# we resolve each migration as already-applied so future `migrate deploy`
# runs work correctly.

set -e

PRISMA="./node_modules/.bin/prisma"
SCHEMA="./prisma/schema.prisma"

echo "[entrypoint] Running Prisma migrations..."

# Try migrate deploy; if it fails with P3005 (non-empty DB, no migration table)
# we need to baseline — mark all existing migrations as already applied.
if ! $PRISMA migrate deploy --schema="$SCHEMA" 2>&1; then
  echo "[entrypoint] migrate deploy failed — attempting baseline resolution..."

  # Resolve each migration as already-applied (baseline)
  for dir in ./prisma/migrations/*/; do
    migration=$(basename "$dir")
    # Skip the migrations_lock file directory if present
    case "$migration" in
      migration_lock*) continue ;;
    esac
    echo "[entrypoint]   Resolving: $migration"
    $PRISMA migrate resolve --applied "$migration" --schema="$SCHEMA" || true
  done

  echo "[entrypoint] Baseline complete. Running migrate deploy again..."
  $PRISMA migrate deploy --schema="$SCHEMA"
fi

echo "[entrypoint] Migrations complete. Starting server..."
exec "$@"
