/**
 * Moolre payment gateway helpers.
 *
 * Docs: https://docs.moolre.com
 *  - Generate Payment Link:  POST https://api.moolre.com/embed/link      (X-API-PUBKEY)
 *  - Payment Status:         POST https://api.moolre.com/open/transact/status (X-API-PUBKEY)
 *
 * Both endpoints authenticate with X-API-USER + X-API-PUBKEY (the PUBLIC key).
 * Moolre also IP-whitelists API callers, so requests only succeed from the
 * whitelisted server/host (add every deploy origin's egress IP in the Moolre
 * dashboard). PUBKEY headers are not required in sandbox.
 */

const MOOLRE_BASE = (process.env.MOOLRE_BASE_URL || 'https://api.moolre.com').replace(/\/+$/, '');

export function isMoolreConfigured(): boolean {
    return !!(
        process.env.MOOLRE_API_USER &&
        process.env.MOOLRE_API_PUBKEY &&
        process.env.MOOLRE_ACCOUNT_NUMBER
    );
}

/**
 * Both the `/embed/link` and `/open/transact/status` (Payment Status) endpoints
 * authenticate with the PUBLIC key (X-API-PUBKEY) per Moolre's API 2.0 docs.
 */
function moolrePublicHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'X-API-USER': process.env.MOOLRE_API_USER || '',
        'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY || '',
    };
}

export interface MoolreLinkResult {
    ok: boolean;
    url?: string;
    reference?: string;
    message?: string;
    raw?: any;
}

/**
 * Generate a hosted Moolre payment page URL for a given amount/reference.
 */
export async function moolreGenerateLink(params: {
    amount: number;
    externalref: string;
    email?: string;
    callback?: string;
    redirect?: string;
    metadata?: Record<string, any>;
}): Promise<MoolreLinkResult> {
    try {
        const res = await fetch(`${MOOLRE_BASE}/embed/link`, {
            method: 'POST',
            headers: moolrePublicHeaders(),
            signal: AbortSignal.timeout(12000),
            body: JSON.stringify({
                type: 1,
                amount: String(params.amount),
                // Moolre expects the *business* email here; customer email lives in metadata.
                email: params.email || process.env.MOOLRE_MERCHANT_EMAIL || '',
                externalref: params.externalref,
                callback: params.callback,
                redirect: params.redirect,
                reusable: '0',
                currency: 'GHS',
                accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER || '',
                metadata: params.metadata || {},
            }),
        });

        const json = await res.json().catch(() => ({}));

        if (json?.status === 1 && json?.data?.authorization_url) {
            return {
                ok: true,
                url: json.data.authorization_url,
                reference: json.data.reference,
                raw: json,
            };
        }

        return {
            ok: false,
            message: json?.message || 'Failed to generate payment link',
            raw: json,
        };
    } catch (err: any) {
        return { ok: false, message: err?.message || 'Network error contacting Moolre' };
    }
}

export function canVerifyMoolreStatus(): boolean {
    return !!(process.env.MOOLRE_API_USER && process.env.MOOLRE_API_PUBKEY);
}

export interface MoolreStatusResult {
    paid: boolean;
    /** True when Moolre rejected our credentials (so the result is inconclusive). */
    authError: boolean;
    amount?: number;
    transactionId?: string;
    paidAt?: string;
    data?: any;
    raw?: any;
}

/**
 * Check the final status of a payment by its external reference.
 * txstatus === 1 means the collection succeeded.
 *
 * Authenticates with the PUBLIC key (X-API-PUBKEY). If credentials are missing
 * or Moolre rejects them (AIN01/SS00), the result is flagged authError so
 * callers can fall back to the secret-gated webhook body.
 */
export async function moolreCheckStatus(externalref: string): Promise<MoolreStatusResult> {
    if (!process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_API_USER) {
        return { paid: false, authError: true };
    }
    try {
        const res = await fetch(`${MOOLRE_BASE}/open/transact/status`, {
            method: 'POST',
            headers: moolrePublicHeaders(),
            signal: AbortSignal.timeout(12000),
            body: JSON.stringify({
                type: 1,
                idtype: '1', // 1 = our unique externalref
                id: externalref,
                accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER || '',
            }),
        });

        const json = await res.json().catch(() => ({}));
        const data = json?.data || {};
        // Moolre auth-failure codes (wrong/missing key, or non-whitelisted IP).
        const code = typeof json?.code === 'string' ? json.code : '';
        const authError = code === 'AIN01' || code === 'SS00';
        const paid = json?.status === 1 && Number(data?.txstatus) === 1;

        const rawAmount =
            data?.amount !== undefined ? data.amount : data?.value !== undefined ? data.value : undefined;

        return {
            paid,
            authError,
            amount: rawAmount !== undefined ? Number(rawAmount) : undefined,
            transactionId: data?.transactionid,
            paidAt: data?.ts,
            data,
            raw: json,
        };
    } catch {
        return { paid: false, authError: false };
    }
}

export interface MoolreTransaction {
    txstatus?: number;
    txtype?: number;
    amount?: string;
    value?: string;
    transactionid?: string;
    externalref?: string;
    thirdpartyref?: string;
    payer?: string;
    ts?: string;
}

export interface MoolreListResult {
    ok: boolean;
    authError: boolean;
    transactions: MoolreTransaction[];
    message?: string;
    raw?: any;
}

/**
 * List account transactions in a date window (List Transactions API).
 * Used to reconcile payments that succeeded under a different attempt
 * reference than the one currently stored on the order.
 */
export async function moolreListTransactions(params: {
    startdate: string;
    enddate: string;
    status?: '0' | '1' | '2';
    limit?: string;
}): Promise<MoolreListResult> {
    if (!process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_API_USER) {
        return { ok: false, authError: true, transactions: [] };
    }
    try {
        // This endpoint documents X-API-KEY; send both the public key and the
        // private key (when set) alongside X-API-USER so it works regardless.
        const headers: Record<string, string> = {
            ...moolrePublicHeaders(),
        };
        if (process.env.MOOLRE_API_KEY) headers['X-API-KEY'] = process.env.MOOLRE_API_KEY;

        const res = await fetch(`${MOOLRE_BASE}/open/account/status`, {
            method: 'POST',
            headers,
            signal: AbortSignal.timeout(12000),
            body: JSON.stringify({
                type: 2,
                accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER || '',
                startdate: params.startdate,
                enddate: params.enddate,
                limit: params.limit || '200',
                ...(params.status !== undefined ? { status: params.status } : {}),
            }),
        });

        const json = await res.json().catch(() => ({}));
        const code = typeof json?.code === 'string' ? json.code : '';
        const authError = code === 'AIN01' || code === 'SS00';
        const transactions: MoolreTransaction[] = Array.isArray(json?.data?.transactions)
            ? json.data.transactions
            : [];

        return {
            ok: json?.status === 1,
            authError,
            transactions,
            message: json?.message,
            raw: json,
        };
    } catch (err: any) {
        return { ok: false, authError: false, transactions: [], message: err?.message };
    }
}
