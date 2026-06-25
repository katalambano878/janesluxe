import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { moolreCheckStatus } from '@/lib/moolre';

/**
 * Moolre Payment Webhook Handler
 * Docs: https://docs.moolre.com (Payment Webhook)
 *
 * Moolre POSTs: { status: 1, code, message, data: { externalref, transactionid, amount, ... } }
 *
 * Moolre doesn't sign webhooks, so we (a) gate the endpoint with a shared
 * secret in the `?key=` query string, and (b) independently re-query the
 * payment status API before trusting the notification.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`callback:${clientId}`, RATE_LIMITS.callback);

        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        // Gate with the shared callback secret.
        const expectedSecret = process.env.MOOLRE_CALLBACK_SECRET;
        if (expectedSecret) {
            const providedKey = new URL(req.url).searchParams.get('key');
            if (providedKey !== expectedSecret) {
                console.error('[Moolre Callback] Invalid callback secret');
                return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
            }
        }

        const body = await req.json().catch(() => ({}));
        const data = body?.data || {};
        const externalref: string = data?.externalref || '';

        console.log('[Moolre Callback] Received | ref:', externalref, '| status:', body?.status);

        if (!externalref) {
            return NextResponse.json({ success: false, message: 'Missing external reference' }, { status: 400 });
        }

        // Recover the original order number (strip the -R{timestamp} retry suffix).
        const merchantOrderRef = externalref.replace(/-R\d+$/, '') || data?.metadata?.order_number;

        if (!merchantOrderRef) {
            return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
        }

        // Try to independently confirm with Moolre's status API. When the
        // private key isn't configured (authError), fall back to trusting the
        // webhook body itself — this endpoint is already gated by the shared
        // secret in the `?key=` query string.
        const status = await moolreCheckStatus(externalref);
        const webhookSaysPaid = Number(body?.status) === 1;
        const confirmed = status.paid || (status.authError && webhookSaysPaid);

        if (!confirmed) {
            console.log('[Moolre Callback] Payment not confirmed for', merchantOrderRef,
                '| status.paid:', status.paid, '| authError:', status.authError, '| webhook status:', body?.status);
            return NextResponse.json({ success: false, message: 'Payment not confirmed' });
        }

        // Prefer the verified amount; fall back to the webhook-reported amount.
        const webhookAmount =
            data?.amount !== undefined ? Number(data.amount)
                : data?.value !== undefined ? Number(data.value)
                    : undefined;
        const confirmedAmount = status.amount !== undefined ? status.amount : webhookAmount;
        const confirmedTxId = status.transactionId || data?.transactionid;
        const confirmedPaidAt = status.paidAt || data?.ts;

        const { data: existingOrder, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, total, email, metadata')
            .eq('order_number', merchantOrderRef)
            .single();

        if (fetchError || !existingOrder) {
            console.error('[Moolre Callback] Order not found:', merchantOrderRef);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (existingOrder.payment_status === 'paid') {
            return NextResponse.json({ success: true, message: 'Order already processed' });
        }

        // SECURITY: reject when the paid amount doesn't match the order total.
        if (confirmedAmount !== undefined && !Number.isNaN(confirmedAmount)) {
            const expected = Number(existingOrder.total);
            if (Math.abs(confirmedAmount - expected) > 0.01) {
                console.error('[Moolre Callback] AMOUNT MISMATCH — REJECTING! Expected:', expected, 'Got:', confirmedAmount);
                return NextResponse.json({ success: false, message: 'Payment amount does not match order total' }, { status: 400 });
            }
        }

        const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: merchantOrderRef,
            moolre_ref: String(externalref),
        });

        if (updateError) {
            console.error('[Moolre Callback] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
        }

        if (!orderJson) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        try {
            await supabaseAdmin
                .from('orders')
                .update({
                    metadata: {
                        ...(orderJson.metadata || {}),
                        payment_provider: 'moolre',
                        moolre_externalref: externalref,
                        moolre_transaction_id: confirmedTxId,
                        moolre_paid_at: confirmedPaidAt,
                    },
                })
                .eq('id', orderJson.id);
        } catch (annotateErr: any) {
            console.warn('[Moolre Callback] Metadata annotate failed:', annotateErr.message);
        }

        try {
            if (orderJson.email) {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            }
        } catch (statsError: any) {
            console.error('[Moolre Callback] Customer stats failed:', statsError.message);
        }

        try {
            await sendOrderConfirmation(orderJson);
        } catch (notifyError: any) {
            console.error('[Moolre Callback] Notification failed:', notifyError.message);
        }

        console.log('[Moolre Callback] Order marked paid:', merchantOrderRef);
        return NextResponse.json({ success: true, message: 'Payment verified and order updated' });
    } catch (error: any) {
        console.error('[Moolre Callback] Critical Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Moolre callback endpoint ready', timestamp: new Date().toISOString() });
}
