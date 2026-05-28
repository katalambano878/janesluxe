import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Paystack payment verification endpoint.
 * Called from the order-success page after the customer is redirected back.
 *
 * SECURITY: We ONLY trust Paystack's API response for payment verification.
 * The redirect query string is not proof of payment.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`verify:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests' },
                { status: 429 }
            );
        }

        const { orderNumber } = await req.json();

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        if (!/^ORD-\d+-\d+$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        if (!process.env.PAYSTACK_SECRET_KEY) {
            console.error('[Paystack Verify] Missing PAYSTACK_SECRET_KEY');
            return NextResponse.json({
                success: false,
                message: 'Payment verification unavailable'
            }, { status: 503 });
        }

        console.log('[Paystack Verify] Checking payment for:', orderNumber);

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, phone, shipping_address, metadata, payment_method')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            console.error('[Paystack Verify] Order not found:', orderNumber);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            console.log('[Paystack Verify] Order already paid:', orderNumber);
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid'
            });
        }

        if (order.payment_method && order.payment_method !== 'paystack') {
            return NextResponse.json({
                success: false,
                message: 'This order does not use Paystack payment'
            }, { status: 400 });
        }

        // Build list of refs to try — saved attempt ref first, plain order number as fallback
        const refsToTry: string[] = [];
        if (order.metadata?.paystack_reference) refsToTry.push(order.metadata.paystack_reference);
        if (!refsToTry.includes(orderNumber)) refsToTry.push(orderNumber);

        let verifiedData: any = null;
        let verifiedRef: string | null = null;

        for (const ref of refsToTry) {
            if (verifiedData) break;
            try {
                console.log('[Paystack Verify] Querying Paystack with ref:', ref);

                const checkResponse = await fetch(
                    `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json',
                        }
                    }
                );

                const checkResult = await checkResponse.json();
                const data = checkResult.data || {};

                console.log('[Paystack Verify] Response for', ref, ':',
                    'API ok:', checkResult.status, '| Tx status:', data.status);

                if (checkResult.status === true && String(data.status).toLowerCase() === 'success') {
                    // Verify amount if provided (kobo -> GHS)
                    if (data.amount !== undefined && data.amount !== null) {
                        const paidAmount = Number(data.amount) / 100;
                        const expectedAmount = Number(order.total);
                        if (Math.abs(paidAmount - expectedAmount) > 0.01) {
                            console.error('[Paystack Verify] AMOUNT MISMATCH! Expected:', expectedAmount, 'Got:', paidAmount);
                            continue;
                        }
                    }
                    verifiedData = data;
                    verifiedRef = ref;
                    console.log('[Paystack Verify] Payment confirmed via ref:', ref);
                }
            } catch (paystackError: any) {
                console.warn('[Paystack Verify] Check failed for ref', ref, ':', paystackError.message);
            }
        }

        if (!verifiedData) {
            console.log('[Paystack Verify] Cannot verify payment for:', orderNumber);
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider'
            });
        }

        console.log('[Paystack Verify] Marking order paid for:', orderNumber);

        const { data: orderJson, error: updateError } = await supabaseAdmin
            .rpc('mark_order_paid', {
                order_ref: orderNumber,
                moolre_ref: String(verifiedRef || 'paystack-api-verify')
            });

        if (updateError) {
            console.error('[Paystack Verify] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        // Annotate gateway metadata
        try {
            await supabaseAdmin
                .from('orders')
                .update({
                    metadata: {
                        ...(orderJson?.metadata || {}),
                        payment_provider: 'paystack',
                        paystack_reference: verifiedRef,
                        paystack_transaction_id: verifiedData.id,
                        paystack_channel: verifiedData.channel,
                        paystack_paid_at: verifiedData.paid_at,
                    }
                })
                .eq('order_number', orderNumber);
        } catch (annotateErr: any) {
            console.warn('[Paystack Verify] Metadata annotate failed:', annotateErr.message);
        }

        console.log('[Paystack Verify] Order marked as paid:', orderNumber);

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total
                });
            } catch (statsError: any) {
                console.error('[Paystack Verify] Customer stats failed:', statsError.message);
            }
        }

        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
                console.log('[Paystack Verify] Notifications sent for:', orderNumber);
            } catch (notifyError: any) {
                console.error('[Paystack Verify] Notification failed:', notifyError.message);
            }
        }

        return NextResponse.json({
            success: true,
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated'
        });

    } catch (error: any) {
        console.error('[Paystack Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
