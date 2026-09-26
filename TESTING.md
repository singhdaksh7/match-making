# Testing

Run `npm run backend:check`, `npm run build`, and `npx prisma validate` (with `DATABASE_URL` set). Use a separate database URL for integration tests; never reset development or production.

Manual release coverage includes session restoration, public anonymous catalogue, independent variants in an enquiry, persistent enquiry status, invalid/expired/disabled catalogue responses, and media-upload failure.
