# Payment Database Audit

## Records

Orders store payment state on `orders.payment_status` + `orders.metadata` (provider refs, `confirmation_sent_at`, `moolre_*`, `paystack_reference`).

## Integrity rules enforced in app

- Amount match on Moolre callback
- Already-paid short-circuit
- Confirmation claim flag to prevent duplicate SMS/email
- Admin mark-paid route for manual recovery

## Gaps

- No separate `payment_attempts` / `webhook_events` tables yet — consider adding for full reconciliation at scale
- Hubtel: not present
