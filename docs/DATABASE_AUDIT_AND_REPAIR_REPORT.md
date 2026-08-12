# Database Audit and Repair Report

**Date:** 2026-08-12  
**Connected database:** `janesluxe` on `fleet-postgres` (host obscured)  
**App URL:** https://www.janesluxe.com  
**Environment note:** Coolify app `janesluxe-app` uses this DB. Staging Coolify app was previously removed — treat as production data with staging-level caution.

## Architecture

| Item | Value |
|------|-------|
| PostgreSQL | 16.14 |
| Access | `pg` Pool (`lib/db/pool.ts`) + PostgREST-compat (`lib/db/supabase-compat.ts`) |
| Auth | Custom `auth.users` + JWT (`lib/db/auth.ts`, `/auth/v1`) |
| Migrations | SQL files under `supabase/migrations/` (manual apply; now tracked in `schema_migrations`) |
| ORM | None (raw SQL + compat query builder) |

## Baseline (pre-repair)

- 47 public tables + `auth.users`
- Branch inventory triggers present
- No orphans on order_items / branch_inventory / profiles
- 21 orders (7 paid), 11 products, 5 customers
- `orders.currency` default was `USD` (data already GHS)
- No `payment_webhook_events` / `schema_migrations`
- `mark_order_paid` could re-enter stock reduction under concurrency
- Paystack failure path could overwrite `paid` → `failed`

## Schema drift summary

| Object | Code | Migration | Actual DB | Problem | Repair |
|--------|------|-----------|-----------|---------|--------|
| Core commerce tables | expected | present | present | none | — |
| `payment_webhook_events` | needed for idempotency | missing | missing | no event dedup table | **created** |
| `sms_delivery_log` | optional | missing | missing | SMS not persisted | **created** |
| `schema_migrations` | needed | missing | missing | no apply tracking | **created** |
| `orders.currency` default | GHS in inserts | USD default | USD default | wrong default | **SET DEFAULT GHS** |
| Amount CHECKs | expected | partial | missing | negative money possible | **added** |
| `mark_order_paid` | idempotent | old | racey | double stock risk | **replaced** |
| Hubtel tables | N/A | N/A | N/A | not in product | — |

## Integrity scan results

| Check | Result |
|-------|--------|
| Orphan order_items | 0 |
| Orphan branch_inventory | 0 |
| Profiles without auth.users | 0 |
| Duplicate order_numbers | 0 |
| Duplicate customer emails | 0 |
| Products without branch_inventory | 0 |
| Paid with total ≤ 0 | 0 |
| Missing FK indexes | 0 |

## Repairs completed

1. Applied `20260812000000_database_integrity_hardening.sql` (backup under `/data/fleet/backups/janesluxe-pre-integrity-*`)
2. Idempotent `mark_order_paid(text, text)`
3. Payment webhook event recording in Moolre/Paystack callbacks
4. Paystack delayed-failure cannot overwrite paid
5. Pool timeouts (app code) + health required-table check
6. Prior freeze/stability API fixes included in deploy batch

## Remaining / intentional

- Payments still live primarily on `orders` + `metadata` (no separate payment_attempts ledger) — webhook events now complement this
- SMS log table created; send path not yet writing rows (optional follow-up)
- RLS policies exist as legacy artifacts but are disabled; authorization is app-layer (`requireAdmin` / ownership)
- Hubtel not implemented

## Security notes

- App DB role is `janesluxe` (not superuser for routine queries; migrations applied as postgres)
- No credentials logged
- Callback secrets remain env-only
