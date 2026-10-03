# Testing

Run `npm run backend:check` (type-checks the API and the seed/admin/storage tools; `npm run backend:build` compiles both to `dist-backend/` and `dist-tools/`), `npm run build`, and `npx prisma validate` (with `DATABASE_URL` set). Use a separate database URL for integration tests; never reset development or production. After pulling attribute-schema changes, apply the forward migration `20260926120000_product_allowed_attribute_values` with `npx prisma migrate deploy` — do not use `prisma migrate reset` or `db push` against production.

Manual release coverage includes session restoration, public anonymous catalogue, independent variants in an enquiry, persistent enquiry status, invalid/expired/disabled catalogue responses, and media-upload failure. Product attribute coverage includes category-assigned types, product-specific value subsets, variant validation, and blocked removal of in-use values.

Deployment checks: `docker compose -f docker-compose.standalone.yml config -q` (with dummy `APP_HOST`/`POSTGRES_PASSWORD`), `bash -n scripts/*.sh`, `docker build -f Dockerfile.backend .`. Against a throwaway PostgreSQL only: `node dist-tools/scripts/create-admin.js` and the production seed guard (`NODE_ENV=production node dist-tools/scripts/seed-demo.js` must refuse). For R2 deployments follow the smoke test in DEPLOY_NEW_VPS.md section 9. Never point tests at production.
