# SMS & Payment Integration Status Report

**Last Updated:** February 5, 2026
**Status:** Fixed and Ready for Production

## 1. Overview
The SMS notification system has been updated with improved security, better error handling, and manual notification resend capability.

## 2. Required Environment Variables

### Supabase (CRITICAL)
| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations | **Yes (Add to Vercel!)** |

### Moolre SMS
| Variable | Purpose | Required |
|----------|---------|----------|
| `MOOLRE_API_KEY` | VAS Key for SMS sending | Yes |
| `MOOLRE_API_USER` | User ID (e.g., `your-username`) | Yes |
| `MOOLRE_API_PUBKEY` | Public key for payment | Yes |

### Email (Optional but Recommended)
| Variable | Purpose | Required |
|----------|---------|----------|
| `RESEND_API_KEY` | Resend API key for emails | Optional |
| `EMAIL_FROM` | Sender address for emails | Optional |
| `ADMIN_EMAIL` | Admin notification email | Optional |

### Moolre Payment
| Variable | Purpose | Required |
|----------|---------|----------|
| `MOOLRE_ACCOUNT_NUMBER` | Payment account number | Yes |
| `MOOLRE_MERCHANT_EMAIL` | Merchant email | Yes |

### App Configuration
| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_APP_URL` | Production URL (`https://example.com/`) | Yes |

## 3. Important Setup Steps

### Step 1: Add SUPABASE_SERVICE_ROLE_KEY to Vercel
1. Go to your Supabase project → Settings → API
2. Copy the `service_role` key (secret)
3. Add it to Vercel Environment Variables as `SUPABASE_SERVICE_ROLE_KEY`
4. Redeploy the application

### Step 2: Verify Moolre Callback URL
The callback URL configured during payment should be:
```
https://example.com/api/payment/moolre/callback
```

**Note:** This URL is automatically set from the `NEXT_PUBLIC_APP_URL` environment variable.

## 4. How Notifications Work

### Order Placement Flow (Moolre Payment)
1. User completes checkout → Order created with `pending` status
2. User redirected to Moolre for payment
3. After payment, Moolre calls `/api/payment/moolre/callback`
4. Callback updates order status to `paid` and triggers notifications
5. Email and SMS sent to customer

### Manual Notification Resend
If automatic notification fails:
1. Go to Admin → Orders → Select Order
2. Click "Resend Notifications" button
3. This will send email and SMS to the customer

## 5. Troubleshooting

### SMS Not Received After Order
1. Check Vercel Logs for `[Callback]` entries
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
3. Check if order has a phone number
4. Use Admin "Resend Notifications" button as backup

### Callback Not Working
1. Check that Moolre is hitting the correct callback URL
2. Look for `[Callback] Received` in Vercel logs
3. Verify the `externalref` matches order number format (`ORD-...`)

### SMS API Issues
1. Test using Admin → SMS Debugger
2. Check Moolre credentials are correct
3. Verify phone number format (should auto-format to E.164)

## 6. Security Improvements Made

1. **Admin Authentication** - Admin pages now verify user role (admin/staff)
2. **Notification API Protection** - Campaign and status updates require auth
3. **Reduced PII Logging** - Phone numbers and payment data now masked
4. **Error Messages Sanitized** - No stack traces exposed to clients

## 7. Files Modified

- `lib/notifications.ts` - Improved logging, configurable email sender
- `app/api/payment/moolre/callback/route.ts` - Better error handling
- `app/api/notifications/route.ts` - Added authentication
- `app/admin/layout.tsx` - Role-based access control
- `app/admin/orders/[id]/OrderDetailClient.tsx` - Added resend notification feature
- `app/admin/orders/page.tsx` - Auth tokens for bulk updates

## 8. Testing Checklist

- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel
- [ ] Test SMS via Admin → SMS Debugger
- [ ] Place a test order with Moolre payment
- [ ] Verify callback is received (check Vercel logs)
- [ ] Confirm SMS is received
- [ ] Test "Resend Notifications" button in order detail
