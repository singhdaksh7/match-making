# Vastraa Wholesale API handoff

The backend lives in `backend/`, uses Express + Prisma/PostgreSQL, and is independent of the existing Vite frontend.

## Start locally

1. Copy `.env.example` to `.env` and start Postgres with `docker compose -f docker-compose.dev.yml up -d`.
2. Local development only: `npx prisma migrate dev`, `npx prisma db seed` (guarded demo seed), then `npm run api`. Production uses `prisma migrate deploy` only.
3. The seeded owner is `admin@vastraa.demo` / `ChangeMe123!`; demo data only; production owners are created with `npm run admin:create`.

## API conventions

All authenticated endpoints are under `/api/v1` and use the HTTP-only `vw_session` cookie returned by `POST /auth/login`. Successful payloads are `{ data, meta? }`; errors are `{ error: { code, message } }`. Collection routes accept `page`, `limit`, and generally `q`.

| Area | Routes |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/v1/auth/login`, `POST /logout`, `GET /me` |
| Categories | `GET, POST /api/v1/categories`; `PATCH, DELETE /api/v1/categories/:id` |
| Attributes | `GET, POST /api/v1/attributes`; `PATCH /api/v1/attributes/:id`; `POST /:id/values`; `DELETE /:id/values/:valueId` |
| Products | `GET, POST /api/v1/products`; `GET, PATCH /api/v1/products/:id`; `POST /:id/variants`; `PATCH /:id/variants/:variantId` |
| Collections | `GET, POST /api/v1/collections` |
| Catalogues | `GET, POST /api/v1/catalogues`; `GET, PATCH /api/v1/catalogues/:id` (PATCH with `items` replaces the exact variant selection); `POST /:id/disable` |
| Enquiries | `GET /api/v1/enquiries`; `PATCH /:id/status` |
| Public catalogues | `GET /api/v1/public/catalogues/:token`; `POST /:token/enquiries` |

Product creation takes `categoryId`, `code`, `name`, `description`, `moq`, optional `attributeIds`, `allowedAttributeValueIds` (the product-specific value subset), optional `variants`, and `media`. Variants take `sku`, a required positive `price` (max 2 decimals), optional `status`, `attributeValueIds`, and optional `attributeAssignments` for attribute/value pairing checks. Variant values must belong to the category's attributes and to the product's enabled subset. Removing an enabled value that is still used by a variant returns 409. Inventory movements take `variantId`, a movement `type`, positive integer `quantity`, `reason`, and optional `reference`.

Tenant scope is always derived from the session's user; clients never provide a trusted business ID. Public catalogue DTOs omit price/MOQ based on catalogue settings and never return customer notes, cost data, or stock (availability is unlimited; there is no stock field anywhere). Enquiry items persist SKU, attributes, product name, image and price snapshots. See `VARIANT_PRICING.md`.

## Security notes

Helmet, CORS allowlisting, 1 MB JSON limit, Zod validation, login rate limiting, Argon2id password hashes, opaque hashed server-side sessions, role gates, and scoped queries are implemented. Production requires HTTPS, a restrictive `CORS_ORIGIN`, and managed object storage before enabling uploads.
