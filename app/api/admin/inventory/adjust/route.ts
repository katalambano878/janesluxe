import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Change = {
  kind: 'product' | 'variant';
  id: string;
  productId: string;
  to: number;
};

function changesOf(value: unknown): Change[] {
  if (!Array.isArray(value)) return [];
  const out: Change[] = [];
  for (const raw of value.slice(0, 500)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const kind = row.kind === 'variant' ? 'variant' : row.kind === 'product' ? 'product' : null;
    const id = typeof row.id === 'string' ? row.id : '';
    const productId = typeof row.productId === 'string' ? row.productId : '';
    const to = Number(row.to);
    if (!kind || !UUID.test(id) || !UUID.test(productId) || !Number.isInteger(to) || to < 0 || to > 1_000_000) {
      continue;
    }
    out.push({ kind, id, productId, to });
  }
  return out;
}

/**
 * Sets stock counts. With branchId, writes branch_inventory for the product.
 * Without it, writes products.quantity or product_variants.quantity and
 * recomputes a parent product's quantity from its variants.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const body = await request.json().catch(() => ({}));
  const changes = changesOf(body.changes);
  if (changes.length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const branchId = typeof body.branchId === 'string' && UUID.test(body.branchId) ? body.branchId : '';

  try {
    if (branchId) {
      const productIds = Array.from(new Set(changes.map((c) => c.productId)));
      for (const productId of productIds) {
        const next = changes.filter((c) => c.productId === productId);
        const quantity = next.find((c) => c.kind === 'product')?.to
          ?? next.reduce((sum, c) => sum + c.to, 0);
        const { error } = await supabaseAdmin
          .from('branch_inventory')
          .upsert(
            { branch_id: branchId, product_id: productId, quantity },
            { onConflict: 'branch_id,product_id' }
          );
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ updated: productIds.length });
    }

    for (const change of changes) {
      const table = change.kind === 'variant' ? 'product_variants' : 'products';
      const { error } = await supabaseAdmin
        .from(table)
        .update({ quantity: change.to, updated_at: new Date().toISOString() })
        .eq('id', change.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const parentIds = Array.from(
      new Set(changes.filter((c) => c.kind === 'variant').map((c) => c.productId))
    );
    for (const productId of parentIds) {
      const { data, error } = await supabaseAdmin
        .from('product_variants')
        .select('quantity')
        .eq('product_id', productId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const total = (data || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({ quantity: total, updated_at: new Date().toISOString() })
        .eq('id', productId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ updated: changes.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update stock';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
