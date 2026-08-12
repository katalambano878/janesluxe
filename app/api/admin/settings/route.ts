import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function parseBool(raw: unknown): boolean {
  return (
    raw === true ||
    raw === 'true' ||
    (typeof raw === 'string' && raw.replace(/"/g, '').toLowerCase() === 'true')
  );
}

/** GET /api/admin/settings?key=maintenance_mode */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const key = new URL(request.url).searchParams.get('key') || 'maintenance_mode';
    const { data, error } = await supabaseAdmin
      .from('store_settings')
      .select('key, value')
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      key,
      value: data?.value ?? null,
      enabled: parseBool(data?.value),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load setting' }, { status: 500 });
  }
}

/** PUT /api/admin/settings — upsert a setting (admin only). */
export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }
    const value =
      body?.value !== undefined
        ? body.value
        : body?.enabled !== undefined
          ? (body.enabled ? 'true' : 'false')
          : null;
    if (value === null) {
      return NextResponse.json({ error: 'value or enabled is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('store_settings').upsert(
      {
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, key, enabled: parseBool(value) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update setting' }, { status: 500 });
  }
}
