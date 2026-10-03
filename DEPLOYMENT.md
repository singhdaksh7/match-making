# Deployment

Full step-by-step guide for a new server: **[DEPLOY_NEW_VPS.md](DEPLOY_NEW_VPS.md)**.

Summary (production, `.env.production` created from `.env.production.example`):

1. `docker compose --env-file .env.production build`
2. `docker compose --env-file .env.production run --rm vastraa-migrate` (runs `prisma migrate deploy`; also runs automatically before the API on `up`, and the API only starts if it succeeds).
3. Owner account: `node dist-tools/scripts/create-admin.js` via `docker compose run --rm -e ADMIN_EMAIL=... -e ADMIN_NAME=... -e ADMIN_PASSWORD=... vastraa-migrate ...` (see DEPLOY_NEW_VPS.md section 7). The demo seed is opt-in only (`ALLOW_DEMO_SEED=true`) and never part of normal production.
4. `docker compose --env-file .env.production up -d --build`

Compose files:
- `docker-compose.standalone.yml` - Caddy + web + api + PostgreSQL; only Docker needed (fresh VPS).
- `docker-compose.yml` - same services behind an existing external Traefik network.
- `docker-compose.local.yml` - local production-like verification (HTTP, local media volume).
- `docker-compose.local-media.yml` - opt-in override: local-disk media volume (`UPLOAD_PROVIDER=local`).

Production media is stored in Cloudflare R2 (`UPLOAD_PROVIDER=r2`); the only required persistent volume is PostgreSQL. Never use `prisma migrate reset`, `db push` or `migrate dev` against production.
