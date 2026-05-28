import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function tokenMatchesProject(token: string, projectRef: string): boolean {
  if (!projectRef) return false;
  const payload = decodeJwtPayload(token);
  const ref = typeof payload?.ref === 'string' ? payload.ref : '';
  if (ref && ref === projectRef) return true;
  const iss = typeof payload?.iss === 'string' ? payload.iss : '';
  return iss.includes(`https://${projectRef}.supabase.co/auth/v1`);
}

function getAccessToken(request: Request, projectRef: string): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (tokenMatchesProject(t, projectRef)) return t;
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map((c) => c.trim()).filter(Boolean);

  // Prefer project-scoped access token cookie.
  const projectAccess = cookies.find((c) => c.startsWith(`sb-${projectRef}-access-token=`));
  if (projectAccess) {
    const value = decodeURIComponent(projectAccess.split('=').slice(1).join('=').trim());
    if (tokenMatchesProject(value, projectRef)) return value;
  }

  // Fallback: Supabase may store as sb-<project>-auth-token (JSON array)
  const projectAuth = cookies.find((c) => c.startsWith(`sb-${projectRef}-auth-token=`));
  if (projectAuth) {
    const value = decodeURIComponent(projectAuth.split('=').slice(1).join('=').trim());
    try {
      const parsed = JSON.parse(value);
      const candidate =
        (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) ||
        (parsed && typeof parsed === 'object' && typeof parsed.access_token === 'string' && parsed.access_token) ||
        (typeof parsed === 'string' && parsed);
      if (candidate && tokenMatchesProject(candidate, projectRef)) return candidate;
    } catch {
      if (tokenMatchesProject(value, projectRef)) return value;
    }
  }

  return null;
}

/**
 * GET /api/admin/me
 * Returns current admin/staff user and profile using the caller session token.
 */
export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: 'Server misconfiguration: missing Supabase env vars' },
      { status: 503 }
    );
  }

  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || '';
  const token = getAccessToken(request, projectRef);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const role = profile.role != null ? String(profile.role) : '';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Not admin' }, { status: 403 });
  }

  const { data: roleConfig } = await supabase
    .from('roles')
    .select('permissions, enabled')
    .eq('id', role)
    .single();

  if (roleConfig && !roleConfig.enabled) {
    return NextResponse.json({ error: 'Role disabled' }, { status: 403 });
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: { role },
    permissions: roleConfig?.permissions ?? {},
  });
}
