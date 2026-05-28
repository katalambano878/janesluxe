import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';
  if (!projectRef) {
    return NextResponse.json({ error: 'Invalid Supabase URL' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const authJson = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !authJson?.access_token || !authJson?.refresh_token) {
    return NextResponse.json({ error: 'Invalid login credentials' }, { status: 401 });
  }

  const accessToken = String(authJson.access_token);
  const refreshToken = String(authJson.refresh_token);
  const payload = decodeJwtPayload(accessToken);
  const userId = (authJson?.user?.id as string | undefined) || (payload?.sub as string | undefined);

  if (!userId) {
    return NextResponse.json({ error: 'Could not resolve user' }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || String(profile.role) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const isSecure = request.nextUrl.protocol === 'https:';
  const response = NextResponse.json({ success: true });
  response.cookies.set(`sb-${projectRef}-access-token`, accessToken, {
    path: '/',
    sameSite: 'lax',
    secure: isSecure,
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: false,
  });
  response.cookies.set(`sb-${projectRef}-refresh-token`, refreshToken, {
    path: '/',
    sameSite: 'lax',
    secure: isSecure,
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: false,
  });

  return response;
}
