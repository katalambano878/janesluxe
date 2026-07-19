import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    // Prefer the correct column — avoids uuid cast errors on order numbers.
    const isUUID = UUID_RE.test(orderId);
    let query = supabaseAdmin
      .from('orders')
      .select(
        '*, order_items(id, product_id, product_name, variant_name, quantity, unit_price, metadata)'
      );
    query = isUUID ? query.eq('id', orderId) : query.eq('order_number', orderId);
    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const outOfStockItems: string[] = [];

    if (order.order_items?.length) {
      for (const item of order.order_items) {
        if (!item.product_id) continue;

        const { data: product } = await supabaseAdmin
          .from('products')
          .select('quantity, status, name')
          .eq('id', item.product_id)
          .single();

        if (!product) {
          outOfStockItems.push(item.product_name || 'Unknown product');
          continue;
        }

        if (product.status && product.status !== 'active') {
          outOfStockItems.push(item.product_name);
          continue;
        }

        const variantId = item.metadata?.variant_id;
        if (variantId) {
          const { data: variant } = await supabaseAdmin
            .from('product_variants')
            .select('quantity')
            .eq('id', variantId)
            .single();

          if (
            variant &&
            typeof variant.quantity === 'number' &&
            variant.quantity < item.quantity
          ) {
            outOfStockItems.push(
              `${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}`
            );
            continue;
          }
        }

        if (typeof product.quantity === 'number' && product.quantity < item.quantity) {
          outOfStockItems.push(item.product_name);
        }
      }
    }

    return NextResponse.json({
      order,
      stockValid: outOfStockItems.length === 0,
      outOfStockItems,
    });
  } catch (err: any) {
    console.error('[Pay API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
