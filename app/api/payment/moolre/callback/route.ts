import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Moolre webhook callback has been disabled.
 *
 * Payments are now processed through Paystack. The Paystack webhook
 * receiver lives at: /api/payment/paystack/callback
 *
 * The original Moolre callback handler is preserved in git history
 * (commit f60c790 and earlier).
 */

export async function POST() {
    console.warn('[Moolre Callback] Received call to deprecated endpoint — Moolre payments are disabled');
    return NextResponse.json(
        { success: false, message: 'Moolre callback endpoint is deprecated. Use /api/payment/paystack/callback.' },
        { status: 410 }
    );
}

export async function GET() {
    return NextResponse.json(
        { message: 'Moolre callback endpoint is deprecated. Use /api/payment/paystack/callback instead.' },
        { status: 410 }
    );
}
