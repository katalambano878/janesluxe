'use server';

import { cookies } from 'next/headers';
import { verifyAdminToken, verifyAuth } from '@/lib/auth';
import { sendWalletSMS } from '@/lib/notifications';

function requestFromSessionCookies(
    cookieStore: Awaited<ReturnType<typeof cookies>>
): Request {
    const cookieHeader = cookieStore
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    return new Request('http://localhost', { headers: { cookie: cookieHeader } });
}

export async function testSmsAction(phone: string, message: string, authToken?: string) {
    // SECURITY: Verify admin authentication before allowing SMS sending.
    // Prefer HttpOnly-capable session cookies (admin login API); client-passed
    // tokens are a fallback when supabase.auth.getSession() is empty on plain Postgres.
    let auth = authToken
        ? await verifyAdminToken(authToken)
        : await verifyAuth(requestFromSessionCookies(await cookies()), { requireAdmin: true });
    if (!auth.authenticated && authToken) {
        auth = await verifyAuth(requestFromSessionCookies(await cookies()), { requireAdmin: true });
    }
    if (!auth.authenticated) {
        return {
            success: false,
            error: 'Unauthorized: ' + (auth.error || 'Admin access required')
        };
    }

    try {
        console.log('Testing SMS to:', phone, '| by user:', auth.user?.email);

        if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 9) {
            return { success: false, error: 'Enter a full phone number, for example 024XXXXXXX.' };
        }

        if (!message || typeof message !== 'string' || message.length > 1000) {
            return { success: false, error: 'Invalid or too long message' };
        }

        // The Buy SMS page counts this wallet. A Moolre send delivers the text and leaves 20,000 unchanged.
        return await sendWalletSMS(phone, message);
    } catch (error: any) {
        // SECURITY: Don't expose stack traces
        console.error('[Test SMS] Error:', error.message, error.stack);
        return {
            success: false,
            error: error.message || 'SMS sending failed'
        };
    }
}
