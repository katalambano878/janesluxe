# Freezing and Loading Audit

**Date:** 2026-08-12  
**Status:** Repairs applied in working tree; **not deployed** (per request).

## Pages inspected

All 35 admin pages under `app/admin`, storefront routes under `app/(store)`, middleware, payment/SMS libs, pool/compat layer, and major API routes.

## Infinite loading states found

| Location | Issue | Fix |
|----------|-------|-----|
| `app/admin/layout.tsx` | Auth on every `pathname`; no fetch timeout | Mount-once auth + 15s timeout + Retry UI |
| `context/AdminBranchContext.tsx` | Hang blocks dashboard | Timed fetch + abort on unmount |
| `app/admin/roles/page.tsx` | Loading never cleared on error | `finally` + `/api/admin/roles` |
| `app/admin/page.tsx` | Silent catch; all-orders payload | Aggregates API + timeout + error banner |
| `app/admin/customer-insights/page.tsx` | Full-table browser supabase | `/api/admin/customers?limit=500` |
| Knowledge-base search | Fetch every keystroke | 300ms debounce + AbortController |

## React loops found

| Issue | Status |
|-------|--------|
| Layout auth re-run on every navigation (`[pathname, router]`) | **Fixed** — mount-once |
| KB search effect tied to every keystroke | **Fixed** — debounce |
| Strict Mode double-mount | Tolerated; timed fetches + abort prevent hangs |

## Pending requests found

- Untimed admin fetches (89) → core shell/dashboard/branches/roles/insights now timed.
- Untimed Moolre/SMS/middleware fetches → hard timeouts added.
- Remaining admin pages still need gradual `fetchWithTimeout` adoption (documented as remaining risk).

## Redirect loops found

- Middleware plain-PG JWT path is OK; login page excluded.
- Payment callbacks under `/api/` excluded from maintenance/auth redirects.
- No infinite 3xx loop confirmed in middleware matcher.

## External blocking calls found

| Call site | Before | After |
|-----------|--------|-------|
| Moolre callback → `sendOrderConfirmation` | awaited | fire-and-forget |
| Paystack callback → notifications | awaited | fire-and-forget |
| Moolre HTTP | no timeout | 12s |
| SMS HTTP | no timeout | 10s |
| Middleware maintenance | no timeout | 3s |

## Root causes (confirmed)

1. Missing request timeouts on admin gate + DB pool.
2. Unbounded dashboard/list queries.
3. Loading cleanup missing on some error paths.
4. Browser Supabase assumptions after plain-PG cutover for several admin pages.
5. Payment callbacks blocked on SMS/email.
6. No admin route-level error/loading boundaries.

## Fixes applied

See `docs/PERFORMANCE_CHANGELOG.md`.

## Remaining risks

- Notifications admin page may still load customers via browser client.
- POS still uses some browser supabase for post-checkout RPC.
- Modules page may still use client supabase for initial list (PATCH already API).
- Not every admin `fetch` migrated to `fetchWithTimeout` yet.
- Full automated timeout test suite not added (manual + health endpoint only).
- Deploy required before production behavior matches this tree.
