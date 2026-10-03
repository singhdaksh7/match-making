# Backup and restore

Object storage does not replace backups or retention.

## PostgreSQL (required)
- Backup: `./scripts/backup-db.sh` -> `./backups/vastraa-db-<UTC stamp>.pgdump` (custom format; `KEEP=N` prunes to the newest N). Uses `docker compose exec -T vastraa-db pg_dump`. Honours `ENV_FILE` (default `.env.production`) and `COMPOSE_FILE` (default `docker-compose.standalone.yml`).
- Restore (destructive, typed confirmation): stop the API, `./scripts/restore-db.sh backups/<file>.pgdump`, then `docker compose run --rm vastraa-migrate` and `up -d`.
- Retention: keep daily dumps for ~14 days and weekly for ~2 months, copy them off the server, and test a restore periodically. `backups/` is git-ignored.
- Migrations are forward-only; a restore discards data written after the dump.

## Media
- `UPLOAD_PROVIDER=r2` (production): media lives in Cloudflare R2, not on the VPS. Protect it: least-privilege token scoped to one bucket (Object Read & Write), separate dev/prod buckets, periodic bucket-to-bucket or `rclone copy` to a second bucket/provider, no public write access (public access read-only via custom domain), caution with lifecycle rules. R2 does not offer S3-style versioning in the same way - verify current Cloudflare docs.
- `UPLOAD_PROVIDER=local` only: `./scripts/backup-media.sh` (tar of the `vastraa_media` volume via a throwaway container) and `./scripts/restore-media.sh <tar.gz>` (typed confirmation).
