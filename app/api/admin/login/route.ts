import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPlainPostgres } from '@/lib/db/mode';
import { signInWithPassword } from '@/lib/db/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

function cookieProjectRef(supabaseUrl: string): string {
  // Hosted Supabase: tvfyqdhftueognjstlwq.supabase.co → tvfyqdhftueognjstlwq
  // Plain PG (own domain): www.janesluxe.com → www (or hostname label)
  const host = supabaseUrl.split('//')[1]?.split('/')[0] || '';
  if (host.includes('supabase.co')) {
    return host.split('.')[0] || 'local';
  }
  // Prefer a stable cookie namespace for our own domain.
  return host.split('.')[0] || 'local';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = cookieProjectRef(supabaseUrl || 'https://local.janesluxe.com');

  let accessToken: string;
  let refreshToken: string;
  let userId: string | undefined;

  if (isPlainPostgres()) {
    const { session, error } = await signInWithPassword(email, password);
    if (error || !session) {
      return NextResponse.json({ error: 'Invalid login credentials' }, { status: 401 });
    }
    accessToken = session.access_token;
    refreshToken = session.refresh_token;
    userId = session.user.id;
  } else {
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
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

    accessToken = String(authJson.access_token);
    refreshToken = String(authJson.refresh_token);
    const payload = decodeJwtPayload(accessToken);
    userId =
      (authJson?.user?.id as string | undefined) || (payload?.sub as string | undefined);
  }

  if (!userId) {
    return NextResponse.json({ error: 'Could not resolve user' }, { status: 401 });
  }

  // Role check via admin client (pg compat or service-role).
  let profile: { role: string } | null = null;
  if (isPlainPostgres()) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    profile = data;
  } else {
    const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
    profile = data;
  }

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
