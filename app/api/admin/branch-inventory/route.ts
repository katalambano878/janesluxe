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

/**
 * PUT /api/admin/branch-inventory
 * Sets the stock quantity of a product at a specific branch.
 * Body: { branch_id, product_id, quantity }
 */
export async function PUT(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const branchId = String(body.branch_id || '');
    const productId = String(body.product_id || '');
    const quantity = Number(body.quantity);

    if (!branchId || !productId || !Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: 'branch_id, product_id and a non-negative quantity are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('branch_inventory')
      .upsert(
        { branch_id: branchId, product_id: productId, quantity: Math.floor(quantity) },
        { onConflict: 'branch_id,product_id' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ inventory: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update branch inventory' }, { status: 500 });
  }
}
