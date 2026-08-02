# Database Performance Report

- Pool: singleton, default max 10
- Nested embeds: batched secondary queries (fixed parent context)
- Admin dashboard may load full order set — add date filters/limits as volume grows
- Suggested indexes if missing: `orders(order_number)`, `orders(created_at desc)`, `branch_inventory(branch_id, quantity)`
