# Admin Dashboard Stability Report

**Date:** 2026-08-12

## Shell (`app/admin/layout.tsx`)

| Concern | Result |
|---------|--------|
| Auth | Timed `/api/admin/me` (15s), once on mount |
| Failure | Retry UI (`authError`) — no infinite spinner |
| Modules | `/api/admin/modules` |
| Maintenance toggle | `/api/admin/settings` |
| Route error boundary | `app/admin/error.tsx` |
| Route loading UI | `app/admin/loading.tsx` |

## Dashboard sections (`/admin` + `/api/admin/dashboard`)

| Section | Query | Timeout | Independent fail | Error UI |
|---------|-------|---------|------------------|----------|
| KPI stats | SQL aggregates | pool 15s + fetch 20s | page-level | Yes + Retry |
| Revenue chart | SQL 7-day group | same | same | same |
| Recent orders | limit 5 | same | same | same |
| Low stock | limit 5 | same | same | same |
| Product cards | limit 4 | same | same | same |

**Note:** Sections currently share one API response. Isolation is page-level (error banner) rather than per-card Suspense. Further split with `Promise.allSettled` is a follow-up if needed.

## Branch context

| Item | Status |
|------|--------|
| Load | Timed `/api/admin/branches` |
| Abort on unmount | Yes |
| Blocks dashboard until ready | Yes (intentional for branch filter) — now cannot hang forever |

## Sidebar sections (post prior + this pass)

| Section | Data path | Notes |
|---------|-----------|-------|
| Orders | `/api/admin/orders` | Limited 200 default |
| POS | products/customers/summary APIs | Some post-checkout supabase remains |
| Products | `/api/admin/products` | Limited 500; no `(count)` embed |
| Categories | admin categories API | OK |
| Customers | `/api/admin/customers` | OK |
| Reviews | `/api/admin/reviews` | Empty table OK |
| Inventory | products + branch-inventory | OK |
| Branches | `/api/admin/branches` | OK |
| Analytics | `/api/admin/analytics` | Date-window paid orders |
| Coupons | `/api/admin/coupons` + create/edit | OK |
| Support Hub | `/api/admin/support/*` | Empty tables → empty states |
| Roles | `/api/admin/roles` | Infinite spinner fixed |
| Customer insights | customers API | No full-table supabase |
| Blog | static | N/A |
| Delivery | `/api/delivery*` | 30s polling on hub page |

## Pagination

| List | Server limit |
|------|--------------|
| Products | 500–1000 |
| Orders | 200–500 |
| Customers | 500–1000 |
| Support tickets/conversations | paginated |
| Reviews/coupons | full (small tables) |

## Test results (local code review + VPS read-only)

- Typecheck: pre-existing `implicit any` noise; no new structural blockers identified in repaired paths.
- Production deploy of this pass: **not run**.
- Manual browser E2E on post-deploy build: **pending**.
