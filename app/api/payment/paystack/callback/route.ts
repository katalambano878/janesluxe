import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Paystack Webhook Handler
 * Docs: https://paystack.com/docs/payments/webhooks
 *
 * Paystack sends events as:
 * {
 *   event: "charge.success",
 *   data: {
 *     id, reference, amount, currency, status, paid_at,
 *     customer: { email, ... },
 *     metadata: { order_number, ... },
 *     ...
 *   }
 * }
 *
 * Signature is sent in `x-paystack-signature` header as
 * HMAC SHA512 hex digest of the raw body using PAYSTACK_SECRET_KEY.
 */

export async function POST(req: Request) {
    console.log('[Paystack Callback] POST received at', new Date().toISOString());

    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`callback:${clientId}`, RATE_LIMITS.callback);

        if (!rateLimitResult.success) {
            console.warn('[Paystack Callback] Rate limited:', clientId);
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) {
            console.error('[Paystack Callback] PAYSTACK_SECRET_KEY not configured');
            return NextResponse.json({ success: false, message: 'Server configuration error' }, { status: 500 });
        }

        // Read raw body for signature verification (must hash exact bytes)
        const rawBody = await req.text();

        // ============================================================
        // SECURITY: Verify Paystack signature
        // ============================================================
        const signature = req.headers.get('x-paystack-signature') || '';
        const expectedSignature = crypto
            .createHmac('sha512', secretKey)
            .update(rawBody)
            .digest('hex');

        if (!signature || signature !== expectedSignature) {
            console.error('[Paystack Callback] Invalid signature. Got:',
                signature.substring(0, 12) + '...', '| Expected:',
                expectedSignature.substring(0, 12) + '...');
            return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 401 });
        }

        let body: any = {};
        try {
            body = JSON.parse(rawBody);
        } catch {
            console.error('[Paystack Callback] Invalid JSON body');
            return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
        }

        const event = body.event;
        const data = body.data || {};

        console.log('[Paystack Callback] Event:', event, '| Reference:', data.reference, '| Status:', data.status);

        // We only care about successful charges. Other events (refunds, etc.)
        // can be added later if needed.
        if (event !== 'charge.success') {
            return NextResponse.json({ success: true, message: 'Event ignored' });
        }

        // Strip retry suffix to recover the original order number
        const rawRef = data.reference || '';
        const merchantOrderRef = rawRef.replace(/-R\d+$/, '') || data.metadata?.order_number;

        if (!merchantOrderRef) {
            console.error('[Paystack Callback] Missing order reference. Reference:', rawRef);
            return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
        }

        // Status check — Paystack uses "success" for completed payments
        const isSuccess = String(data.status).toLowerCase() === 'success';

        if (!isSuccess) {
            console.log(`[Paystack Callback] Charge not successful for ${merchantOrderRef} | Status: ${data.status}`);

            const { data: failedOrder } = await supabaseAdmin
                .from('orders')
                .select('metadata')
                .eq('order_number', merchantOrderRef)
                .single();

            await supabaseAdmin
                .from('orders')
                .update({
                    payment_status: 'failed',
                    metadata: {
                        ...(failedOrder?.metadata || {}),
                        paystack_reference: rawRef,
                        failure_reason: data.gateway_response || 'Payment failed',
                        failed_at: new Date().toISOString(),
                    }
                })
                .eq('order_number', merchantOrderRef);

            return NextResponse.json({ success: false, message: 'Payment not successful' });
        }

        console.log(`[Paystack Callback] Payment SUCCESS for Order ${merchantOrderRef}`);

        const { data: existingOrder, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, total, email, metadata')
            .eq('order_number', merchantOrderRef)
            .single();

        if (fetchError || !existingOrder) {
            console.error('[Paystack Callback] Order not found:', merchantOrderRef);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        // Idempotent: already paid
        if (existingOrder.payment_status === 'paid') {
            console.log('[Paystack Callback] Order already paid, skipping:', merchantOrderRef);
            return NextResponse.json({ success: true, message: 'Order already processed' });
        }

        // ============================================================
        // SECURITY: Verify amount matches — REJECT if mismatch.
        // Paystack returns amount in kobo, our DB total is in GHS.
        // ============================================================
        if (data.amount !== undefined && data.amount !== null) {
            const paidAmount = Number(data.amount) / 100; // kobo -> GHS
            const expectedAmount = Number(existingOrder.total);
            if (Math.abs(paidAmount - expectedAmount) > 0.01) {
                console.error('[Paystack Callback] AMOUNT MISMATCH — REJECTING! Expected:', expectedAmount, 'Got:', paidAmount, 'Order:', merchantOrderRef);
                return NextResponse.json({
                    success: false,
                    message: 'Payment amount does not match order total'
                }, { status: 400 });
            }
        }

        // Mark order as paid via shared RPC (uses generic moolre_ref slot for back-compat)
        const { data: orderJson, error: updateError } = await supabaseAdmin
            .rpc('mark_order_paid', {
                order_ref: merchantOrderRef,
                moolre_ref: String(rawRef)
            });

        if (updateError) {
            console.error('[Paystack Callback] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
        }

        if (!orderJson) {
            console.error('[Paystack Callback] Order not found after RPC:', merchantOrderRef);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        // Annotate metadata so we know which gateway processed this
        try {
            await supabaseAdmin
                .from('orders')
                .update({
                    metadata: {
                        ...(orderJson.metadata || {}),
                        payment_provider: 'paystack',
                        paystack_reference: rawRef,
                        paystack_transaction_id: data.id,
                        paystack_channel: data.channel,
                        paystack_paid_at: data.paid_at,
                    }
                })
                .eq('id', orderJson.id);
        } catch (annotateErr: any) {
            console.warn('[Paystack Callback] Metadata annotate failed:', annotateErr.message);
        }

        console.log('[Paystack Callback] Order updated! ID:', orderJson.id, '| Status:', orderJson.status);

        try {
            if (orderJson.email) {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total
                });
            }
        } catch (statsError: any) {
            console.error('[Paystack Callback] Customer stats failed:', statsError.message);
        }

        try {
            console.log('[Paystack Callback] Sending notifications for:', orderJson.order_number);
            await sendOrderConfirmation(orderJson);
            console.log('[Paystack Callback] Notifications sent!');
        } catch (notifyError: any) {
            console.error('[Paystack Callback] Notification failed:', notifyError.message);
        }

        return NextResponse.json({ success: true, message: 'Payment verified and order updated' });

    } catch (error: any) {
        console.error('[Paystack Callback] Critical Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Paystack callback endpoint ready',
        timestamp: new Date().toISOString()
    });
}
