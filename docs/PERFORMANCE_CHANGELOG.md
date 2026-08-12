# Performance Changelog

**Date:** 2026-08-12  
**Deploy:** intentionally **not** performed.

## Files / modules changed

### Core infrastructure
- `lib/http.ts` *(new)* — timed fetch helpers
- `lib/db/pool.ts` — connect/statement/lock/idle-in-tx timeouts; `withClient` / `withTransaction` / `getPoolStats`
- `app/api/health/route.ts` *(new)*
- `scripts/db-monitor.sql` *(new)*
- `middleware.ts` — maintenance fetch 3s timeout

### Admin APIs
- `app/api/admin/dashboard/route.ts` — SQL aggregates (no full orders dump)
- `app/api/admin/modules/route.ts` — GET list
- `app/api/admin/settings/route.ts` *(new)*
- `app/api/admin/roles/route.ts` *(new)*
- `app/api/admin/products/route.ts` — limit clamp
- `app/api/admin/orders/route.ts` — list limit clamp

### Admin UI
- `app/admin/layout.tsx` — mount-once timed auth, modules/settings APIs, retry UI
- `app/admin/page.tsx` — consume aggregates; timeout + error banner
- `app/admin/roles/page.tsx` — API-backed; loading finally
- `app/admin/customer-insights/page.tsx` — customers API
- `app/admin/support/knowledge-base/page.tsx` — debounced search
- `app/admin/error.tsx` / `loading.tsx` *(new)*
- `context/AdminBranchContext.tsx` — timed fetch + abort

### Payments / SMS
- `lib/moolre.ts` — 12s abort
- `lib/notifications.ts` — SMS 10s abort
- `app/api/payment/moolre/callback/route.ts` — async notify
- `app/api/payment/paystack/callback/route.ts` — async notify

### Docs
- `docs/FREEZING_AND_LOADING_BASELINE.md`
- `docs/FREEZING_AND_LOADING_AUDIT.md`
- `docs/DATABASE_PERFORMANCE_AND_LOCK_REPORT.md`
- `docs/ADMIN_DASHBOARD_STABILITY_REPORT.md`
- `docs/EXTERNAL_SERVICE_TIMEOUT_REPORT.md`
- `docs/PERFORMANCE_CHANGELOG.md`
- `docs/WEBSITE_STABILITY_CHECKLIST.md`

## Indexes added

None (dataset small; avoid blind indexes).

## Timeouts added

| Surface | Timeout |
|---------|---------|
| Admin auth / branches / dashboard fetch | 15–20s |
| PG connect | 5s |
| PG statement | 15s |
| PG lock | 5s |
| Moolre | 12s |
| SMS | 10s |
| Middleware maintenance | 3s |

## Error boundaries

- `app/admin/error.tsx`
- Dashboard + layout retry UIs

## Tests added

- No automated suite in this pass (health endpoint + SQL monitor script).

## Before / after (expected once deployed)

| Metric | Before | After |
|--------|--------|-------|
| Admin auth hang | infinite | ≤15s then Retry |
| Dashboard orders payload | O(n) all rows | O(1) aggregates + 5 recent |
| Callback notify blocking | yes | no |
| Pool runaway query | until server default | ≤15s statement_timeout |
