import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { query } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/admin/dashboard?branch=<id>
 * Aggregated stats — never returns the full orders table.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branch');

    const statsSql = `
      SELECT
        COUNT(*)::int AS order_count,
        COUNT(*) FILTER (
          WHERE payment_status = 'paid' AND status::text <> 'cancelled'
        )::int AS paid_count,
        COALESCE(SUM(total) FILTER (
          WHERE payment_status = 'paid' AND status::text <> 'cancelled'
        ), 0)::float AS revenue,
        COUNT(DISTINCT email)::int AS unique_customers
      FROM orders
      WHERE ($1::uuid IS NULL OR branch_id = $1::uuid)
    `;

    const chartSql = `
      SELECT
        (created_at AT TIME ZONE 'UTC')::date AS day,
        COALESCE(SUM(total), 0)::float AS revenue
      FROM orders
      WHERE payment_status = 'paid'
        AND status::text <> 'cancelled'
        AND created_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'
        AND ($1::uuid IS NULL OR branch_id = $1::uuid)
      GROUP BY 1
      ORDER BY 1
    `;

    const [statsRes, chartRes] = await Promise.all([
      query<{
        order_count: number;
        paid_count: number;
        revenue: number;
        unique_customers: number;
      }>(statsSql, [branchId]),
      query<{ day: string; revenue: number }>(chartSql, [branchId]),
    ]);

    const stats = statsRes.rows[0] || {
      order_count: 0,
      paid_count: 0,
      revenue: 0,
      unique_customers: 0,
    };

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const chartMap = new Map(
      chartRes.rows.map((r) => [String(r.day).slice(0, 10), Number(r.revenue) || 0])
    );
    const chart = last7Days.map((day) => ({
      date: day,
      revenue: chartMap.get(day) || 0,
    }));

    let recentQuery = supabaseAdmin
      .from('orders')
      .select(
        'id, order_number, user_id, email, created_at, total, status, payment_status, shipping_address'
      )
      .order('created_at', { ascending: false })
      .limit(5);
    if (branchId) recentQuery = recentQuery.eq('branch_id', branchId);
    const { data: recentOrders, error: recentError } = await recentQuery;
    if (recentError) throw recentError;

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
      stats: {
        orderCount: stats.order_count,
        paidCount: stats.paid_count,
        revenue: Number(stats.revenue) || 0,
        uniqueCustomers: stats.unique_customers,
        avgOrderValue:
          stats.paid_count > 0 ? Number(stats.revenue) / stats.paid_count : 0,
      },
      chart,
      recentOrders: recentOrders || [],
      lowStock,
      products,
    });
  } catch (e: any) {
    console.error('Admin dashboard API error:', e);
    return NextResponse.json({ error: e.message || 'Dashboard failed' }, { status: 500 });
  }
}
