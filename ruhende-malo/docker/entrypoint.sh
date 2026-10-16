#!/bin/sh
# First start (or a new image with a changed schema): create the simulation database from the workbook baseline.
# All data is simulated, so rebuilding it is safe. Nothing here talks to SAP.
set -eu
DB_FILE="${DB_FILE:-/data/db.sqlite}"
export DB_FILE
export cds_requires_db_credentials_url="$DB_FILE"

SCHEMA_HASH="$(sha256sum db/schema.cds | cut -d' ' -f1)"
HASH_FILE="$(dirname "$DB_FILE")/.schema-hash"

if [ ! -f "$DB_FILE" ] || [ "$(cat "$HASH_FILE" 2>/dev/null || true)" != "$SCHEMA_HASH" ]; then
  echo "[ruhend] creating the simulation database at $DB_FILE"
  rm -f "$DB_FILE" "$DB_FILE-shm" "$DB_FILE-wal"
  npx tsx scripts/import-workbook.ts
  echo "$SCHEMA_HASH" > "$HASH_FILE"
fi

if [ -z "${RUHEND_ACCESS_CODE:-}" ]; then
  echo "[ruhend] WARNING: RUHEND_ACCESS_CODE is not set. Anyone who can reach this port can sign in as the maintainer."
fi
if [ -z "${RUHEND_SESSION_SECRET:-}" ]; then
  echo "[ruhend] note: RUHEND_SESSION_SECRET is not set. A random secret is used, so sessions end when the container restarts."
fi

exec npx cds-tsx serve --port "${PORT:-4004}"
