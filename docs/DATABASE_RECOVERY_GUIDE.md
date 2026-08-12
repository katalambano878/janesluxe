# Database Recovery Guide

## Confirm environment

```bash
ssh big-vps
# Inspect app DATABASE_URL host/db name only (mask password):
sudo docker exec $(sudo docker ps -q --filter name=sk96uj8zr5et20rjrnky73kn | head -1) \
  printenv DATABASE_URL | sed -E 's#://([^:]+):([^@]+)@#://\1:***@#'
```

Expected: `...@fleet-postgres:5432/janesluxe`

## Backup (schema + core data)

```bash
TS=$(date +%Y%m%d%H%M%S)
DIR=/data/fleet/backups/janesluxe-$TS
sudo mkdir -p "$DIR"
sudo docker exec fleet-postgres pg_dump -U postgres -d janesluxe --schema-only -f /tmp/jane-schema.sql
sudo docker cp fleet-postgres:/tmp/jane-schema.sql "$DIR/schema.sql"
sudo docker exec fleet-postgres pg_dump -U postgres -d janesluxe -f /tmp/jane-full.sql
sudo docker cp fleet-postgres:/tmp/jane-full.sql "$DIR/full.sql"
```

Pre-integrity backup exists: `/data/fleet/backups/janesluxe-pre-integrity-*`

## Restore full dump

```bash
# STOP app writes first (Coolify stop / scale down)
sudo docker exec -i fleet-postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='janesluxe' AND pid <> pg_backend_pid();"
# Prefer restore into a new DB then swap, or:
sudo docker exec -i fleet-postgres psql -U postgres -d janesluxe < "$DIR/full.sql"
```

## Rollback latest integrity migration

1. Restore function/body from `schema.sql` backup if needed
2. Drop new objects if required:
   - `DROP TABLE IF EXISTS payment_webhook_events, sms_delivery_log;`
   - Drop added indexes/constraints by name
3. Delete row from `schema_migrations` where version = `20260812000000_database_integrity_hardening`

## Verify after restore

```sql
SELECT count(*) FROM orders;
SELECT version FROM schema_migrations ORDER BY applied_at;
SELECT 1 FROM payment_webhook_events LIMIT 1; -- may not exist if rolled back
```

Hit `GET /api/health` on the app.
