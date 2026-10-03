# Environment

Local: copy `.env.example` to `.env` (never commit). Production: copy `.env.production.example` to `.env.production` and pass `--env-file .env.production` to compose. Files named `.env.*` are git- and docker-ignored except the `*.example` files.

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `PORT`, `CORS_ORIGIN` | local API. In compose `DATABASE_URL` is built from `POSTGRES_*` and `CORS_ORIGIN` is `https://APP_HOST` |
| `APP_HOST` | public hostname (domain or `vastraa.<IP>.sslip.io`); drives Caddy/Traefik routing and CORS |
| `POSTGRES_USER/PASSWORD/DB` | password required |
| `SESSION_DAYS`, `UPLOAD_MAX_BYTES` | defaults 7 / 5 MB per file |
| `UPLOAD_PROVIDER` | `r2` (production) or `local` (dev/test/compat; also needs `UPLOAD_DIR`) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`, optional `R2_ENDPOINT` | required when `r2`; runtime-only API env, never `VITE_*` or build args |
| `TRAEFIK_NETWORK`, `CERT_RESOLVER` | Traefik compose only |
| `ADMIN_EMAIL/NAME/PASSWORD`, `BUSINESS_SLUG/NAME` | inputs to `admin:create` (one-off, not stored) |
| `ALLOW_DEMO_SEED`, `SEED_ADMIN_PASSWORD` | demo seed guard in production |

Scripts: `npm run admin:create`, `npm run seed:demo` (dev, tsx), `npm run storage:migrate:r2 -- --dry-run`; compiled equivalents (`npm run backend:build` emits `dist-tools/`): `node dist-tools/scripts/create-admin.js`, `node dist-tools/scripts/seed-demo.js`, `node dist-tools/backend/src/tools/migrateStorageToR2.js`. `npx prisma db seed` (dev) runs the same guarded wrapper via tsx.
