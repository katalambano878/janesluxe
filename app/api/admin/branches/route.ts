import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-[a-z0-9]+-access-token=([^;]+)/i)
    || cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());
  return null;
}

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/** GET /api/admin/branches — all branches (active + inactive) */
export async function GET(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branches: data || [] });
}

/** POST /api/admin/branches — create a branch */
export async function POST(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    let slug: string = (body.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let candidate = slug;
    let attempt = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('branches').select('id').eq('slug', candidate).maybeSingle();
      if (!existing) break;
      attempt++;
      candidate = `${slug}-${attempt}`;
    }

    const { data: maxRow } = await supabaseAdmin
      .from('branches').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();

    const { data, error } = await supabaseAdmin
      .from('branches')
      .insert([{
        name,
        slug: candidate,
        address: body.address || null,
        phone: body.phone || null,
        is_active: body.is_active ?? true,
        sort_order: (maxRow?.sort_order ?? 0) + 1,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ branch: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create branch' }, { status: 500 });
  }
}

/** PUT /api/admin/branches — update a branch (rename, address, phone, active) */
export async function PUT(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Branch id is required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.address === 'string') updates.address = body.address;
    if (typeof body.phone === 'string') updates.phone = body.phone;
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('branches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ branch: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update branch' }, { status: 500 });
  }
}
