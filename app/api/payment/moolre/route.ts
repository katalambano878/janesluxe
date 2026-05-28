import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Moolre payment gateway has been replaced by Paystack.
 *
 * The Moolre payment integration has been disabled while we use Paystack
 * as the primary payment gateway. The original implementation is preserved
 * in git history (commit f60c790 and earlier) and can be restored if needed.
 *
 * For payments, use: /api/payment/paystack
 *
 * Note: Moolre SMS integration in lib/notifications.ts is still active
 * and unaffected by this change.
 */

export async function POST() {
    return NextResponse.json(
        {
            success: false,
            message: 'The Moolre payment gateway is no longer in use. Please use Paystack via /api/payment/paystack.',
        },
        { status: 410 }
    );
}

export async function GET() {
    return NextResponse.json(
        {
            message: 'Moolre payment endpoint is deprecated. Use /api/payment/paystack instead.',
            timestamp: new Date().toISOString(),
        },
        { status: 410 }
    );
}

/* ============================================================
 * ORIGINAL MOOLRE IMPLEMENTATION — COMMENTED OUT
 * ============================================================
 *
 * import { supabaseAdmin } from '@/lib/supabase-admin';
 * import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
 *
 * export async function POST(req: Request) {
 *     try {
 *         const clientId = getClientIdentifier(req);
 *         const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);
 *         if (!rateLimitResult.success) {
 *             return NextResponse.json(
 *                 { success: false, message: 'Too many requests. Please try again later.' },
 *                 { status: 429 }
 *             );
 *         }
 *         const body = await req.json();
 *         const { orderId, customerEmail } = body;
 *         if (!orderId) return NextResponse.json({ success: false, message: 'Missing orderId' }, { status: 400 });
 *         if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_ACCOUNT_NUMBER) {
 *             return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
 *         }
 *         // ... (init logic that called https://api.moolre.com/embed/link)
 *         // See git history for full implementation.
 *     } catch (error) {
 *         return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
 *     }
 * }
 */
