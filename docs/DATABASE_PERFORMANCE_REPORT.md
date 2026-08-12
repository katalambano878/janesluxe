# Database Performance Report

## Pool (`lib/db/pool.ts`)

| Setting | Value |
|---------|-------|
| max | 10 (`PG_POOL_MAX`) |
| connectionTimeoutMillis | 5000 |
| statement_timeout | 15000 |
| lock_timeout | 5000 |
| idle_in_transaction_session_timeout | 30000 |

## Indexes added (2026-08-12)

- `idx_orders_payment_created (payment_status, created_at DESC)`
- `idx_orders_status_created (status, created_at DESC)`
- `idx_orders_metadata_gin (metadata jsonb_path_ops)`
- `idx_customers_email_lower (lower(email))`
- webhook/SMS supporting indexes

## Query improvements (app)

- Dashboard: SQL aggregates instead of full orders select
- Admin products/orders: hard limits
- FK columns already indexed (audit found 0 missing FK indexes)

## N+1 / scans

Current data volume is tiny (21 orders). Primary risk was unbounded dashboard select — fixed in app code.

## Monitoring

- `scripts/db-monitor.sql`
- `GET /api/health` (dbLatencyMs, pool, requiredTables)

## Before / after

| Path | Before | After |
|------|--------|-------|
| Dashboard orders read | all rows | aggregates |
| Runaway SQL | until PG default | ≤15s |
| Callback double-stock race | possible | blocked by unpaid→paid claim |
