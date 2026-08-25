import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { moolreCheckStatus, type MoolreTransaction } from '@/lib/moolre';

export interface ReconcilableOrder {
    id?: string;
    order_number: string;
    total: number | string;
    payment_status?: string;
    email?: string | null;
    metadata?: Record<string, any> | null;
}

export type ReconcileResult =
    | { orderNumber: string; marked: true; transactionId?: string; amount: number; ref: string }
    | { orderNumber: string; marked: false; reason: string; amountSeen?: number };

/**
 * Candidate Moolre references for an order, most specific first.
 *
 * Every payment attempt uses `<order_number>-R<timestamp>`, and only that exact
 * attempt reference is queryable in Moolre's status API — the bare order number
 * returns "Transaction not found". So the stored attempt refs must be tried
 * before falling back to the order number.
 */
export function moolreRefsForOrder(order: ReconcilableOrder): string[] {
    const refs: string[] = [];
    const push = (r: unknown) => {
        if (typeof r === 'string' && r.trim() && !refs.includes(r.trim())) refs.push(r.trim());
    };

    push(order.metadata?.moolre_externalref);
    const attempts = order.metadata?.moolre_attempt_refs;
    if (Array.isArray(attempts)) attempts.forEach(push);
    push(order.order_number);

    return refs;
}

/**
 * Re-check an unpaid order against Moolre's status API and mark it paid when
 * Moolre confirms a successful collection for the exact order amount.
 *
 * This is the safety net for callbacks Moolre never delivered: the money is in
 * the merchant account but the order is still sitting as unpaid.
 */
export async function reconcileOrderWithMoolre(
    order: ReconcilableOrder,
    options: { notify?: boolean } = {}
): Promise<ReconcileResult> {
    const orderNumber = order.order_number;
    const expected = Number(order.total);

    if (!Number.isFinite(expected)) {
        return { orderNumber, marked: false, reason: 'order total is not a number' };
    }

    const refs = moolreRefsForOrder(order);
    if (refs.length === 0) {
        return { orderNumber, marked: false, reason: 'no Moolre reference on order' };
    }

    let sawAmountMismatch: number | undefined;
    let authError = false;

    for (const ref of refs) {
        const status = await moolreCheckStatus(ref);

        if (status.authError) {
            authError = true;
            continue;
        }
        if (!status.paid) continue;

        // Never mark paid on an unknown or mismatched amount.
        if (status.amount === undefined || Number.isNaN(status.amount)) {
            sawAmountMismatch = status.amount;
            continue;
        }
        if (Math.abs(status.amount - expected) > 0.01) {
            sawAmountMismatch = status.amount;
            continue;
        }

        const { data: orderJson, error: rpcError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: orderNumber,
            moolre_ref: ref,
        });

        if (rpcError) {
            return { orderNumber, marked: false, reason: `mark_order_paid failed: ${rpcError.message}` };
        }
        if (!orderJson) {
            return { orderNumber, marked: false, reason: 'order not found when marking paid' };
        }

        try {
            await supabaseAdmin
                .from('orders')
                .update({
                    metadata: {
                        ...(orderJson.metadata || order.metadata || {}),
                        payment_provider: 'moolre',
                        moolre_externalref: ref,
                        moolre_transaction_id: status.transactionId,
                        moolre_paid_at: status.paidAt,
                        moolre_recovered_by_sweep: true,
                    },
                })
                .eq('order_number', orderNumber);
        } catch {
            // Annotation is best-effort; the order is already paid.
        }

        if (orderJson.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            } catch {
                // non-fatal
            }
        }

        if (options.notify !== false) {
            try {
                await sendOrderConfirmation(orderJson);
            } catch {
                // non-fatal
            }
        }

        return {
            orderNumber,
            marked: true,
            transactionId: status.transactionId,
            amount: status.amount,
            ref,
        };
    }

    if (authError) {
        return { orderNumber, marked: false, reason: 'Moolre auth error (check keys / IP whitelist)' };
    }
    if (sawAmountMismatch !== undefined) {
        return {
            orderNumber,
            marked: false,
            reason: 'amount mismatch on confirmed transaction',
            amountSeen: sawAmountMismatch,
        };
    }
    return { orderNumber, marked: false, reason: 'not paid on Moolre' };
}

export function moolreTxAmount(t: MoolreTransaction): number {
    const raw = t.amount !== undefined ? t.amount : t.value;
    return raw !== undefined ? Number(raw) : NaN;
}

export interface CollectionMatch {
    match?: MoolreTransaction;
    candidates: MoolreTransaction[];
    ambiguous: boolean;
}

/**
 * Find the collection that paid for an order inside a Moolre transaction list.
 *
 * Moolre's List Transactions API returns `externalref: "0"` for every row, so
 * matching on our own reference is impossible here (only the per-transaction
 * status API echoes it back). Instead we match a customer-initiated collection
 * — `payer` is set on money-in rows, empty on settlement rows — by exact amount
 * inside a window around the order, and only accept an unambiguous single hit.
 */
export function findCollectionForOrder(
    transactions: MoolreTransaction[],
    params: { total: number; createdAt: string | Date; windowHours?: number }
): CollectionMatch {
    const expected = Number(params.total);
    const created = new Date(params.createdAt).getTime();
    const windowMs = (params.windowHours ?? 6) * 60 * 60 * 1000;

    const candidates = transactions.filter((t) => {
        if (Number(t.txstatus) !== 1) return false;
        // Money-in rows carry the paying MSISDN; payouts/settlements do not.
        if (!String(t.payer || '').trim()) return false;

        const amount = moolreTxAmount(t);
        if (Number.isNaN(amount) || Math.abs(amount - expected) > 0.01) return false;

        if (!t.ts) return false;
        const paidAt = new Date(String(t.ts).replace(' ', 'T') + 'Z').getTime();
        if (Number.isNaN(paidAt)) return false;

        const delta = paidAt - created;
        return delta >= -10 * 60 * 1000 && delta <= windowMs;
    });

    if (candidates.length === 1) {
        return { match: candidates[0], candidates, ambiguous: false };
    }
    return { candidates, ambiguous: candidates.length > 1 };
}
