# FULL SYSTEM AUDIT — Jane's Luxe

**Date:** 2026-08-02  
**Branch:** `staging/plain-postgres`  
**Staging:** https://janesluxe-staging.169-58-8-203.sslip.io

## Baseline (before repairs)

| Check | Status |
|-------|--------|
| Git | Clean on `staging/plain-postgres` |
| Stack | Next.js 15 + `pg` + Supabase-compat shim |
| Hubtel | Not implemented |
| Visible bug | Admin order detail: "Failed to load order details" |
| Auth smell | Many routes required `SUPABASE_SERVICE_ROLE_KEY` even with `DATABASE_URL` |

## Architecture summary

- **DB:** Plain Postgres via `DATABASE_URL`, singleton pool (`lib/db/pool.ts`)
- **Query layer:** PostgREST-compatible builder (`lib/db/supabase-compat.ts`) + FK map
- **Auth:** Custom JWT against `auth.users` / `profiles.role`
- **Payments:** Moolre (primary), Paystack (legacy routes), no Hubtel
- **SMS:** Moolre Open SMS API (`lib/notifications.ts`)

## Root causes repaired

1. Nested embeds used the root query table for FK resolution → order detail 500/404
2. Hard service-role env checks broke plain-Postgres deployments
3. Branch on/off existed on `/admin/branches` but not in the header switcher
4. Confirmation notifications could double-send on callback+verify race
5. `lib/notifications.ts` used browser Supabase client on the server
6. Sitemap / maintenance mode ignored plain-Postgres configuration

## Pages audited

| Area | Count | Notes |
|------|-------|-------|
| Store pages | 33 | Mapped; data via storefront APIs / client shims |
| Admin pages | 35 | Auth via middleware + `requireAdmin` |
| Order detail | Fixed | Nested embed + number coercion |
| Branches | Enhanced | Toggle switches in switcher + branches page |

## Remaining risks / manual actions

- Provision `store_janesluxe` on VPS if not already attached to Coolify env
- Ensure Coolify has `DATABASE_URL`, `AUTH_JWT_SECRET`, `MOOLRE_*`, `NEXT_PUBLIC_APP_URL`
- Point `NEXT_PUBLIC_SUPABASE_URL` at the app origin for `/rest` + `/auth` shims
- Register Moolre callback URL with `?key=`
- Redeploy staging after push
- Hubtel not in codebase — N/A unless product decides to add it

## Production readiness

**Ready after listed manual actions** (env + redeploy + smoke test order detail + branch toggle + one staging payment).
