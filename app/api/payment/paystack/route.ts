import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

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
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await req.json();
        const { orderId, customerEmail } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
        }

        if (!process.env.PAYSTACK_SECRET_KEY) {
            console.error('[Paystack] Missing PAYSTACK_SECRET_KEY');
            return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
        }

        // SECURITY: Always fetch order from DB. Never trust client-supplied amount.
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const query = supabaseAdmin
            .from('orders')
            .select('id, order_number, total, email, payment_status');

        const { data: order, error: orderError } = isUUID
            ? await query.eq('id', orderId).single()
            : await query.eq('order_number', orderId).single();

        if (orderError || !order) {
            console.error('[Paystack] Order not found:', orderId);
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

        if (!email) {
            return NextResponse.json({ success: false, message: 'Customer email is required' }, { status: 400 });
        }

        const requestUrl = new URL(req.url);
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        // Unique reference per attempt so retries don't collide
        const uniqueRef = `${orderRef}-R${Date.now()}`;

        // Paystack expects amount in the smallest currency unit.
        const amountInKobo = Math.round(amount * 100);

        const payload = {
            email,
            amount: amountInKobo,
            currency: 'GHS',
            reference: uniqueRef,
            callback_url: `${baseUrl}/order-success?order=${orderRef}&payment_success=true`,
            metadata: {
                order_number: orderRef,
                order_id: order.id,
                customer_email: email,
            },
            channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
        };

        // Save Paystack reference on the order so verify can use it later
        try {
            const { data: currentOrder } = await supabaseAdmin
                .from('orders')
                .select('metadata')
                .eq('order_number', orderRef)
                .single();
            await supabaseAdmin
                .from('orders')
                .update({
                    payment_method: 'paystack',
                    metadata: {
                        ...(currentOrder?.metadata || {}),
                        paystack_reference: uniqueRef,
                        paystack_init_at: new Date().toISOString(),
                    }
                })
                .eq('order_number', orderRef);
        } catch (metaErr) {
            console.warn('[Paystack] Could not save reference to order:', metaErr);
        }

        console.log('[Paystack] Initializing for order:', orderRef, '| Amount:', amount, 'GHS', '| Ref:', uniqueRef);

        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('[Paystack] Init response:', result.status ? 'Success' : 'Failed', '| Has URL:', !!result.data?.authorization_url);

        if (result.status === true && result.data?.authorization_url) {
            return NextResponse.json({
                success: true,
                url: result.data.authorization_url,
                reference: result.data.reference,
                accessCode: result.data.access_code,
            });
        } else {
            console.error('[Paystack] Init failed:', result.message);
            return NextResponse.json({
                success: false,
                message: result.message || 'Failed to generate payment link'
            }, { status: 400 });
        }

    } catch (error: any) {
        console.error('[Paystack] API Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
