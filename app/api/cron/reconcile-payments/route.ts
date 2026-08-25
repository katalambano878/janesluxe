import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isMoolreConfigured } from '@/lib/moolre';
import { reconcileOrderWithMoolre, type ReconcileResult } from '@/lib/moolre-reconcile';

/**
 * Payment recovery sweep.
 *
 * Moolre does not retry webhooks, so a single failed callback leaves an order
 * unpaid even though the customer's money reached the merchant account. This
 * job re-checks recent unpaid orders against Moolre's status API and marks the
 * confirmed ones paid.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `?key=<MOOLRE_CALLBACK_SECRET>`.
 * Query: `days` (default 7, max 60), `limit` (default 100, max 500), `dryRun=1`.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
    const url = new URL(request.url);

    const cronSecret = process.env.CRON_SECRET;
    const callbackSecret = process.env.MOOLRE_CALLBACK_SECRET;
    const authHeader = request.headers.get('authorization');

    const cronOk = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
    const keyOk = !!callbackSecret && url.searchParams.get('key') === callbackSecret;

    if (!cronSecret && !callbackSecret) {
        return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }
    if (!cronOk && !keyOk) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isMoolreConfigured()) {
        return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 });
    }

    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 60);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
    const dryRun = url.searchParams.get('dryRun') === '1';

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: orders, error } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, total, payment_status, email, metadata, created_at')
        .neq('payment_status', 'paid')
        .not('payment_method', 'in', '("cod","cash")')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[Payment Sweep] Query error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates = orders || [];
    const recovered: ReconcileResult[] = [];
    const skipped: Record<string, number> = {};
    let checked = 0;

    for (const order of candidates) {
        checked++;

        if (dryRun) {
            skipped['dryRun'] = (skipped['dryRun'] || 0) + 1;
            continue;
        }

        try {
            const result = await reconcileOrderWithMoolre(order as any);
            if (result.marked) {
                recovered.push(result);
                console.log(
                    '[Payment Sweep] Recovered unpaid order',
                    result.orderNumber,
                    '| tx:', result.transactionId,
                    '| amount:', result.amount
                );
            } else {
                skipped[result.reason] = (skipped[result.reason] || 0) + 1;
            }
        } catch (err: any) {
            skipped[`error: ${err?.message || 'unknown'}`] = (skipped[`error: ${err?.message || 'unknown'}`] || 0) + 1;
        }
    }

    return NextResponse.json({
        success: true,
        windowDays: days,
        checked,
        recovered: recovered.length,
        recoveredValue: recovered.reduce((sum, r) => sum + (r.marked ? r.amount : 0), 0),
        orders: recovered,
        skipped,
    });
}

export async function GET(request: Request) {
    return handle(request);
}

export async function POST(request: Request) {
    return handle(request);
}
