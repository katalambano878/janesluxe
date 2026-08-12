import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    const now = new Date();
    const startDate = new Date(now);
    if (days === 365 || searchParams.get('range') === 'year') {
      startDate.setFullYear(now.getFullYear(), 0, 1);
    } else if (days > 0) {
      startDate.setDate(now.getDate() - days);
    } else {
      startDate.setDate(now.getDate() - 30);
    }
    const isoStart = startDate.toISOString();

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, total, created_at, status, payment_status, email')
      .eq('payment_status', 'paid')
      .neq('status', 'cancelled')
      .gte('created_at', isoStart)
      .order('created_at', { ascending: true });

    if (ordersError) throw ordersError;

    const orderIds = (orders || []).map((o) => o.id);
    let items: any[] = [];

    if (orderIds.length > 0) {
      const { data: orderItems, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('quantity, unit_price, total_price, product_id, product_name, order_id')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      const productIds = [...new Set((orderItems || []).map((i) => i.product_id).filter(Boolean))];
      const productMap = new Map<string, { name: string; category_id: string | null }>();
      const categoryMap = new Map<string, string>();

      if (productIds.length > 0) {
        const { data: products } = await supabaseAdmin
          .from('products')
          .select('id, name, category_id')
          .in('id', productIds);

        const categoryIds = [...new Set((products || []).map((p) => p.category_id).filter(Boolean))];
        if (categoryIds.length > 0) {
          const { data: categories } = await supabaseAdmin
            .from('categories')
            .select('id, name')
            .in('id', categoryIds);

          for (const c of categories || []) {
            categoryMap.set(c.id, c.name);
          }
        }

        for (const p of products || []) {
          productMap.set(p.id, {
            name: p.name,
            category_id: p.category_id,
          });
        }
      }

      items = (orderItems || []).map((item) => {
        const product = item.product_id ? productMap.get(item.product_id) : null;
        const categoryName = product?.category_id
          ? categoryMap.get(product.category_id) || 'Uncategorized'
          : 'Uncategorized';

        return {
          ...item,
          products: {
            name: product?.name || item.product_name || 'Unknown',
            category_id: product?.category_id || null,
            categories: { name: categoryName },
          },
        };
      });
    }

    return NextResponse.json({
      orders: orders || [],
      items,
      startDate: isoStart,
    });
  } catch (e: any) {
    console.error('Admin analytics API error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch analytics' }, { status: 500 });
  }
}
