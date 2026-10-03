# Shared by the backup/restore scripts. Run them from anywhere; they cd to the repo root.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ENV_FILE="${ENV_FILE:-.env.production}"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.standalone.yml}"
DC=(docker compose)
[ -f "$ENV_FILE" ] && DC+=(--env-file "$ENV_FILE")
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
confirm() { # confirm "<phrase>" "<message>"
  echo "$2"; read -r -p "Type '$1' to continue: " ans
  [ "$ans" = "$1" ] || { echo "Aborted."; exit 1; }
}
