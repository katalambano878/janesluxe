# Repair Changelog — 2026-08-02

## Bugs fixed

- Admin order details failed on nested `products → product_images` embeds (wrong parent table in compat layer)
- Admin/storefront APIs incorrectly required `SUPABASE_SERVICE_ROLE_KEY` under plain Postgres
- Access-token cookie parsing failed for hyphenated project refs
- Confirmation SMS/email could fire twice (callback + verify race)
- Server notifications queried via browser Supabase client
- Admin re-verify always hit Moolre even for Paystack orders
- Sitemap skipped dynamic URLs without service-role key

## Features

- Branch open/close toggles in admin header switcher
- Toggle switches on `/admin/branches`
- Server-side guard: cannot deactivate last active branch
- Order detail retry + clearer error message
- Numeric coercion for money fields from Postgres

## Files (high signal)

- `lib/db/supabase-compat.ts` — nested embed table context
- `lib/auth.ts` — shared `requireAdmin`, cookie fix
- `app/api/admin/orders/[id]/route.ts`, `branches/route.ts`, + 14 admin routes
- `app/api/storefront/*` — `isSupabaseAdminConfigured`
- `components/admin/AdminBranchSwitcher.tsx`
- `app/admin/branches/page.tsx`
- `lib/notifications.ts`
- `middleware.ts`, `app/sitemap.ts`, `.env.example`
- Docs: `FULL_SYSTEM_AUDIT.md`, `PAYMENT_AND_CALLBACK_AUDIT.md`, `docs/SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`, etc.

## Packages

- None added/removed
