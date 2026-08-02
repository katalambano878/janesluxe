import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/admin/pos/orders
 * Create a POS order (and items) using service role so RLS does not block walk-in (user_id: null).
 */
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const {
      order_number,
      email,
      phone,
      status,
      payment_status,
      subtotal,
      discount_total,
      total,
      shipping_method,
      payment_method,
      shipping_address,
      billing_address,
      metadata,
      items,
      mark_paid,
    } = body;

    if (!order_number || total == null || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing order_number, total, or items' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number,
        user_id: null,
        email: email || null,
        phone: phone || null,
        status: status || 'pending',
        payment_status: payment_status || 'pending',
        currency: 'GHS',
        subtotal: Number(subtotal) || 0,
        tax_total: 0,
        shipping_total: 0,
        discount_total: Number(discount_total) || 0,
        total: Number(total) || 0,
        shipping_method: shipping_method || 'pickup',
        payment_method: payment_method || 'cash',
        shipping_address: shipping_address || {},
        billing_address: billing_address || {},
        metadata: metadata || {},
      })
      .select()
      .single();

    if (orderError) {
      console.error('POS order insert error:', orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant_name: item.variant_name || null,
      quantity: item.quantity,
      unit_price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
      metadata: item.metadata || {},
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('POS order_items insert error:', itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    if (mark_paid && (payment_status === 'paid' || payment_method === 'cash' || payment_method === 'card')) {
      try {
        await supabaseAdmin.rpc('mark_order_paid', {
          order_ref: order_number,
          moolre_ref: `POS-${(payment_method || 'cash').toUpperCase()}-${Date.now()}`,
        });
        // POS sales are fulfilled immediately — mark as completed
        await supabaseAdmin
          .from('orders')
          .update({ status: 'completed' })
          .eq('order_number', order_number);
      } catch (e) {
        console.error('mark_order_paid error:', e);
      }
    }

    return NextResponse.json({ order });
  } catch (e: any) {
    console.error('POS orders API error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
