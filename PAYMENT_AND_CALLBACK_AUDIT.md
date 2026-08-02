# Payment & Callback Audit — Jane's Luxe

## Gateways

| Gateway | Status |
|---------|--------|
| Moolre | Primary — init, verify, callback, reconcile |
| Paystack | Legacy routes still present |
| Hubtel | Not implemented |

## Callback routes

| Route | Auth | Amount check | Idempotent paid | Notification dedup |
|-------|------|--------------|-----------------|--------------------|
| `POST /api/payment/moolre/callback` | `?key=` + status API | Yes | Early return if paid | `confirmation_sent_at` |
| `POST /api/payment/paystack/callback` | HMAC signature | Yes (verify path) | Early return if paid | Same helper |
| Middleware | `/api/*` bypassed | — | — | — |

## Verification

- Browser redirect alone must not mark paid — server verify/callback required
- Admin "Re-verify Payment" picks Moolre vs Paystack from order metadata/method

## Manual

1. Register Moolre callback: `{APP_URL}/api/payment/moolre/callback?key={MOOLRE_CALLBACK_SECRET}`
2. Register Paystack webhook if still used
3. Smoke-test staging payment of 1 GHS
