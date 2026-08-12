import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const [{ data: roles, error: rolesError }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from('roles').select('*').order('is_system', { ascending: false }),
      supabaseAdmin.from('profiles').select('role').limit(2000),
    ]);
    if (rolesError) throw rolesError;

    const userCount: Record<string, number> = {};
    for (const p of profiles || []) {
      const role = String(p.role || '');
      if (!role) continue;
      userCount[role] = (userCount[role] || 0) + 1;
    }

    return NextResponse.json({
      roles: roles || [],
      userCount,
      currentRole: gate.auth.role || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load roles' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);
    if (body.permissions !== undefined) updates.permissions = body.permissions;
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const { data, error } = await supabaseAdmin
      .from('roles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ role: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update role' }, { status: 500 });
  }
}
