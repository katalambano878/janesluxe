# Freezing and Loading Baseline

**Project:** Jane's Luxe (`janesluxe`)  
**Date:** 2026-08-12  
**Git HEAD at audit start:** `34f7d99` (pre-stability repairs)  
**Environment note:** Repo tracks `main` against production Coolify app `janesluxe-app`. Staging Coolify app was previously removed. Measurements below are from the live VPS / DB unless marked local. **No deploy performed for this audit pass.**

## Architecture snapshot

| Layer | Implementation |
|-------|----------------|
| Framework | Next.js 15 App Router, React 19 |
| Database | Plain PostgreSQL via `pg` Pool (`lib/db/pool.ts`) + PostgREST-compat (`lib/db/supabase-compat.ts`) |
| Auth | JWT (`AUTH_JWT_SECRET`) + `profiles.role`; admin cookies `sb-<ref>-access-token` |
| Payments | Moolre + Paystack (no Hubtel code in repo) |
| SMS | Moolre VAS API (`lib/notifications.ts`) |
| Deploy | Coolify / nixpacks on big-vps (`fleet deploy janesluxe-app`) |

## Server / DB baseline (VPS, read-only)

| Metric | Value |
|--------|-------|
| Host RAM | 94 Gi total, ~19 Gi used, ~74 Gi available |
| Load average | ~11–13 (busy shared host) |
| DB `janesluxe` connections | 1 active at sample time |
| Orders / products / customers | 21 / 11 / 5 |
| Pool config (code, pre-fix) | `max=10`, idle 30s, **no** statement/lock/connect timeouts |
| Maintenance status API | ~1.0s round-trip via docker wget |

## Application baseline symptoms (pre-fix)

| Symptom | Observed cause |
|---------|----------------|
| Admin shell "Loading Admin…" forever | `/api/admin/me` fetch had no timeout; pathname-triggered re-auth |
| Dashboard never finishes when branches hang | `AdminBranchContext` fetch had no timeout; dashboard waited on `branchLoading` |
| Dashboard slows as orders grow | `/api/admin/dashboard` selected **all** orders |
| Roles page infinite spinner | `setLoading(false)` skipped on fetch error |
| Products empty / 500 | Unsupported `product_variants(count)` embed (fixed earlier in `cce9c2d`) |
| Payment callback slow / retries | Callbacks **awaited** SMS/email before HTTP 200 |
| Middleware stalls | Maintenance check fetch had no timeout |
| Pool exhaustion risk | No `statement_timeout` / `connectionTimeoutMillis` |

## Route inventory (counts)

| Category | Count (approx) |
|----------|----------------|
| Admin pages (`app/admin/**/page.tsx`) | 35 |
| API routes (`app/api/**/route.ts`) | 62+ |
| Payment callback/verify routes | 6 |
| Health endpoint (pre-fix) | none → added `/api/health` |

## Browser / client baseline

- **89** admin `fetch()` calls with **0** AbortSignal/timeout before repair.
- No `app/admin/error.tsx` or `loading.tsx` before repair.
- Several pages still used browser `@/lib/supabase` against the app REST shim (layout modules/settings, roles, customer-insights, notifications).

## Targets after repair (for re-measure post-deploy)

| Flow | Target |
|------|--------|
| Admin shell auth | < 3s or timed-out error ≤ 15s with Retry |
| Dashboard API | < 2s on current data size (aggregates only) |
| DB connection acquire | ≤ 5s (`connectionTimeoutMillis`) |
| Statement timeout | 15s default |
| Moolre / SMS HTTP | 12s / 10s hard abort |
| Callback HTTP ack | after DB mark-paid only (notify async) |
