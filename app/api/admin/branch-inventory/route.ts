import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/branch-inventory
 * Sets the stock quantity of a product at a specific branch.
 * Body: { branch_id, product_id, quantity }
 */
export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

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
