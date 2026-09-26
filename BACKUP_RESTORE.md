# Backup and restore

`docker compose exec -T vastraa-db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > vastraa-YYYY-MM-DD.pgdump`

Restore only into an intentionally selected database:

`docker compose exec -T vastraa-db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < vastraa-YYYY-MM-DD.pgdump`

Back up the `vastraa_media` volume (or object bucket) separately; database rows store object keys and URLs only.
