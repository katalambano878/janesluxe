import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const POS = `(o.metadata->>'pos_sale') = 'true'`;
const LOW_STOCK_AT = 5;

type DayTotals = {
  paid_orders: number;
  unpaid_orders: number;
  cancelled_orders: number;
  pos_orders: number;
  web_orders: number;
  revenue: number;
  pos_revenue: number;
  web_revenue: number;
  discounts: number;
  to_fulfil: number;
};

type PriorDay = { yesterday: number; last_week: number };

const EMPTY_TOTALS: DayTotals = {
  paid_orders: 0,
  unpaid_orders: 0,
  cancelled_orders: 0,
  pos_orders: 0,
  web_orders: 0,
  revenue: 0,
  pos_revenue: 0,
  web_revenue: 0,
  discounts: 0,
  to_fulfil: 0,
};

/** Accra is UTC+0 all year, so a calendar day is a plain UTC range. */
function dayRange(raw: string | null) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  return { day, start: `${day}T00:00:00Z`, end: `${day}T23:59:59.999Z` };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const role = gate.auth.role;

  const { day, start, end } = dayRange(request.nextUrl.searchParams.get('date'));
  const range = [start, end];

  try {
    const [totals, payments, products, staff, orders, previous] = await Promise.all([
      query<DayTotals>(
        `SELECT
           COUNT(*) FILTER (WHERE o.payment_status = 'paid')::int AS paid_orders,
           COUNT(*) FILTER (WHERE o.payment_status <> 'paid' AND o.status <> 'cancelled')::int AS unpaid_orders,
           COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_orders,
           COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND ${POS})::int AS pos_orders,
           COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND NOT ${POS})::int AS web_orders,
           COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::float AS revenue,
           COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND ${POS}), 0)::float AS pos_revenue,
           COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid' AND NOT ${POS}), 0)::float AS web_revenue,
           COALESCE(SUM(o.discount_total) FILTER (WHERE o.payment_status = 'paid'), 0)::float AS discounts,
           COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND o.status NOT IN ('shipped', 'delivered', 'cancelled'))::int AS to_fulfil
         FROM orders o
         WHERE o.created_at BETWEEN $1 AND $2`,
        range
      ),
      query(
        `SELECT COALESCE(NULLIF(o.payment_method, ''), 'other') AS method,
                CASE WHEN ${POS} THEN 'POS' ELSE 'Website' END AS channel,
                COUNT(*)::int AS orders,
                COALESCE(SUM(o.total), 0)::float AS revenue
           FROM orders o
          WHERE o.created_at BETWEEN $1 AND $2 AND o.payment_status = 'paid'
          GROUP BY 1, 2
          ORDER BY revenue DESC`,
        range
      ),
      query(
        `SELECT oi.product_id,
                COALESCE(p.name, oi.product_name, 'Unknown item') AS name,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity) FILTER (WHERE ${POS}), 0)::int AS pos_units,
                COALESCE(SUM(oi.quantity) FILTER (WHERE NOT ${POS}), 0)::int AS web_units,
                COALESCE(SUM(oi.total_price), 0)::float AS revenue,
                p.quantity::int AS stock_left,
                COALESCE(pc.cost_price, p.cost_per_item) AS unit_cost
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN product_costs pc ON pc.product_id = oi.product_id
          WHERE o.created_at BETWEEN $1 AND $2
            AND o.payment_status = 'paid' AND o.status <> 'cancelled'
          GROUP BY oi.product_id, COALESCE(p.name, oi.product_name, 'Unknown item'), p.quantity, pc.cost_price, p.cost_per_item
          ORDER BY revenue DESC
          LIMIT 200`,
        range
      ),
      query(
        `WITH sales AS (
           SELECT o.id, o.metadata->>'sold_by_id' AS staff_id, o.metadata->>'sold_by_name' AS staff_name, o.total
             FROM orders o
            WHERE o.created_at BETWEEN $1 AND $2 AND o.payment_status = 'paid' AND ${POS}
         ), units AS (
           SELECT order_id, SUM(quantity) AS qty FROM order_items
            WHERE order_id IN (SELECT id FROM sales) GROUP BY order_id
         )
         SELECT COALESCE(NULLIF(s.staff_name, ''), 'Unassigned') AS name,
                COUNT(*)::int AS orders,
                COALESCE(SUM(s.total), 0)::float AS revenue,
                COALESCE(SUM(u.qty), 0)::int AS units
           FROM sales s LEFT JOIN units u ON u.order_id = s.id
          GROUP BY s.staff_id, COALESCE(NULLIF(s.staff_name, ''), 'Unassigned')
          ORDER BY revenue DESC`,
        range
      ),
      query(
        `SELECT o.id, o.order_number, o.total::float AS total, o.payment_status, o.payment_method,
                o.status, o.created_at, o.metadata->>'sold_by_name' AS staff_name,
                CASE WHEN ${POS} THEN 'POS' ELSE 'Website' END AS channel,
                TRIM(COALESCE(o.metadata->>'first_name', '') || ' ' || COALESCE(o.metadata->>'last_name', '')) AS customer
           FROM orders o
          WHERE o.created_at BETWEEN $1 AND $2
          ORDER BY o.created_at DESC
          LIMIT 300`,
        range
      ),
      query<PriorDay>(
        `SELECT COALESCE(SUM(total) FILTER (WHERE created_at >= ($1::date - 1) AND created_at < $1::date), 0)::float AS yesterday,
                COALESCE(SUM(total) FILTER (WHERE created_at >= ($1::date - 7) AND created_at < ($1::date - 6)), 0)::float AS last_week
           FROM orders
          WHERE payment_status = 'paid' AND created_at >= ($1::date - 7) AND created_at < $1::date`,
        [day]
      ),
    ]);

    const t = totals.rows[0] ?? EMPTY_TOTALS;
    const prior = previous.rows[0] ?? { yesterday: 0, last_week: 0 };
    const items = products.rows.map((p: {
      product_id: string | null;
      name: string;
      units: number;
      pos_units: number;
      web_units: number;
      revenue: number;
      stock_left: number | null;
      unit_cost: number | null;
    }) => {
      const unitCost = p.unit_cost == null ? null : Number(p.unit_cost);
      return {
        productId: p.product_id,
        name: p.name,
        units: p.units,
        posUnits: p.pos_units,
        webUnits: p.web_units,
        revenue: p.revenue,
        stockLeft: p.stock_left,
        profit: unitCost == null ? null : p.revenue - unitCost * p.units,
      };
    });
    const costed = items.filter((i) => i.profit != null);
    const isAdmin = role === 'admin';

    return NextResponse.json({
      day,
      summary: {
        paidOrders: t.paid_orders || 0,
        unpaidOrders: t.unpaid_orders || 0,
        cancelledOrders: t.cancelled_orders || 0,
        posOrders: t.pos_orders || 0,
        webOrders: t.web_orders || 0,
        revenue: t.revenue || 0,
        posRevenue: t.pos_revenue || 0,
        webRevenue: t.web_revenue || 0,
        discounts: t.discounts || 0,
        toFulfil: t.to_fulfil || 0,
        unitsSold: items.reduce((s, i) => s + i.units, 0),
        averageOrder: Number(t.paid_orders) ? Number(t.revenue) / Number(t.paid_orders) : 0,
        profit: isAdmin && costed.length ? costed.reduce((s, i) => s + (i.profit || 0), 0) : null,
        profitCoverage: items.length ? costed.length / items.length : 0,
      },
      comparison: {
        yesterday: Number(prior.yesterday) || 0,
        lastWeek: Number(prior.last_week) || 0,
      },
      payments: payments.rows,
      items: items.map((i) => (isAdmin ? i : { ...i, profit: null })),
      lowStock: items.filter((i) => i.stockLeft != null && i.stockLeft <= LOW_STOCK_AT),
      staff: staff.rows,
      orders: orders.rows,
    });
  } catch (err) {
    console.error('[end-of-day]', err);
    return NextResponse.json({ error: 'Could not build the end of day report.' }, { status: 500 });
  }
}