# Migration Status Report

## Tooling

- Files: `supabase/migrations/*.sql`
- Apply method: `psql` as postgres into `janesluxe` (not Supabase CLI remote)
- Tracking table: `public.schema_migrations` (added 2026-08-12)

## Applied (known)

| Version | Notes |
|---------|-------|
| `20260209000000_complete_schema` | Baseline schema (historical) |
| `20260611000000_multi_branch` | Branches + inventory |
| `20260612000000_assign_all_stock_to_madina` | Stock assignment |
| `20260618000000_add_product_variants_sort_order` | Variant sort |
| `20260802000000_restore_branch_inventory_triggers` | Trigger restore |
| `20260812000000_database_integrity_hardening` | **Applied 2026-08-12** — constraints, webhook/SMS tables, idempotent mark_order_paid |

## Pending

None for this pass.

## Destructive operations in latest migration

- None that drop tables/columns
- Function `mark_order_paid(text,text)` **replaced** (behavior-compatible + safer)
- Check constraints added (validated against current data first — all non-negative)

## Rollback notes

1. Restore from `/data/fleet/backups/janesluxe-pre-integrity-*`
2. Or reverse manually: drop new tables/indexes/constraints; restore prior function body from backup `schema.sql`

## Deployment order

1. Apply SQL migration (done on DB)
2. Deploy application code that uses `payment_webhook_events`
3. Verify `/api/health` reports requiredTables ok
