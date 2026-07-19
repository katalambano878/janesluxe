import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/me
 * Returns current admin/staff user and profile using the caller session token.
 */
export async function GET(request: Request) {
  const auth = await verifyAuth(request, { requireAdmin: true });
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: auth.error || 'Not authenticated' }, { status: 401 });
  }

  const role = auth.role ? String(auth.role) : '';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Not admin' }, { status: 403 });
  }

  const { data: roleConfig } = await supabaseAdmin
    .from('roles')
    .select('permissions, enabled')
    .eq('id', role)
    .single();

  if (roleConfig && !roleConfig.enabled) {
    return NextResponse.json({ error: 'Role disabled' }, { status: 403 });
  }

  return NextResponse.json({
    user: { id: auth.user.id, email: auth.user.email },
    profile: { role },
    permissions: roleConfig?.permissions ?? {},
  });
}
