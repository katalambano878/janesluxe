import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from './supabase-admin';

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
 * Extract the access token from either the Authorization header (Bearer) or
 * cookies set by the admin login route (`sb-<projectRef>-access-token`).
 * Project refs may contain hyphens (e.g. janesluxe-staging).
 */
function extractAccessToken(request: Request): string | null {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const t = authHeader.slice(7).trim();
        if (t) return t;
    }

    const cookieHeader = request.headers.get('cookie') || '';
    // Prefer exact *-access-token cookies; allow hyphens in the project ref.
    const scopedMatch = cookieHeader.match(/\bsb-([^=]+)-access-token=([^;]+)/i);
    if (scopedMatch) return decodeURIComponent(scopedMatch[2].trim());
    const plainMatch = cookieHeader.match(/\bsb-access-token=([^;]+)/);
    if (plainMatch) return decodeURIComponent(plainMatch[1].trim());

    const authCookie = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.endsWith('-access-token') || c.includes('auth-token')));
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

/** True when plain Postgres or hosted Supabase service role is available. */
export function isAdminBackendConfigured(): boolean {
    return isSupabaseAdminConfigured;
}

/**
 * Shared admin/staff gate for API routes. Prefer this over copy-pasted
 * requireAdmin helpers that incorrectly require SUPABASE_SERVICE_ROLE_KEY
 * even when DATABASE_URL (plain Postgres) is configured.
 */
export async function requireAdmin(
    request: Request
): Promise<{ auth: AuthResult } | { response: NextResponse }> {
    if (!isSupabaseAdminConfigured) {
        return {
            response: NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 }),
        };
    }
    const auth = await verifyAuth(request, { requireAdmin: true });
    if (!auth.authenticated) {
        const status = auth.error === 'Admin access required' ? 403 : 401;
        return {
            response: NextResponse.json(
                { error: auth.error || 'Not authenticated' },
                { status }
            ),
        };
    }
    return { auth };
}

export function isStaffRole(role?: string | null): boolean {
    const r = role != null ? String(role) : '';
    return r === 'admin' || r === 'staff';
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
