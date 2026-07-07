import { supabaseAdmin } from './supabase-admin';

/**
 * Shared server-side authentication utilities.
 * Use these in API routes and server actions to verify callers.
 */

export interface AuthResult {
    authenticated: boolean;
    user?: any;
    role?: string;
    error?: string;
}

/**
 * Extract the Supabase access token from either the Authorization header
 * (Bearer) or the cookies set by the admin login route
 * (`sb-<projectRef>-access-token`). The admin panel uses a cookie session, not
 * the browser Supabase client's localStorage session, so header-only lookups
 * fail for admin actions.
 */
function extractAccessToken(request: Request): string | null {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const t = authHeader.slice(7).trim();
        if (t) return t;
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const scopedMatch = cookieHeader.match(/\bsb-[a-z0-9]+-access-token=([^;]+)/i);
    if (scopedMatch) return decodeURIComponent(scopedMatch[1].trim());
    const plainMatch = cookieHeader.match(/\bsb-access-token=([^;]+)/);
    if (plainMatch) return decodeURIComponent(plainMatch[1].trim());

    const authCookie = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
    if (authCookie) {
        const value = authCookie.split('=').slice(1).join('=').trim();
        const decoded = decodeURIComponent(value);
        try {
            const parsed = JSON.parse(decoded);
            if (Array.isArray(parsed) && parsed[0]) return parsed[0];
            if (parsed?.access_token) return parsed.access_token;
            if (typeof parsed === 'string') return parsed;
        } catch {
            return decoded;
        }
    }

    return null;
}

/**
 * Verify that the request has a valid Supabase session
 * and optionally check for admin/staff role.
 */
export async function verifyAuth(
    request: Request,
    options: { requireAdmin?: boolean } = {}
): Promise<AuthResult> {
    const token = extractAccessToken(request);

    if (!token) {
        return { authenticated: false, error: 'Missing authorization token' };
    }

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return { authenticated: false, error: 'Invalid or expired token' };
        }

        if (options.requireAdmin) {
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profileError || !profile) {
                return { authenticated: false, error: 'Could not verify user role' };
            }

            if (profile.role !== 'admin' && profile.role !== 'staff') {
                return { authenticated: false, error: 'Admin access required' };
            }

            return { authenticated: true, user, role: profile.role };
        }

        return { authenticated: true, user };
    } catch (err: any) {
        return { authenticated: false, error: err.message || 'Auth verification failed' };
    }
}

/**
 * Verify admin auth for server actions.
 * Requires passing the auth token from the client.
 */
export async function verifyAdminToken(token: string): Promise<AuthResult> {
    if (!token) {
        return { authenticated: false, error: 'Missing token' };
    }

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return { authenticated: false, error: 'Invalid or expired token' };
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return { authenticated: false, error: 'Could not verify role' };
        }

        if (profile.role !== 'admin' && profile.role !== 'staff') {
            return { authenticated: false, error: 'Admin access required' };
        }

        return { authenticated: true, user, role: profile.role };
    } catch (err: any) {
        return { authenticated: false, error: err.message || 'Auth failed' };
    }
}
