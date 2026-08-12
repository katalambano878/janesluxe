# Payment Database Audit

## Shared model

Payments are stored on **`orders`**:
- `payment_status` enum: pending | paid | failed | refunded | partially_refunded
- `payment_method` / `payment_provider` text
- `metadata` jsonb: gateway refs, verification timestamps, `confirmation_sent_at`, `stock_reduced`
- Atomic paid transition: RPC `mark_order_paid(order_ref, moolre_ref)` — **now unpaid→paid only**

Complementary: **`payment_webhook_events`** for callback idempotency + audit.

## Moolre

| Item | Status |
|------|--------|
| Tables | orders.metadata + payment_webhook_events |
| Amount check | Callback compares confirmed amount to `orders.total` |
| Currency | GHS |
| Duplicate protection | webhook unique (gateway, event id) + already-paid short-circuit + RPC claim |
| Stock | Once via `stock_reduced` flag inside RPC |
| Notify | Async after DB success |

## Paystack

| Item | Status |
|------|--------|
| Tables | same |
| Amount | kobo/100 vs order total |
| Delayed failure | **Fixed** — cannot overwrite `paid` |
| Dedup | payment_webhook_events |

## Hubtel

Not present in codebase.

## Verification state

- Redirect/verify routes also call `mark_order_paid` (idempotent)
- Browser redirect alone must not invent paid status without verify/callback (existing pattern)
