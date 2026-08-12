# External Service Timeout Report

**Date:** 2026-08-12  
**Hubtel:** not present in this codebase.

## Moolre payment

| Item | Value |
|------|-------|
| Client | `lib/moolre.ts` |
| Timeout | **12s** (`AbortSignal.timeout(12000)`) on link, status, list |
| Retry | None automatic on auth/validation failures |
| Idempotency | Order `payment_status === 'paid'` short-circuit; `mark_order_paid` RPC |
| Callback | `/api/payment/moolre/callback` — verify status, amount match, mark paid, **notify async** |
| Blocks admin dashboard load? | **No** |
| Blocks callback ack? | **No** (after repair) — SMS/email fire-and-forget |

## Paystack payment

| Item | Value |
|------|-------|
| Routes | `app/api/payment/paystack/*` |
| Timeout | Relies on underlying `fetch` — recommend aligning to 12s on next pass if any raw fetch remains without signal |
| Idempotency | Already-paid short-circuit in callback/verify |
| Callback notify | **Async** after repair |
| Blocks admin dashboard? | **No** |

## Moolre SMS

| Item | Value |
|------|-------|
| Client | `sendSMS` in `lib/notifications.ts` |
| Timeout | **10s** |
| Duplicate prevention | `confirmation_sent_at` claim on order metadata before send |
| Retry | Manual / campaign loops only; no unbounded auto-retry |
| Blocks callbacks? | **No** (async from callback) |
| Blocks pages? | Campaign `/api/notifications` still sends sequentially (admin-triggered only) |

## Email (Resend)

| Item | Value |
|------|-------|
| Used in | `sendOrderConfirmation` |
| From callbacks | Fire-and-forget |
| Timeout | Provider SDK default — wrap if hangs observed |

## Middleware maintenance probe

| Item | Value |
|------|-------|
| Timeout | **3s** |
| On failure | Treat as not in maintenance (fail open for storefront) |

## Shared helper

`lib/http.ts` → `fetchWithTimeout` / `TimeoutError` / `readJsonSafe` for app + admin UI.
