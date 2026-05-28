import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Moolre payment verification has been disabled.
 *
 * Use /api/payment/paystack/verify instead. The original Moolre verify
 * handler is preserved in git history (commit f60c790 and earlier).
 */

export async function POST() {
    return NextResponse.json(
        { success: false, message: 'Moolre verify endpoint is deprecated. Use /api/payment/paystack/verify.' },
        { status: 410 }
    );
}

export async function GET() {
    return NextResponse.json(
        { message: 'Moolre verify endpoint is deprecated. Use /api/payment/paystack/verify instead.' },
        { status: 410 }
    );
}
