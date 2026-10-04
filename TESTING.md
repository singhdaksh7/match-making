# Testing

Run `npm run backend:check` (type-checks the API and the seed/admin/storage tools; `npm run backend:build` compiles both to `dist-backend/` and `dist-tools/`), `npm run build`, and `npx prisma validate` (with `DATABASE_URL` set). Use a separate database URL for integration tests; never reset development or production. After pulling attribute-schema changes, apply the forward migration `20260926120000_product_allowed_attribute_values` with `npx prisma migrate deploy` — do not use `prisma migrate reset` or `db push` against production.

Manual release coverage includes session restoration, public anonymous catalogue, independent variants in an enquiry, persistent enquiry status, invalid/expired/disabled catalogue responses, and media-upload failure. Product attribute coverage includes category-assigned types, product-specific value subsets, variant validation, and blocked removal of in-use values.

Deployment checks: `docker compose -f docker-compose.standalone.yml config -q` (with dummy `APP_HOST`/`POSTGRES_PASSWORD`), `bash -n scripts/*.sh`, `docker build -f Dockerfile.backend .`. Against a throwaway PostgreSQL only: `node dist-tools/scripts/create-admin.js` and the production seed guard (`NODE_ENV=production node dist-tools/scripts/seed-demo.js` must refuse). For R2 deployments follow the smoke test in DEPLOY_NEW_VPS.md section 9. Never point tests at production.

## Delete management and catalogue-link tests

* `npm run test:backend` runs `tests/backend.integration.test.ts` and `tests/deletion.integration.test.ts` sequentially (`--test-concurrency=1`; both truncate the dedicated `vastraa_test` database). The deletion suite covers success, 401/403/404, tenant isolation, dependency and history protection, shared-object safety, R2 cleanup and R2 failure handling. See `DELETION.md` for the policy.
* Browser specs `tests/catalogue-public-link.spec.ts` and `tests/delete-management.spec.ts` need a running **local** stack (web + API + a database containing one OWNER) and create/remove their own data. They refuse to run against a non-local host. Set `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`. With `npm run dev` (Vite proxies `/api` to port 4000), use `PORT=4000` for the API and do **not** set `VITE_API_URL` for the browser (it makes the app call the API cross-origin).
* The older specs (`release-smoke`, `mobile-release`, `catalogue-enquiry-flow`, `attribute-images`) contain hard-coded demo ids/state and only pass against the original demo-seeded stack; they fail identically on release `5a9bbb4`.
