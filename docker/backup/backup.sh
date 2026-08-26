#!/usr/bin/env sh
# Nightly pg_dump to /backups, 14 days retained. Section 12.
set -eu

BACKUP_DIR=/backups
STAMP=$(date +%Y-%m-%d_%H%M%S)
OUT="$BACKUP_DIR/dph_lead_engine_$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[backup] dumping to $OUT"
pg_dump "$DATABASE_URL" | gzip > "$OUT"

# Retain 14 days.
find "$BACKUP_DIR" -name "dph_lead_engine_*.sql.gz" -mtime +14 -delete
echo "[backup] done, old backups pruned"
