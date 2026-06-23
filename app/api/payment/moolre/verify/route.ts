import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { isMoolreConfigured, moolreCheckStatus } from '@/lib/moolre';

/**
 * Moolre payment verification endpoint.
 * Called from the order-success page after the customer is redirected back.
 *
 * SECURITY: payment is only trusted from Moolre's status API, never the
 * redirect query string.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`verify:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        const { orderNumber } = await req.json();

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        if (!/^ORD-\d+-\d+$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        if (!isMoolreConfigured()) {
            console.error('[Moolre Verify] Missing Moolre credentials');
            return NextResponse.json({ success: false, message: 'Payment verification unavailable' }, { status: 503 });
        }

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, phone, shipping_address, metadata, payment_method')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            console.error('[Moolre Verify] Order not found:', orderNumber);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid',
            });
        }

        if (order.payment_method && order.payment_method !== 'moolre') {
            return NextResponse.json({ success: false, message: 'This order does not use Moolre payment' }, { status: 400 });
        }

        // Try the saved attempt reference first, then the plain order number.
        const refsToTry: string[] = [];
        if (order.metadata?.moolre_externalref) refsToTry.push(order.metadata.moolre_externalref);
        if (!refsToTry.includes(orderNumber)) refsToTry.push(orderNumber);

        let verified: Awaited<ReturnType<typeof moolreCheckStatus>> | null = null;
        let verifiedRef: string | null = null;

        for (const ref of refsToTry) {
            const status = await moolreCheckStatus(ref);
            if (status.paid) {
                // Verify amount matches the order total when Moolre returns one.
                if (status.amount !== undefined && !Number.isNaN(status.amount)) {
                    const expected = Number(order.total);
                    if (Math.abs(status.amount - expected) > 0.01) {
                        console.error('[Moolre Verify] AMOUNT MISMATCH! Expected:', expected, 'Got:', status.amount);
                        continue;
                    }
                }
                verified = status;
                verifiedRef = ref;
                break;
            }
        }

        if (!verified) {
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider',
            });
        }

        const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: orderNumber,
            moolre_ref: String(verifiedRef || verified.transactionId || 'moolre-verify'),
        });

        if (updateError) {
            console.error('[Moolre Verify] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        try {
            await supabaseAdmin
                .from('orders')
                .update({
                    metadata: {
                        ...(orderJson?.metadata || {}),
                        payment_provider: 'moolre',
                        moolre_externalref: verifiedRef,
                        moolre_transaction_id: verified.transactionId,
                        moolre_paid_at: verified.paidAt,
                    },
                })
                .eq('order_number', orderNumber);
        } catch (annotateErr: any) {
            console.warn('[Moolre Verify] Metadata annotate failed:', annotateErr.message);
        }

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            } catch (statsError: any) {
                console.error('[Moolre Verify] Customer stats failed:', statsError.message);
            }
        }

        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
            } catch (notifyError: any) {
                console.error('[Moolre Verify] Notification failed:', notifyError.message);
            }
        }

        return NextResponse.json({
            success: true,
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated',
        });
    } catch (error: any) {
        console.error('[Moolre Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Moolre verify endpoint ready', timestamp: new Date().toISOString() });
}
