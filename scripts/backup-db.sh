#!/usr/bin/env bash
# Non-destructive PostgreSQL backup (custom format) into ./backups.
# Env: ENV_FILE (default .env.production), COMPOSE_FILE (default docker-compose.standalone.yml), BACKUP_DIR, KEEP (optional: prune to newest N dumps).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
OUT="$BACKUP_DIR/vastraa-db-$STAMP.pgdump"
"${DC[@]}" exec -T vastraa-db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$OUT.tmp"
[ -s "$OUT.tmp" ] || { rm -f "$OUT.tmp"; echo "Backup is empty - failed." >&2; exit 1; }
mv "$OUT.tmp" "$OUT"; chmod 600 "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
if [ -n "${KEEP:-}" ]; then # retention is opt-in; only touches vastraa-db-*.pgdump files
  ls -1t "$BACKUP_DIR"/vastraa-db-*.pgdump | tail -n +"$((KEEP+1))" | xargs -r rm -f --
fi
