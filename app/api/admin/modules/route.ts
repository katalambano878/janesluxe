import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** GET /api/admin/modules — list module enablement for admin shell. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { data, error } = await supabaseAdmin
      .from('store_modules')
      .select('id, enabled');
    if (error) throw error;
    return NextResponse.json({ modules: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load modules' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/modules
 * Body: { id: string, enabled: boolean }
 * Updates store_modules using service role (bypasses RLS). Used so toggling
 * modules works even when the row doesn't exist yet (upsert).
 */
export async function PATCH(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const enabled = Boolean(body?.enabled);

    if (!id) {
      return NextResponse.json({ error: 'Missing module id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('store_modules')
      .upsert(
        { id, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 500 });
  }
}
