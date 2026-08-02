# Jane's Luxe — Supabase → Plain PostgreSQL Migration Guide

## Architecture

| Layer | Implementation |
|-------|----------------|
| DB access | `pg` pool (`lib/db/pool.ts`) + PostgREST-compat (`lib/db/supabase-compat.ts`) |
| Mode switch | `DATABASE_URL` / `POSTGRES_URL` → plain Postgres (`lib/db/mode.ts`) |
| Auth | JWT via `jose` + `auth.users` bcrypt (`lib/db/auth.ts`); cookies `sb-<ref>-access-token` |
| Admin gate | Shared `requireAdmin()` / `verifyAuth()` in `lib/auth.ts` |
| Storage | Local disk via `lib/db/storage.ts` + `/storage/v1/*` routes |
| Browser client | `@supabase/supabase-js` pointed at app URL shims (`/rest/v1`, `/auth/v1`) |

## Env mapping

| Legacy Supabase | Plain Postgres |
|-----------------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | App origin (e.g. `https://www.janesluxe.com`) for shims |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Any non-empty anon placeholder for the browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Not required when `DATABASE_URL` is set |
| — | `DATABASE_URL=postgresql://…/store_janesluxe` |
| — | `AUTH_JWT_SECRET` |
| — | `MOOLRE_CALLBACK_SECRET`, `MOOLRE_SMS_API_KEY` |

See `.env.example`.

## Critical fixes (2026-08)

1. **Nested PostgREST embeds** — `resolveEmbeds` now passes the related table through nesting. Fixes admin order detail (`orders → order_items → products → product_images`).
2. **Admin/storefront auth gates** — removed hard `SUPABASE_SERVICE_ROLE_KEY` requirement; use `isSupabaseAdminConfigured`.
3. **Branch open/close** — toggles in header switcher + `/admin/branches`.
4. **Confirmation SMS/email dedup** — `metadata.confirmation_sent_at` claim in `sendOrderConfirmation`.
5. **Notifications** — server queries use `supabaseAdmin`, not the browser client.

## Verification checklist

- [ ] Admin login works with `DATABASE_URL` only
- [ ] `/admin/orders/[id]` loads items + images
- [ ] Branch toggle updates `branches.is_active` and storefront hides closed branches
- [ ] Moolre callback `POST /api/payment/moolre/callback?key=…` marks paid once
- [ ] Duplicate callback does not resend SMS
- [ ] Production build succeeds
