import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const usePlainPg =
  process.env.NEXT_PUBLIC_USE_PLAIN_PG === 'true' ||
  !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
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
  if (usePlainPg) {
    // Plain-PG JWTs are signed with AUTH_JWT_SECRET and have no supabase.co issuer.
    const payload = decodeJwtPayload(token);
    return !!(payload?.sub && payload.typ !== 'refresh');
  }
  if (!projectRef) return false;
  const payload = decodeJwtPayload(token);
  const ref = typeof payload?.ref === 'string' ? payload.ref : '';
  if (ref && ref === projectRef) return true;
  const iss = typeof payload?.iss === 'string' ? payload.iss : '';
  return iss.includes(`https://${projectRef}.supabase.co/auth/v1`);
}

function extractAdminToken(request: NextRequest): string | undefined {
  // Prefer project-scoped cookies (set by admin login).
  const scopedNames = projectRef
    ? [`sb-${projectRef}-access-token`, `sb-${projectRef}-auth-token`]
    : [];

  // Also accept host-derived cookie names when NEXT_PUBLIC_SUPABASE_URL is our own domain
  // (e.g. www.janesluxe.com → projectRef "www").
  for (const name of [
    ...scopedNames,
    'sb-access-token',
    'sb-www-access-token',
    'sb-janesluxe-access-token',
  ]) {
    const value = request.cookies.get(name)?.value;
    if (value && tokenMatchesProject(value)) return value;
  }

  for (const [name, cookie] of request.cookies) {
    if (!name.startsWith('sb-')) continue;
    if (!(name.endsWith('-access-token') || name.endsWith('-auth-token') || name.includes('auth'))) {
      continue;
    }
    try {
      const parsed = JSON.parse(cookie.value);
      const maybe =
        (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) ||
        (parsed && typeof parsed === 'object' && typeof parsed.access_token === 'string' && parsed.access_token) ||
        (typeof parsed === 'string' && parsed) ||
        null;
      if (maybe && tokenMatchesProject(String(maybe))) return String(maybe);
    } catch {
      if (tokenMatchesProject(cookie.value)) return cookie.value;
    }
  }

  return undefined;
}

async function verifyPlainPgAdmin(
  token: string
): Promise<{ ok: boolean; userId?: string; role?: string }> {
  const secret =
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET;
  if (!secret) return { ok: false };

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.typ === 'refresh') return { ok: false };
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!userId) return { ok: false };
    const appMeta = (payload.app_metadata || {}) as { role?: string };
    const role = appMeta.role;
    // Jane's Luxe admin panel requires admin (staff is not enough for /admin UI).
    if (role !== 'admin') return { ok: false };
    return { ok: true, userId, role };
  } catch {
    return { ok: false };
  }
}

// ============================================================
// Maintenance mode helper — cached for 15s to keep latency low
// ============================================================
let cachedMaintenance: { value: boolean; at: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 15_000;

async function isMaintenanceModeEnabled(): Promise<boolean> {
  // Env override always wins (works without hosted Supabase).
  if (process.env.MAINTENANCE_MODE === 'true') return true;
  if (process.env.MAINTENANCE_MODE === 'false') return false;

  const now = Date.now();
  if (cachedMaintenance && now - cachedMaintenance.at < MAINTENANCE_CACHE_TTL_MS) {
    return cachedMaintenance.value;
  }

  try {
    // Prefer the app's own REST shim (plain Postgres) over hosted Supabase.
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
      (supabaseUrl && !supabaseUrl.includes('supabase.co') ? supabaseUrl.replace(/\/+$/, '') : '');
    if (!origin && (!supabaseUrl || !supabaseAnonKey)) {
      return false;
    }
    const base = origin || supabaseUrl!.replace(/\/+$/, '');
    const url = `${base}/rest/v1/store_settings?key=eq.maintenance_mode&select=value&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseAnonKey || 'anon',
        Authorization: `Bearer ${supabaseAnonKey || 'anon'}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data: Array<{ value: unknown }> = await res.json();
    const raw = data?.[0]?.value;
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

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (pathname.startsWith('/admin')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (pathname === '/admin/login') {
      return response;
    }

    const token = extractAdminToken(request);

    if (!token) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (usePlainPg) {
      const verified = await verifyPlainPgAdmin(token);
      if (!verified.ok) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        loginUrl.searchParams.set('error', 'session_expired');
        return NextResponse.redirect(loginUrl);
      }
      if (verified.userId) response.headers.set('x-user-id', verified.userId);
      if (verified.role) response.headers.set('x-user-role', verified.role);
      return response;
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('error', 'auth_unavailable');
      return NextResponse.redirect(loginUrl);
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

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
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('error', 'session_check_failed');
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  // API + PostgREST/GoTrue/Storage shims + static + maintenance page: no maintenance gating
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/rest/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/storage/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/maintenance' ||
    /\.[^/]+$/.test(pathname)
  ) {
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/rest/') ||
      pathname.startsWith('/auth/')
    ) {
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  }

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|storage/).*)'],
};
