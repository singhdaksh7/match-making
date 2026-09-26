# Testing

Run `npm run backend:check`, `npm run build`, and `npx prisma validate` (with `DATABASE_URL` set). Use a separate database URL for integration tests; never reset development or production. After pulling attribute-schema changes, apply the forward migration `20260926120000_product_allowed_attribute_values` with `npx prisma migrate deploy` — do not use `prisma migrate reset` or `db push` against production.

Manual release coverage includes session restoration, public anonymous catalogue, independent variants in an enquiry, persistent enquiry status, invalid/expired/disabled catalogue responses, and media-upload failure. Product attribute coverage includes category-assigned types, product-specific value subsets, variant validation, and blocked removal of in-use values.
