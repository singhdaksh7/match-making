# Deployment

1. Create a production `.env` based on `.env.example`.
2. Run `docker compose run --rm vastraa-api npx prisma migrate deploy`.
3. Optionally initialise an empty database once: `docker compose run --rm vastraa-api npx prisma db seed`.
4. Run `docker compose up -d --build`.

Compose does not publish 80/443, replace Traefik, seed, or reset the database on startup. API `/api` routing has a higher Traefik priority than the SPA.
