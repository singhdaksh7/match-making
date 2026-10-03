#!/usr/bin/env bash
# LOCAL PROVIDER ONLY (UPLOAD_PROVIDER=local). With r2, media is in Cloudflare R2: this is not needed.
# Tars the vastraa_media volume via a throwaway container. Read-only on the volume.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
PROJECT="$("${DC[@]}" config --format json 2>/dev/null | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"
VOL="${MEDIA_VOLUME:-${PROJECT:+${PROJECT}_}vastraa_media}"
docker volume inspect "$VOL" >/dev/null 2>&1 || { echo "Volume $VOL not found (set MEDIA_VOLUME=...). Local-provider only." >&2; exit 1; }
OUT="vastraa-media-$STAMP.tar.gz"
docker run --rm -v "$VOL":/data:ro -v "$(cd "$BACKUP_DIR" && pwd)":/backup alpine:3.20 tar czf "/backup/$OUT" -C /data .
chmod 600 "$BACKUP_DIR/$OUT"
echo "Wrote $BACKUP_DIR/$OUT"
