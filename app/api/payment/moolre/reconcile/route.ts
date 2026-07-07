import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { verifyAuth } from '@/lib/auth';
import { isMoolreConfigured, moolreListTransactions, type MoolreTransaction } from '@/lib/moolre';

/**
 * Admin reconciliation for Moolre payments.
 *
 * Some orders are paid under a different attempt reference than the one stored
 * on the order (e.g. the customer paid an earlier link, or the link was
 * re-generated). The single-reference status check then reports "not paid".
 * This endpoint searches Moolre's transaction list around the order date and
 * matches by the order-number reference prefix, then marks the order paid.
 *
 * POST body:
 *   - orderNumber (required): the order to reconcile.
 *   - transactionId (optional): force-match a specific Moolre transaction id.
 *   - dryRun (optional): return candidate transactions without marking paid.
 */
function fmtDate(d: Date): string {
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

function txAmount(t: MoolreTransaction): number {
    const raw = t.amount !== undefined ? t.amount : t.value;
    return raw !== undefined ? Number(raw) : NaN;
}

export async function POST(req: Request) {
    // Allow an authenticated admin session, the shared Moolre secret (?key=),
    // or the service-role key (x-admin-key header) so the reconciliation can be
    // run as an ops task.
    const secret = process.env.MOOLRE_CALLBACK_SECRET;
    const providedKey = new URL(req.url).searchParams.get('key');
    const secretOk = !!secret && providedKey === secret;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceKeyOk = !!serviceKey && req.headers.get('x-admin-key') === serviceKey;

    if (!secretOk && !serviceKeyOk) {
        const auth = await verifyAuth(req, { requireAdmin: true });
        if (!auth.authenticated) {
            return NextResponse.json({ success: false, message: auth.error || 'Unauthorized' }, { status: 401 });
        }
    }

    if (!isMoolreConfigured()) {
        return NextResponse.json({ success: false, message: 'Payment gateway not configured' }, { status: 503 });
    }

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        // ignore
    }

    const orderNumber: string = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : '';
    const forceTxId: string = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    const dryRun = body?.dryRun === true;

    if (!orderNumber) {
        return NextResponse.json({ success: false, message: 'Missing orderNumber' }, { status: 400 });
    }

    const { data: order, error: fetchError } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, payment_status, total, email, created_at, metadata')
        .eq('order_number', orderNumber)
        .single();

    if (fetchError || !order) {
        return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
        return NextResponse.json({ success: true, alreadyPaid: true, message: 'Order already paid' });
    }

    // Search a window from a day before the order to ~45 days after.
    const created = new Date(order.created_at);
    const startdate = fmtDate(new Date(created.getTime() - 24 * 60 * 60 * 1000));
    const enddate = fmtDate(new Date(created.getTime() + 45 * 24 * 60 * 60 * 1000));

    const list = await moolreListTransactions({ startdate, enddate, status: '1', limit: '500' });

    if (list.authError) {
        return NextResponse.json({ success: false, message: 'Moolre authentication failed (check keys / IP whitelist)' }, { status: 502 });
    }
    if (!list.ok) {
        return NextResponse.json({ success: false, message: list.message || 'Could not list Moolre transactions' }, { status: 502 });
    }

    const expected = Number(order.total);
    const successful = list.transactions.filter((t) => Number(t.txstatus) === 1);

    // 1) Explicit transaction id override.
    // 2) Reference match: externalref equals the order number or starts with
    //    "<orderNumber>-R" (our per-attempt reference format).
    // 3) Amount-only candidates (for txns Moolre returns with externalref "0").
    let match: MoolreTransaction | undefined;
    if (forceTxId) {
        match = successful.find((t) => String(t.transactionid) === forceTxId);
        if (!match) {
            return NextResponse.json({ success: false, message: `No successful Moolre transaction ${forceTxId} in window` }, { status: 404 });
        }
    } else {
        match = successful.find((t) => {
            const ref = String(t.externalref || '');
            return ref === orderNumber || ref.startsWith(`${orderNumber}-R`);
        });
    }

    const amountCandidates = successful.filter(
        (t) => !Number.isNaN(txAmount(t)) && Math.abs(txAmount(t) - expected) <= 0.01
    );

    if (!match) {
        return NextResponse.json({
            success: false,
            matched: false,
            message: 'No transaction matched this order by reference. Review candidates and, if correct, re-run with the transactionId to force-match.',
            expectedAmount: expected,
            window: { startdate, enddate },
            candidates: amountCandidates.map((t) => ({
                transactionid: t.transactionid,
                externalref: t.externalref,
                amount: t.amount ?? t.value,
                payer: t.payer,
                ts: t.ts,
            })),
        });
    }

    // Amount safety check.
    const matchedAmount = txAmount(match);
    if (!Number.isNaN(matchedAmount) && Math.abs(matchedAmount - expected) > 0.01) {
        return NextResponse.json({
            success: false,
            matched: true,
            amountMismatch: true,
            message: `Matched transaction amount (${matchedAmount}) does not match order total (${expected}).`,
            transaction: match,
        }, { status: 400 });
    }

    if (dryRun) {
        return NextResponse.json({ success: true, dryRun: true, matched: true, transaction: match });
    }

    const externalref = String(match.externalref && match.externalref !== '0' ? match.externalref : order.metadata?.moolre_externalref || orderNumber);

    const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
        order_ref: orderNumber,
        moolre_ref: externalref,
    });

    if (updateError) {
        return NextResponse.json({ success: false, message: `Database update failed: ${updateError.message}` }, { status: 500 });
    }

    try {
        await supabaseAdmin
            .from('orders')
            .update({
                metadata: {
                    ...(orderJson?.metadata || order.metadata || {}),
                    payment_provider: 'moolre',
                    moolre_externalref: externalref,
                    moolre_transaction_id: match.transactionid,
                    moolre_paid_at: match.ts,
                    moolre_reconciled: true,
                },
            })
            .eq('order_number', orderNumber);
    } catch {
        // non-fatal
    }

    if (orderJson?.email) {
        try {
            await supabaseAdmin.rpc('update_customer_stats', {
                p_customer_email: orderJson.email,
                p_order_total: orderJson.total,
            });
        } catch {
            // non-fatal
        }
    }

    try {
        if (orderJson) await sendOrderConfirmation(orderJson);
    } catch {
        // non-fatal
    }

    return NextResponse.json({
        success: true,
        matched: true,
        message: 'Order reconciled and marked paid',
        transaction: {
            transactionid: match.transactionid,
            externalref: match.externalref,
            amount: match.amount ?? match.value,
            ts: match.ts,
        },
    });
}

export async function GET() {
    return NextResponse.json({ message: 'Moolre reconcile endpoint ready', timestamp: new Date().toISOString() });
}
