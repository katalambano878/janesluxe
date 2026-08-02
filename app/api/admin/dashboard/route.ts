import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dashboard?branch=<id>
 * Returns the datasets the admin dashboard needs, scoped to a branch when given.
 * Uses the service role so it works regardless of client-side Supabase config/RLS.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branch');

    // 1. All orders (for revenue/count/customers/chart)
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select('total, status, payment_status, created_at, email, branch_id');
    if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId);
    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    // 2. Recent orders (any payment status, so placed orders are visible)
    let recentQuery = supabaseAdmin
      .from('orders')
      .select('id, order_number, user_id, email, created_at, total, status, payment_status, shipping_address')
      .order('created_at', { ascending: false })
      .limit(5);
    if (branchId) recentQuery = recentQuery.eq('branch_id', branchId);
    const { data: recentOrders } = await recentQuery;

    // 3. Low stock (per-branch when a branch is selected)
    let lowStock: { name: string; quantity: number }[] = [];
    if (branchId) {
      const { data } = await supabaseAdmin
        .from('branch_inventory')
        .select('quantity, products(name)')
        .eq('branch_id', branchId)
        .lt('quantity', 10)
        .order('quantity', { ascending: true })
        .limit(5);
      lowStock = (data || []).map((row: any) => ({
        name: row.products?.name || 'Unknown product',
        quantity: row.quantity,
      }));
    } else {
      const { data } = await supabaseAdmin
        .from('products')
        .select('name, quantity')
        .lt('quantity', 10)
        .limit(5);
      lowStock = (data || []).map((p: any) => ({ name: p.name, quantity: p.quantity }));
    }

    // 4. A few products for the dashboard product cards
    const { data: productData } = await supabaseAdmin
      .from('products')
      .select('slug, name, quantity, product_images(url), branch_inventory(branch_id, quantity)')
      .limit(4);
    const products = (productData || []).map((p: any) => {
      const branchRow = branchId
        ? (p.branch_inventory || []).find((r: any) => r.branch_id === branchId)
        : null;
      return {
        slug: p.slug,
        name: p.name,
        image: p.product_images?.[0]?.url || null,
        quantity: branchId ? (branchRow?.quantity ?? 0) : p.quantity,
      };
    });

    return NextResponse.json({
      orders: orders || [],
      recentOrders: recentOrders || [],
      lowStock,
      products,
    });
  } catch (e: any) {
    console.error('Admin dashboard API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
