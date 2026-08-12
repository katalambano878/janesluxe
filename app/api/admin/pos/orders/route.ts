import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const VALID_ORDER_STATUS = new Set([
  'pending',
  'awaiting_payment',
  'processing',
  'shipped',
  'dispatched_to_rider',
  'delivered',
  'cancelled',
  'refunded',
]);

const VALID_PAYMENT_STATUS = new Set([
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);

/** Map legacy / UI statuses onto the Postgres order_status enum. */
function normalizeOrderStatus(
  raw: unknown,
  opts: { paid: boolean; shippingMethod: string }
): string {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'completed' || s === 'complete' || s === 'done' || s === 'fulfilled') {
    // Immediate POS fulfillment
    return opts.shippingMethod === 'doorstep' || opts.shippingMethod === 'delivery'
      ? 'processing'
      : 'delivered';
  }
  if (VALID_ORDER_STATUS.has(s)) return s;
  if (opts.paid) {
    return opts.shippingMethod === 'doorstep' || opts.shippingMethod === 'delivery'
      ? 'processing'
      : 'delivered';
  }
  return 'awaiting_payment';
}

function normalizePaymentStatus(raw: unknown, paid: boolean): string {
  const s = String(raw || '').toLowerCase().trim();
  if (VALID_PAYMENT_STATUS.has(s)) return s;
  return paid ? 'paid' : 'pending';
}

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
      branch_id,
    } = body;

    if (!order_number || total == null || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing order_number, total, or items' },
        { status: 400 }
      );
    }

    const method = String(payment_method || 'cash').toLowerCase();
    const shipping = String(shipping_method || 'pickup').toLowerCase();
    const wantPaid = Boolean(
      mark_paid ||
        payment_status === 'paid' ||
        method === 'cash' ||
        method === 'card'
    );

    const safeStatus = normalizeOrderStatus(status, {
      paid: wantPaid,
      shippingMethod: shipping,
    });
    const safePaymentStatus = normalizePaymentStatus(payment_status, wantPaid);
    const safeEmail =
      (typeof email === 'string' && email.trim()) || 'pos-walkin@store.local';

    const orderPayload: Record<string, unknown> = {
      order_number,
      user_id: null,
      email: safeEmail,
      phone: phone || null,
      status: safeStatus,
      payment_status: wantPaid ? 'pending' : safePaymentStatus,
      // Insert unpaid first when we'll call mark_order_paid (needs unpaid→paid claim)
      currency: 'GHS',
      subtotal: Number(subtotal) || 0,
      tax_total: 0,
      shipping_total: 0,
      discount_total: Number(discount_total) || 0,
      total: Number(total) || 0,
      shipping_method: shipping || 'pickup',
      payment_method: method || 'cash',
      shipping_address: shipping_address || {},
      billing_address: billing_address || shipping_address || {},
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        pos_sale: true,
      },
    };

    if (branch_id) {
      orderPayload.branch_id = branch_id;
    }

    // For cash/card: insert as awaiting_payment/pending then mark_order_paid
    // so stock reduction runs. Final fulfillment status applied after.
    if (wantPaid) {
      orderPayload.status = 'pending';
      orderPayload.payment_status = 'pending';
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([orderPayload])
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
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      total_price: Number(item.total_price) || 0,
      metadata: item.metadata || {},
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('POS order_items insert error:', itemsError);
      // Roll back empty order shell
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    let finalOrder = order;

    if (wantPaid) {
      const { data: paidJson, error: paidError } = await supabaseAdmin.rpc('mark_order_paid', {
        order_ref: order_number,
        moolre_ref: `POS-${method.toUpperCase()}-${Date.now()}`,
      });

      if (paidError) {
        console.error('mark_order_paid error:', paidError);
        return NextResponse.json(
          { error: paidError.message || 'Failed to mark order paid' },
          { status: 500 }
        );
      }

      // Fulfillment status for POS (enum-safe — never "completed")
      const fulfillStatus = normalizeOrderStatus('completed', {
        paid: true,
        shippingMethod: shipping,
      });

      const { data: updated, error: statusError } = await supabaseAdmin
        .from('orders')
        .update({
          status: fulfillStatus,
          payment_method: method,
          payment_provider: method === 'card' ? 'card' : 'cash',
          metadata: {
            ...(paidJson?.metadata || order.metadata || {}),
            pos_sale: true,
            payment_provider: method === 'card' ? 'card' : 'cash',
          },
        })
        .eq('id', order.id)
        .select()
        .single();

      if (statusError) {
        console.error('POS fulfill status error:', statusError);
      } else if (updated) {
        finalOrder = updated;
      } else if (paidJson) {
        finalOrder = paidJson;
      }
    }

    // Best-effort customer upsert (server-side — no browser supabase)
    try {
      const addr = shipping_address || {};
      const upsertEmail =
        safeEmail !== 'pos-walkin@store.local'
          ? safeEmail
          : phone
            ? `${String(phone).replace(/[^0-9]/g, '')}@pos.local`
            : null;
      if (upsertEmail) {
        await supabaseAdmin.rpc('upsert_customer_from_order', {
          p_email: upsertEmail,
          p_phone: phone || null,
          p_full_name:
            [addr.firstName, addr.lastName].filter(Boolean).join(' ') || null,
          p_first_name: addr.firstName || null,
          p_last_name: addr.lastName || null,
          p_user_id: null,
          p_address: addr,
        });
      }
    } catch (custErr: any) {
      console.warn('POS customer upsert skipped:', custErr?.message || custErr);
    }

    return NextResponse.json({ order: finalOrder });
  } catch (e: any) {
    console.error('POS orders API error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
