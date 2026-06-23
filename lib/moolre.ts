/**
 * Moolre payment gateway helpers.
 *
 * Docs: https://docs.moolre.com
 *  - Generate Payment Link:  POST https://api.moolre.com/embed/link
 *  - Payment Status:         POST https://api.moolre.com/open/transact/status
 *
 * Auth headers: X-API-USER + X-API-PUBKEY (PUBKEY not required in sandbox).
 */

const MOOLRE_BASE = (process.env.MOOLRE_BASE_URL || 'https://api.moolre.com').replace(/\/+$/, '');

export function isMoolreConfigured(): boolean {
    return !!(
        process.env.MOOLRE_API_USER &&
        process.env.MOOLRE_API_PUBKEY &&
        process.env.MOOLRE_ACCOUNT_NUMBER
    );
}

function moolreHeaders(): Record<string, string> {
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
            headers: moolreHeaders(),
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

export interface MoolreStatusResult {
    paid: boolean;
    amount?: number;
    transactionId?: string;
    paidAt?: string;
    data?: any;
    raw?: any;
}

/**
 * Check the final status of a payment by its external reference.
 * txstatus === 1 means the collection succeeded.
 */
export async function moolreCheckStatus(externalref: string): Promise<MoolreStatusResult> {
    try {
        const res = await fetch(`${MOOLRE_BASE}/open/transact/status`, {
            method: 'POST',
            headers: moolreHeaders(),
            body: JSON.stringify({
                type: 1,
                idtype: '1', // 1 = our unique externalref
                id: externalref,
                accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER || '',
            }),
        });

        const json = await res.json().catch(() => ({}));
        const data = json?.data || {};
        const paid = json?.status === 1 && Number(data?.txstatus) === 1;

        const rawAmount =
            data?.amount !== undefined ? data.amount : data?.value !== undefined ? data.value : undefined;

        return {
            paid,
            amount: rawAmount !== undefined ? Number(rawAmount) : undefined,
            transactionId: data?.transactionid,
            paidAt: data?.ts,
            data,
            raw: json,
        };
    } catch {
        return { paid: false };
    }
}
