# Database Recovery Guide

## Backup (VPS)

```bash
ssh big-vps
sudo fleet db list
# Prefer fleet backup scripts under /data/fleet/scripts or:
# pg_dump of the Jane's Luxe database into /data/fleet/backups
```

## Restore

1. Stop or put app in maintenance (`MAINTENANCE_MODE=true`)
2. Restore dump into `store_janesluxe` (or current DB name)
3. Verify `orders`, `branches`, `auth.users` row counts
4. Redeploy / clear maintenance

## Rollback app

Redeploy previous Coolify image/commit on `staging/plain-postgres` if a bad release ships.

## Never

- Drop production tables without backup
- Force-push migration history that already ran elsewhere
