# Database Performance and Lock Report

**Date:** 2026-08-12  
**Database:** `janesluxe` on `fleet-postgres` (plain Postgres)

## Connection architecture

```
Next.js route handlers
  → supabaseAdmin / createClient (supabase-compat)
    → getPool() singleton (lib/db/pool.ts)
      → PostgreSQL
```

Single shared `pg.Pool` per Node process. No Prisma/Drizzle.

## Pool configuration (after repair)

| Setting | Value | Env override |
|---------|-------|--------------|
| `max` | 10 | `PG_POOL_MAX` |
| `idleTimeoutMillis` | 30000 | — |
| `connectionTimeoutMillis` | 5000 | `PG_CONNECT_TIMEOUT_MS` |
| `statement_timeout` | 15000 ms (per connection) | `PG_STATEMENT_TIMEOUT_MS` |
| `lock_timeout` | 5000 ms | `PG_LOCK_TIMEOUT_MS` |
| `idle_in_transaction_session_timeout` | 30000 ms | `PG_IDLE_IN_TX_MS` |

Helpers added: `withClient`, `withTransaction`, `getPoolStats`.

## Connection leaks

- Pre-fix: no evidence of per-request `new Pool()` (only one pool factory).
- Risk was **held connections** via runaway queries without statement timeout — mitigated.
- Transactions: app mostly uses single queries; payment mark-paid uses RPC (server-side function).

## Locks / idle transactions (baseline sample)

At sample time: 1 active connection, no idle-in-transaction, no blockers.  
Monitor with: `scripts/db-monitor.sql`.

## Slow / dangerous query patterns

| Pattern | Route | Repair |
|---------|-------|--------|
| `SELECT` all orders | `/api/admin/dashboard` | SQL aggregates + 7-day chart group-by |
| Unbounded products embed graph | `/api/admin/products` | `limit` default 500 / max 1000 |
| Unbounded orders list | `/api/admin/orders` | `limit` default 200 / max 500 |
| Browser full `profiles` + `orders` | customer-insights | Admin customers API capped |
| `(count)` PostgREST embed | products (historical) | Count via `product_variants(id).length` |

## Timeouts

| Layer | Timeout |
|-------|---------|
| Pool connect | 5s |
| Statement | 15s |
| Lock | 5s |
| Idle-in-tx | 30s |

Timed-out queries surface as DB errors → API 500 → UI error/retry (where wired).

## Indexes

Current dataset is small (21 orders). No blind indexes added. Recommended when tables grow:

- `orders (payment_status, created_at)`
- `orders (branch_id, created_at)`
- `orders (email)`
- `branch_inventory (branch_id, quantity)` partial where quantity < 10

Validate with `EXPLAIN (ANALYZE, BUFFERS)` before applying.

## Before / after (dashboard data path)

| Metric | Before | After (code) |
|--------|--------|--------------|
| Orders rows transferred to app | entire table | 0 (aggregates) + 5 recent |
| Chart computation | in browser over all orders | SQL `GROUP BY` last 7 days |
| Statement hang risk | unbounded | 15s statement_timeout |

## Health

- `GET /api/health` — app + DB ping + pool stats (no secrets).
