# Performance Report — Jane's Luxe

## Findings

| Area | Issue | Fix / note |
|------|-------|------------|
| Nested embeds | Wrong table context caused failed order detail queries + retries | Fixed in `supabase-compat` |
| Admin auth | Duplicate token extraction per route | Centralized `requireAdmin` |
| Pool | Singleton `pg` pool, `PG_POOL_MAX` default 10 | OK for single container |
| Dashboard | Loads all orders into memory for stats | Acceptable at current volume; paginate later |
| Maintenance check | Hosted REST / self-fetch | Prefer `MAINTENANCE_MODE` env |

## Recommendations

- Add indexes on `orders(order_number)`, `orders(branch_id, created_at)`, `branch_inventory(branch_id, quantity)` if missing in live DB
- Paginate admin orders list (already ordered; ensure limit on UI)
- Avoid N+1 by keeping embeds (now correct) instead of per-item image fetches
