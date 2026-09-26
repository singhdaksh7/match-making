# Environment

Copy `.env.example` to `.env`; do not commit it. Local operation requires `DATABASE_URL`, `PORT`, and `CORS_ORIGIN`. Compose also needs `POSTGRES_PASSWORD`, `APP_HOST`, and the existing `TRAEFIK_NETWORK` name.

`UPLOAD_PROVIDER=local` with `UPLOAD_DIR=/app/uploads` is implemented. S3 variables are documented placeholders; do not select S3 until an adapter is supplied.
