import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period');
    const branchId = searchParams.get('branch');

    // Sales stats mode — two-step query for plain Postgres compat
    if (period !== null) {
      let startDate: string | null = null;
      const now = new Date();
      if (period === '24h') { const d = new Date(now); d.setHours(d.getHours() - 24); startDate = d.toISOString(); }
      else if (period === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); startDate = d.toISOString(); }
      else if (period === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); startDate = d.toISOString(); }

      let paidOrdersQuery = supabaseAdmin
        .from('orders')
        .select('id, created_at, status, payment_status, branch_id')
        .eq('payment_status', 'paid')
        .neq('status', 'cancelled');

      if (startDate) paidOrdersQuery = paidOrdersQuery.gte('created_at', startDate);
      if (branchId) paidOrdersQuery = paidOrdersQuery.eq('branch_id', branchId);

      const { data: paidOrders, error: ordersError } = await paidOrdersQuery;
      if (ordersError) throw ordersError;

      const orderIds = (paidOrders || []).map((o: any) => o.id);
      if (orderIds.length === 0) {
        return NextResponse.json({ items: [] });
      }

      const orderMap = new Map((paidOrders || []).map((o: any) => [o.id, o]));
      const { data: orderItems, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('quantity, product_name, product_id, variant_name, total_price, order_id')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      const items = (orderItems || []).map((item: any) => ({
        ...item,
        orders: orderMap.get(item.order_id) || null,
      }));

      return NextResponse.json({ items });
    }

    // Full orders list.
    //
    // The admin page searches and counts over what this returns, so a low cap
    // silently hides older orders and makes them look like they never existed.
    // Keep the ceiling well above the real order count and report the true
    // total so the UI can say when it is showing a partial list.
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '2000', 10) || 2000, 1), 10000);

    let countQuery = supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
    if (branchId) countQuery = countQuery.eq('branch_id', branchId);
    const { count: totalOrders } = await countQuery;

    let ordersQuery = supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        email,
        total,
        status,
        payment_status,
        payment_method,
        shipping_method,
        created_at,
        phone,
        shipping_address,
        metadata,
        branch_id,
        branches (
          name,
          slug
        ),
        order_items (
          quantity,
          product_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId);

    const { data: ordersData, error } = await ordersQuery;

    if (error) throw error;

    const orders = ordersData || [];
    const total = typeof totalOrders === 'number' ? totalOrders : orders.length;
    return NextResponse.json({ orders, total, truncated: total > orders.length });
  } catch (e: any) {
    console.error('Admin orders API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
