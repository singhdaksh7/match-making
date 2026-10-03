#!/usr/bin/env bash
# LOCAL PROVIDER ONLY. DESTRUCTIVE: extracts a media tarball over the vastraa_media volume.
# Usage: scripts/restore-media.sh backups/vastraa-media-<stamp>.tar.gz
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
FILE="${1:?usage: restore-media.sh <media.tar.gz>}"; [ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
PROJECT="$("${DC[@]}" config --format json 2>/dev/null | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"
VOL="${MEDIA_VOLUME:-${PROJECT:+${PROJECT}_}vastraa_media}"
confirm "RESTORE" "This will extract $FILE into volume $VOL (existing files with the same names are overwritten)."
docker volume inspect "$VOL" >/dev/null 2>&1 || docker volume create "$VOL" >/dev/null
docker run --rm -v "$VOL":/data -v "$(cd "$(dirname "$FILE")" && pwd)":/backup:ro alpine:3.20 tar xzf "/backup/$(basename "$FILE")" -C /data
# Re-own for the non-root API user (no-op/harmless if the api image is not built yet).
"${DC[@]}" run --rm --no-deps --user root --entrypoint chown vastraa-api -R vastraa:vastraa /app/uploads || echo "WARN: could not chown; see docs (Uploads ownership)."
echo "Done."
