import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { isMoolreConfigured, moolreGenerateLink } from '@/lib/moolre';

/**
 * Initialize a Moolre payment for an order and return the hosted checkout URL.
 *
 * SECURITY: the amount is always read from the order in the database — never
 * trusted from the client.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString(),
                    },
                }
            );
        }

        const body = await req.json();
        const { orderId, customerEmail } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
        }

        if (!isMoolreConfigured()) {
            console.error('[Moolre] Missing Moolre credentials');
            return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const query = supabaseAdmin
            .from('orders')
            .select('id, order_number, total, email, payment_status, metadata');

        const { data: order, error: orderError } = isUUID
            ? await query.eq('id', orderId).single()
            : await query.eq('order_number', orderId).single();

        if (orderError || !order) {
            console.error('[Moolre] Order not found:', orderId);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json({ success: false, message: 'Order is already paid' }, { status: 400 });
        }

        const amount = Number(order.total);
        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid order amount' }, { status: 400 });
        }

        const orderRef = order.order_number || orderId;
        const email = customerEmail || order.email;

        const requestUrl = new URL(req.url);
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        // Unique reference per attempt so retries don't collide with Moolre's
        // duplicate-transaction guard.
        const externalref = `${orderRef}-R${Date.now()}`;

        // Secure the webhook with the shared callback secret as a query key.
        const callbackSecret = process.env.MOOLRE_CALLBACK_SECRET || '';
        const callbackUrl = `${baseUrl}/api/payment/moolre/callback${callbackSecret ? `?key=${encodeURIComponent(callbackSecret)}` : ''}`;
        const redirectUrl = `${baseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true`;

        const result = await moolreGenerateLink({
            amount,
            externalref,
            callback: callbackUrl,
            redirect: redirectUrl,
            metadata: {
                order_number: orderRef,
                order_id: order.id,
                customer_email: email || '',
            },
        });

        if (!result.ok || !result.url) {
            console.error('[Moolre] Link generation failed:', result.message, result.raw);
            return NextResponse.json(
                { success: false, message: result.message || 'Failed to generate payment link' },
                { status: 400 }
            );
        }

        // Persist the reference so verify/callback can look it up later.
        try {
            await supabaseAdmin
                .from('orders')
                .update({
                    payment_method: 'moolre',
                    metadata: {
                        ...(order.metadata || {}),
                        moolre_externalref: externalref,
                        moolre_reference: result.reference || null,
                        moolre_init_at: new Date().toISOString(),
                    },
                })
                .eq('id', order.id);
        } catch (metaErr) {
            console.warn('[Moolre] Could not save reference to order:', metaErr);
        }

        console.log('[Moolre] Initialized for order:', orderRef, '| Amount:', amount, 'GHS | Ref:', externalref);

        return NextResponse.json({
            success: true,
            url: result.url,
            reference: result.reference,
        });
    } catch (error: any) {
        console.error('[Moolre] API Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
