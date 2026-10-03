#!/usr/bin/env bash
# DESTRUCTIVE: replaces objects in the target database with those in a dump (pg_restore --clean --if-exists).
# Usage: scripts/restore-db.sh backups/vastraa-db-<stamp>.pgdump
# Take a fresh backup first. Stop the API while restoring: docker compose stop vastraa-api
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
FILE="${1:?usage: restore-db.sh <dump.pgdump>}"; [ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
confirm "RESTORE" "This will OVERWRITE the current database with $FILE."
"${DC[@]}" exec -T vastraa-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$FILE"
echo "Restore finished. Run migrate deploy if the dump predates current migrations, then start the API."
