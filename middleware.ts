import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = supabaseUrl?.split('//')[1]?.split('.')[0] || '';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const json = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function tokenMatchesProject(token: string): boolean {
    if (!projectRef) return false;
    const payload = decodeJwtPayload(token);
    const ref = typeof payload?.ref === 'string' ? payload.ref : '';
    if (ref && ref === projectRef) return true;
    const iss = typeof payload?.iss === 'string' ? payload.iss : '';
    return iss.includes(`https://${projectRef}.supabase.co/auth/v1`);
}

// ============================================================
// Maintenance mode helper — cached for 15s to keep latency low
// ============================================================
let cachedMaintenance: { value: boolean; at: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 15_000;

async function isMaintenanceModeEnabled(): Promise<boolean> {
    if (!supabaseUrl || !supabaseAnonKey) {
        return false;
    }
    const now = Date.now();
    if (cachedMaintenance && now - cachedMaintenance.at < MAINTENANCE_CACHE_TTL_MS) {
        return cachedMaintenance.value;
    }
    try {
        const url = `${supabaseUrl}/rest/v1/store_settings?key=eq.maintenance_mode&select=value&limit=1`;
        const res = await fetch(url, {
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
            },
            cache: 'no-store',
        });
        const data: Array<{ value: unknown }> = await res.json();
        const raw = data?.[0]?.value;
        // Value is JSONB — could be the literal string "true" or the boolean true.
        const enabled =
            raw === true ||
            raw === 'true' ||
            (typeof raw === 'string' && raw.replace(/"/g, '').toLowerCase() === 'true');
        cachedMaintenance = { value: enabled, at: now };
        return enabled;
    } catch {
        return false;
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const response = NextResponse.next();

    // ============================================================
    // Security headers for ALL routes
    // ============================================================
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ============================================================
    // Admin route protection (auth + role check)
    // ============================================================
    if (pathname.startsWith('/admin')) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

        if (pathname === '/admin/login') {
            return response;
        }

        let token: string | undefined;
        const projectAccessCookie = request.cookies.get(`sb-${projectRef}-access-token`)?.value;
        if (projectAccessCookie && tokenMatchesProject(projectAccessCookie)) {
            token = projectAccessCookie;
        }

        if (!token) {
            const projectAuthCookie = request.cookies.get(`sb-${projectRef}-auth-token`)?.value;
            if (projectAuthCookie) {
                try {
                    const parsed = JSON.parse(projectAuthCookie);
                    const maybeToken =
                        (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) ||
                        (parsed && typeof parsed === 'object' && typeof parsed.access_token === 'string' && parsed.access_token) ||
                        (typeof parsed === 'string' && parsed);
                    if (maybeToken && tokenMatchesProject(maybeToken)) {
                        token = maybeToken;
                    }
                } catch {
                    if (tokenMatchesProject(projectAuthCookie)) {
                        token = projectAuthCookie;
                    }
                }
            }
        }

        if (!token) {
            const loginUrl = new URL('/admin/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }

        if (supabaseUrl && supabaseAnonKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseAnonKey, {
                    auth: { autoRefreshToken: false, persistSession: false },
                    global: { headers: { Authorization: `Bearer ${token}` } },
                });

                const { data: { user }, error } = await supabase.auth.getUser();

                if (error || !user) {
                    const loginUrl = new URL('/admin/login', request.url);
                    loginUrl.searchParams.set('redirect', pathname);
                    loginUrl.searchParams.set('error', 'session_expired');
                    return NextResponse.redirect(loginUrl);
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                const role = profile?.role ? String(profile.role) : '';
                if (role !== 'admin') {
                    const loginUrl = new URL('/admin/login', request.url);
                    loginUrl.searchParams.set('error', 'unauthorized');
                    return NextResponse.redirect(loginUrl);
                }

                const { data: roleConfig } = await supabase
                    .from('roles')
                    .select('enabled')
                    .eq('id', role)
                    .single();

                if (roleConfig && !roleConfig.enabled) {
                    const loginUrl = new URL('/admin/login', request.url);
                    loginUrl.searchParams.set('error', 'role_disabled');
                    return NextResponse.redirect(loginUrl);
                }

                response.headers.set('x-user-id', user.id);
                response.headers.set('x-user-role', role);

            } catch (err) {
                console.error('[Middleware] Auth check error:', err);
            }
        }

        return response;
    }

    // ============================================================
    // API + static + maintenance page itself: no maintenance gating
    // ============================================================
    if (
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/favicon') ||
        pathname === '/maintenance' ||
        /\.[^/]+$/.test(pathname) // any path with a file extension (.png, .ico, .json…)
    ) {
        if (pathname.startsWith('/api/')) {
            response.headers.set('Cache-Control', 'no-store');
        }
        return response;
    }

    // ============================================================
    // Storefront: maintenance gate
    // Admin users who logged in carry an `admin_session=1` cookie
    // (set client-side by the admin layout) and bypass the gate.
    // ============================================================
    const inMaintenance = await isMaintenanceModeEnabled();
    if (inMaintenance) {
        const isAdmin = request.cookies.get('admin_session')?.value === '1';
        if (!isAdmin) {
            return NextResponse.redirect(new URL('/maintenance', request.url));
        }
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image  (image optimization files)
         * - favicon.ico  (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
