# Website Stability Checklist

Reusable checklist for Next.js + PostgreSQL store projects.

## React / loading
- [ ] Every `setLoading(true)` has a `finally { setLoading(false) }`
- [ ] Fetch calls used for gates have hard timeouts
- [ ] Auth effects do not re-run on every pathname change
- [ ] Error + Retry UI exists for shell and major pages
- [ ] No empty `catch` that leaves loading true
- [ ] Search inputs are debounced; previous requests aborted

## API completion
- [ ] Every route handler returns or throws controlled errors
- [ ] Malformed JSON handled
- [ ] Auth failure returns 401/403 promptly
- [ ] Long secondary work (SMS/email) is not awaited on webhooks

## Database pool
- [ ] Single shared pool/client factory
- [ ] `connectionTimeoutMillis` set
- [ ] `statement_timeout` / `lock_timeout` / idle-in-tx set
- [ ] No DB access from Client Components
- [ ] Transactions never wrap external HTTP

## Queries
- [ ] Admin lists are limited / paginated
- [ ] Dashboard uses aggregates, not full-table dumps
- [ ] Indexes reviewed for hot filters (status, created_at, branch_id)
- [ ] Monitor script available (`scripts/db-monitor.sql`)

## Auth / middleware
- [ ] Login and callbacks excluded from admin auth redirects
- [ ] Payment/webhook paths not redirected to login
- [ ] Middleware external checks timed out
- [ ] Session failure → login or retry, never infinite spinner

## Payments / SMS
- [ ] Gateway timeouts configured
- [ ] Callbacks idempotent on already-paid
- [ ] Amount verification server-side
- [ ] SMS/email deduped (`confirmation_sent_at` or equivalent)
- [ ] Admin dashboard does not call payment providers on load

## Observability
- [ ] `/api/health` exists (no secrets)
- [ ] Structured logs for payment refs (no PII/secrets)
- [ ] Pool stats available when degraded

## QA
- [ ] Slow network / timeout paths tested
- [ ] Double submit tested
- [ ] Duplicate callback tested
- [ ] Production build succeeds
- [ ] Deploy only after staging verification
