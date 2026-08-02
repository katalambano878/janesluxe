# Database Audit & Repair Report — Jane's Luxe

## Architecture

| Item | Value |
|------|-------|
| Driver | `pg` |
| Pool | Singleton, max 10 (configurable) |
| Compat | PostgREST-style via `lib/db/supabase-compat.ts` |
| FK map | `lib/db/fk-map.ts` |
| Migration history | `supabase/migrations/*.sql` + `scripts/mig-*` |

## Baseline

- Staging app on Coolify (`janesluxe-staging`, branch `staging/plain-postgres`)
- Fleet DB list at audit time did not show `store_janesluxe` — confirm Coolify `DATABASE_URL` target before cutover
- Nested embed bug confirmed as application-layer (not missing tables)

## Schema expectations (core)

`branches`, `branch_inventory`, `products`, `product_images`, `product_variants`, `categories`, `orders`, `order_items`, `profiles`, `auth.users`, `coupons`, `delivery_*`, `store_settings`, support/chat tables

## Repairs applied in app (no destructive DB migration this pass)

1. Nested embed resolution uses correct parent table at each depth
2. Money fields coerced to numbers for UI
3. Branch `is_active` updates guarded (last-active protection)
4. `confirmation_sent_at` written into order metadata for notification idempotency

## Manual DB actions

1. Confirm database name/host for Jane's Luxe staging/prod (prefer `store_janesluxe` via `sudo fleet db provision janesluxe` if missing)
2. Verify indexes: `orders(order_number)`, `orders(branch_id)`, `branch_inventory(branch_id, product_id)`
3. Ensure `mark_order_paid` RPC exists in the live DB (from complete_schema migration)
