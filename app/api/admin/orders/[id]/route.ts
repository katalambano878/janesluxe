import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ORDER_SELECT = `
  *,
  order_items (
    id,
    product_id,
    product_name,
    variant_name,
    sku,
    quantity,
    unit_price,
    total_price,
    metadata,
    products (
      product_images (url)
    )
  )
`;

function coerceOrderNumbers(order: any) {
  if (!order) return order;
  for (const key of ['subtotal', 'shipping_total', 'tax_total', 'discount_total', 'total']) {
    if (order[key] != null) order[key] = Number(order[key]);
  }
  if (Array.isArray(order.order_items)) {
    for (const item of order.order_items) {
      if (item.unit_price != null) item.unit_price = Number(item.unit_price);
      if (item.total_price != null) item.total_price = Number(item.total_price);
      if (item.quantity != null) item.quantity = Number(item.quantity);
    }
  }
  return order;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id } = await params;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let data: any = null;
    let lastError: any = null;

    if (isUUID) {
      const { data: d, error } = await supabaseAdmin
        .from('orders').select(ORDER_SELECT).eq('id', id).single();
      if (!error) data = d;
      else lastError = error;
    }

    if (!data) {
      const { data: d, error } = await supabaseAdmin
        .from('orders').select(ORDER_SELECT).eq('order_number', id).single();
      if (error) {
        console.error('Admin order detail error:', error.message || error, lastError?.message);
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      data = d;
    }

    return NextResponse.json({ order: coerceOrderNumbers(data) });
  } catch (e: any) {
    console.error('Admin order detail exception:', e?.message || e);
    return NextResponse.json({ error: e.message || 'Failed to load order' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id } = await params;

  try {
    const body = await request.json();
    const { status, notes, metadata } = body;

    const updates: Record<string, unknown> = {};
    if (typeof status === 'string') updates.status = status;
    if (typeof notes === 'string') updates.notes = notes;
    if (metadata && typeof metadata === 'object') updates.metadata = metadata;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
