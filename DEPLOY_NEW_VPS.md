# Deploying Vastraa Wholesale to a brand-new Ubuntu VPS

Stack: Caddy (HTTPS) -> nginx SPA + Express API -> PostgreSQL. Product media lives in **Cloudflare R2**; the PostgreSQL volume is the only required persistent data volume (plus Caddy's certificate volume, which is re-creatable).

**This guide is for a clean new VPS.** Sections 1-12 are the full fresh install; section 13 adds the exact steps to bring existing data and images over from an old server with no broken images.

Everything is driven by `APP_HOST`; `CORS_ORIGIN` is derived from it (`https://APP_HOST`). Nothing in the repo is tied to an old server or IP.

> **Production database rules.** Only `npx prisma migrate deploy` (done by the `vastraa-migrate` service) is allowed. **Never** run `prisma migrate reset`, `prisma db push` or `prisma migrate dev` against production: they can drop data. Migrations are forward-only.

## 1. Prerequisites
- Ubuntu 22.04/24.04 VPS, 2 GB RAM+, ports 22, 80, 443 open (firewall/security group). Port 5432 must NOT be open.
- A hostname pointing at the VPS: a domain A record, or `vastraa.<NEW-VPS-IP>.sslip.io` (e.g. `vastraa.203-0-113-10.sslip.io` style; use dashes or dots per sslip.io docs).
- A Cloudflare account with R2 enabled (section 3).

## 2. Docker, clone, permissions
```bash
docker --version && docker compose version || { curl -fsSL https://get.docker.com | sudo sh; sudo usermod -aG docker "$USER"; newgrp docker; }
sudo apt-get install -y git openssl
sudo mkdir -p /opt/vastraa && sudo chown "$USER": /opt/vastraa
git clone <YOUR-GITHUB-REPO-URL> /opt/vastraa && cd /opt/vastraa
```

## 3. Cloudflare R2 setup (do not share credentials in chat/tickets)
1. R2 -> **Create bucket** (e.g. `vastraa-media-prod`). Use a *separate* bucket for dev/test.
2. R2 -> **Manage API tokens** -> create token with **Object Read & Write**, scoped to **only this bucket**. Record the Access Key ID and Secret Access Key (shown once). Note your **Account ID** (R2 overview page).
3. Public read access: bucket -> Settings -> **Custom Domains** -> connect e.g. `media.<your-domain>` (recommended). The `r2.dev` URL is for testing only (rate-limited, no caching controls). Keep the bucket write-protected: only the API token can write; public access must be read-only.
4. Put values in `.env.production` (section 4): Account ID -> `R2_ACCOUNT_ID`, Access Key ID -> `R2_ACCESS_KEY_ID`, Secret -> `R2_SECRET_ACCESS_KEY`, bucket name -> `R2_BUCKET_NAME`, custom domain URL (no trailing slash) -> `R2_PUBLIC_BASE_URL`. `R2_ENDPOINT` is optional (derived from the account id). R2 values are runtime env of the API only - never `VITE_*`/build args.

## 4. Create `.env.production`
```bash
cp .env.production.example .env.production && chmod 600 .env.production
# generate secrets (do not echo them to shared screens/logs)
openssl rand -hex 24      # use for POSTGRES_PASSWORD (hex keeps the DB URL safe)
openssl rand -base64 36   # general-purpose secret / owner password
nano .env.production
```
| Variable | Required | Notes |
|---|---|---|
| `APP_HOST` | yes | public hostname, no scheme |
| `POSTGRES_PASSWORD` | yes | long random; URL-safe characters |
| `POSTGRES_USER`, `POSTGRES_DB` | no | default `vastraa` |
| `UPLOAD_PROVIDER` | yes | `r2` in production (`local` only for dev/compat, see Appendix) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | yes when `r2` | API validates at startup and refuses to run if missing |
| `R2_ENDPOINT` | no | override of the derived endpoint |
| `SESSION_DAYS`, `UPLOAD_MAX_BYTES` | no | default 7 / 5242880 per file |
| `TRAEFIK_NETWORK`, `CERT_RESOLVER` | Traefik mode only | |

Shortcut so every command below is shorter (use the same two lines for backups):
```bash
export COMPOSE_FILE=docker-compose.standalone.yml   # Traefik mode: docker-compose.yml
alias dc='docker compose --env-file .env.production'
```

## 5. Reverse proxy / network
- **Standalone (default for a fresh VPS):** `docker-compose.standalone.yml` runs Caddy on 80/443 with automatic Let's Encrypt for `APP_HOST`. Nothing else needed. `/api/*` -> API, everything else -> web. Request bodies up to 25 MB (multi-image uploads); nginx has the same limit.
- **Traefik (VPS already runs Traefik):** use `docker-compose.yml`, set `TRAEFIK_NETWORK` to the existing external network name and `CERT_RESOLVER`; verify both on the host first (`docker network ls`). Do not run both stacks on the same host ports.

## 6. Build, database, migrate
```bash
dc build
dc up -d vastraa-db                                  # waits via healthcheck
dc run --rm vastraa-migrate                          # = node node_modules/prisma/build/index.js migrate deploy
```
`dc up -d` also runs `vastraa-migrate` automatically and the API starts only if it exits 0. Run it explicitly first so you see the output.

New migration `20261003120000_attribute_value_images`: adds `Attribute.supportsImages` (default `false`) and the `ProductAttributeValueImage` table. It only adds; existing attributes, products and variants are preserved unchanged and no attribute supports images until an owner enables it.

## 7. Owner account (never seed production; skip if you restored an old database in section 13)
Normal production never seeds; containers never seed on start. Create/replace the owner with a prompt-free but non-echoing flow:
```bash
read -rp "Owner email: " ADMIN_EMAIL; read -rsp "Owner password (min 12 chars): " ADMIN_PASSWORD; echo
dc run --rm -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_NAME="Owner Name" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
   vastraa-migrate node dist-tools/scripts/create-admin.js
unset ADMIN_PASSWORD
```
Rules: password >= 12 chars, no default, never printed. Existing user with that email -> password reset, role OWNER, active, **all sessions revoked**. Business is chosen by `BUSINESS_SLUG`, else the only business, else (empty DB) one is created from `BUSINESS_NAME` / `BUSINESS_SLUG` (defaults `Vastraa Wholesale` / `vastraa-wholesale`); with several businesses and no slug it aborts. Locally: `ADMIN_EMAIL=... ADMIN_NAME=... npm run admin:create` (hidden prompt when run in a terminal and `ADMIN_PASSWORD` is unset).

### Optional first-time DEMO seed (empty DB only, normally skip)
Refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` **and** a unique `SEED_ADMIN_PASSWORD` (>=12 chars; the built-in demo password is rejected). It creates `admin@vastraa.demo` and demo catalogue data, idempotently:
```bash
read -rsp "Demo admin password: " SEED_ADMIN_PASSWORD; echo
dc run --rm -e ALLOW_DEMO_SEED=true -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" vastraa-migrate node dist-tools/scripts/seed-demo.js
unset SEED_ADMIN_PASSWORD
```
(Delete or disable the demo user afterwards in a real deployment.)

## 8. Start everything and health-check
```bash
dc up -d --build
dc ps                                                  # db, api, web: healthy
curl -fsS https://$APP_HOST/healthz                    # web  -> ok
curl -fsS https://$APP_HOST/api/health                 # api  -> {"status":"ok"}
curl -fsSI https://$APP_HOST/ | head -3                # HTTPS + SPA
```
Open `https://$APP_HOST` and log in. First HTTPS issuance can take a minute; check `dc logs vastraa-caddy`. DNS must resolve and 80/443 must be reachable.

## 9. R2 post-deployment smoke test
1. As owner: enable image support on an attribute, upload a test product (or attribute-value) image.
2. DB row exists: `dc exec vastraa-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id from \"ProductAttributeValueImage\" limit 5"'`.
3. Object reachable: `curl -I "<R2_PUBLIC_BASE_URL>/<object key from the API response/DB>"` -> `200` and an `image/*` content-type.
4. Public catalogue page renders the image (open a catalogue link in a private window).
5. Delete the image in the admin UI; the DB row disappears.
6. `curl -I` the same public URL again -> `404` (object deleted from R2).
Persistence: since media is in R2, it survives `dc down && dc up -d` and even replacing the VPS; only the PostgreSQL volume (`vastraa_db_data`) matters on the host, so back it up (section 10).

## 10. Backups
Object storage does not remove the need for backups and retention.
```bash
./scripts/backup-db.sh                  # -> ./backups/vastraa-db-<UTC stamp>.pgdump (custom format, mode 600)
KEEP=14 ./scripts/backup-db.sh          # optional: keep newest 14 dumps
```
Scripts honour `ENV_FILE` (default `.env.production`) and `COMPOSE_FILE` (default `docker-compose.standalone.yml`). Schedule with cron, copy `./backups` off the VPS (never commit it), and test restores periodically.

R2 data protection: Cloudflare R2 does not offer S3-style bucket versioning in the same way - verify the current Cloudflare docs for object versioning/retention features. Recommended: least-privilege API token scoped to the single bucket (Object Read & Write); separate dev and prod buckets; periodic bucket-to-bucket or `rclone copy` to a second bucket/provider; never expose bucket write access publicly (public = read-only via custom domain); be cautious with lifecycle rules (they delete objects permanently).

**Restore database** (destructive; asks for typed confirmation):
```bash
dc stop vastraa-api
./scripts/restore-db.sh backups/vastraa-db-<stamp>.pgdump
dc run --rm vastraa-migrate && dc up -d
```

## 11. Update procedure / future GitHub deploys
```bash
cd /opt/vastraa
./scripts/backup-db.sh                  # always first
git fetch --tags && git pull --ff-only
dc build
dc run --rm vastraa-migrate             # migrate deploy; stop here if it fails
dc up -d
dc ps && curl -fsS https://$APP_HOST/api/health
```

## 12. Rollback
Migrations are forward-only. Code-only rollback is safe if the previous release works with the current schema (new migrations here only add):
```bash
git checkout <previous-tag> && dc build && dc up -d
```
If the failing release changed data/schema incompatibly, restore the pre-update DB dump with `restore-db.sh` *then* check out the matching tag. Restoring discards data written after the dump. Do not try to "undo" migrations with reset/push.

## 13. Cutover from the OLD VPS (existing data and images, no broken images)
This is a **new-VPS deployment, not an in-place upgrade**: the old VPS is never modified, and stays as the rollback target. Skip this section on a brand-new installation with no data.

**Why this is safe.** Old image rows hold keys like `<businessId>/<uuid>.jpg`. In the new release the public URL is derived at response time as `R2_PUBLIC_BASE_URL + key`. So if every old file is copied to R2 **under the same key**, the new stack serves every old image with **no database edits at all**. The migration tool's default (mirror) mode does exactly that: it copies, never writes to the database, never deletes local files, and is idempotent. Do not set `UPLOAD_PROVIDER=r2` for real traffic until the mirror is verified (with `r2` and an un-mirrored legacy key the URL would 404).

Assumes sections 1-6 are done on the new VPS (R2 bucket + `.env.production` with R2_* set and `UPLOAD_PROVIDER=r2`), using the **temporary** host `APP_HOST=vastraa.<NEW-VPS-IP>.sslip.io` until the final switch. Nothing below touches the old VPS except read-only dumps.

### Phase A - copy data (old site keeps serving, nothing changes for users)
1. On the OLD VPS (read-only operations; adjust container/volume names with `docker ps` / `docker volume ls`):
```bash
docker exec vastraa-db pg_dump -U vastraa -d vastraa -Fc > /tmp/vastraa-old.pgdump          # DB
docker run --rm -v <old_media_volume>:/data:ro -v /tmp:/out alpine tar czf /out/vastraa-old-uploads.tgz -C /data .   # uploads
```
2. Copy both files to the new VPS (`scp`/`rsync`) and extract the uploads next to the repo:
```bash
mkdir -p ~/old-uploads && tar xzf vastraa-old-uploads.tgz -C ~/old-uploads
```
3. On the NEW VPS, load the database **before** running migrations, then apply the new migration (it only adds):
```bash
dc up -d vastraa-db
./scripts/restore-db.sh /path/to/vastraa-old.pgdump          # asks you to type RESTORE
dc run --rm vastraa-migrate                                   # migrate deploy (adds 20261003120000_attribute_value_images)
```
   The restored database already contains the owner account; do not run `admin:create` unless you need to reset it.
4. Mirror the media to R2 - dry run, then real run, with public-URL verification:
```bash
T="node dist-tools/backend/src/tools/migrateStorageToR2.js"
M='-v '"$HOME"'/old-uploads:/migrate-src:ro'
dc run --rm $M -e UPLOAD_DIR=/migrate-src vastraa-migrate $T --dry-run
dc run --rm $M -e UPLOAD_DIR=/migrate-src vastraa-migrate $T --verify-urls
```
   Success = the last line shows `failed=0` and `verified` equal to `scanned` (every row is HEAD-checked at its public URL: status 200 and the same size as the local file). The exit code is non-zero on any failure. Fix the cause (missing local file, wrong `R2_PUBLIC_BASE_URL`, bucket not public) and re-run: it is idempotent and will not re-upload objects that exist.

### Phase B - rehearse on the new VPS (still no user impact)
5. `dc up -d --build`, log in on `https://<temporary sslip host>`, open a catalogue link: product images must load from `R2_PUBLIC_BASE_URL`. Run the R2 smoke test (section 9). This is a copy of the data as of step 1; do not let customers use it yet.

### Phase C - cutover (short write freeze)
Database writes (enquiries, admin edits) made on the old site after the dump would be lost, so freeze them for the few minutes this takes. Images stay available: the old site serves local files until DNS moves; the new stack serves R2.
6. OLD VPS: stop the old API (`docker compose stop vastraa-api`; the old site is now read-only/unavailable). Do **not** delete anything. Take the final dump and uploads archive exactly as in step 1 and copy them over; extract the uploads over `~/old-uploads` (`tar xzf ... -C ~/old-uploads`).
7. NEW VPS: `dc stop vastraa-api`, `./scripts/restore-db.sh <final dump>`, `dc run --rm vastraa-migrate`, then repeat step 4 (`--verify-urls`). It only uploads files added since the first copy. Require `failed=0`.
8. Switch to the real hostname: set `APP_HOST=<final domain>` in `.env.production` (CORS follows automatically), keep `UPLOAD_PROVIDER=r2`, point the DNS A record at the new VPS (lower the TTL a day earlier), `dc up -d`, wait for Caddy's certificate (`dc logs vastraa-caddy`), then run section 8 health checks and section 9 smoke test on the real domain.
9. **Keep the old VPS and its uploads untouched for at least 14 days** (rollback target). Do not run `--delete-local` and do not run `--rewrite-keys`.

### Rollback during or after cutover
Before DNS moves: nothing to roll back (old site is intact; `docker compose start vastraa-api` on the old VPS). After DNS moves: repoint DNS to the old VPS and start its API. Data created on the new VPS meanwhile is not on the old one (export it from the new DB first if it matters).

### Optional later clean-up (not needed for the release)
`--rewrite-keys` copies objects to new-style keys (`business/<id>/products/<id>/general/<uuid>.<ext>`) and rewrites the database rows; `--delete-local` (only valid with it) then deletes the local copies. Only consider after the old VPS is retired and a database backup exists. Never as part of the cutover.

Tool reference: `--dry-run`, `--verify-urls`, `--rewrite-keys`, `--delete-local` (rejected unless `--rewrite-keys`). Never run by `migrate deploy` or at container start.

## 14. Logs
```bash
dc logs -f --tail=200 vastraa-api       # also: vastraa-web, vastraa-db, vastraa-caddy, vastraa-migrate
docker compose ps -a
```

## 15. Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| `POSTGRES_PASSWORD is required` / `APP_HOST is required` | run compose with `--env-file .env.production` (or `alias dc`) |
| API container restarts, log mentions R2 config | missing/invalid `R2_*` value; fix `.env.production`, `dc up -d` |
| API never starts, `vastraa-migrate` exited non-zero | `dc logs vastraa-migrate`; fix DB/URL; rerun migrate. Never reset |
| Caddy cannot get a certificate | DNS not pointing at VPS, 80/443 blocked, or a rate limit; see `dc logs vastraa-caddy` |
| Login works but session lost | not on HTTPS (cookies are Secure) or `APP_HOST` differs from the URL used |
| CORS error | `APP_HOST` must equal the browser's host exactly |
| Upload 413 | exceeds 25 MB total body (Caddy/nginx) or `UPLOAD_MAX_BYTES` per file |
| Images 403/404 on public URL | custom domain not connected / public access off / wrong `R2_PUBLIC_BASE_URL` |
| Port 80/443 already in use | another web server/Traefik is running: use Traefik mode or stop it |
| `permission denied` writing uploads (local provider only) | volume owned by root: `dc run --rm --no-deps --user root --entrypoint chown vastraa-api -R vastraa:vastraa /app/uploads` |

## Appendix: local media provider (dev/test/backward compatibility)
Only with `UPLOAD_PROVIDER=local`. Add the opt-in override so files persist in the `vastraa_media` volume (mounted at `/app/uploads`, owned by the `vastraa` user at image build):
```bash
export COMPOSE_FILE=docker-compose.standalone.yml:docker-compose.local-media.yml
```
Back up/restore it with `scripts/backup-media.sh` / `scripts/restore-media.sh` (local provider only).
