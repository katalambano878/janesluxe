import 'server-only';

import { query } from '@/lib/db/pool';

/**
 * Stock periods: the owner takes stock, then starts a new period so the dashboard counts
 * sales from that moment. Nothing is deleted. A closed period keeps its dates and totals here,
 * and the orders themselves stay in the orders table.
 */
export const STOCK_PERIODS_KEY = 'stock_periods';

export type ClosedPeriod = {
  id: string;
  /** null means "since the store opened". */
  start: string | null;
  end: string;
  revenue: number;
  orders: number;
  itemsSold: number;
  closedBy: string;
};

export type StockPeriods = {
  /** When the current period began; null until the first stock take. */
  currentStart: string | null;
  history: ClosedPeriod[];
};

export type SalesTotals = {
  /** Sum of order totals, the same figure the dashboard shows. */
  revenue: number;
  orders: number;
  itemsSold: number;
  /** Sum of the product lines. Differs from revenue only by delivery fees, discounts or edited orders. */
  itemsRevenue: number;
};

export type SoldProduct = {
  key: string;
  productId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  unitsSold: number;
  orders: number;
  revenue: number;
};

/** A sale counts once it is paid and has not been cancelled or refunded. */
const COUNTED = `o.payment_status = 'paid' AND o.status NOT IN ('cancelled', 'refunded')`;
const IN_RANGE = `($1::timestamptz IS NULL OR o.created_at >= $1) AND ($2::timestamptz IS NULL OR o.created_at < $2)`;

function isIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parse(value: unknown): StockPeriods {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const history = Array.isArray(raw.history) ? raw.history : [];
  return {
    currentStart: isIso(raw.currentStart) ? raw.currentStart : null,
    history: history
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && isIso((p as { end?: unknown }).end))
      .map((p) => ({
        id: String(p.id || p.end),
        start: isIso(p.start) ? p.start : null,
        end: String(p.end),
        revenue: Number(p.revenue) || 0,
        orders: Number(p.orders) || 0,
        itemsSold: Number(p.itemsSold) || 0,
        closedBy: typeof p.closedBy === 'string' ? p.closedBy : '',
      })),
  };
}

export async function readStockPeriods(): Promise<StockPeriods> {
  const { rows } = await query<{ value: unknown }>(
    `SELECT value FROM store_settings WHERE key = $1 LIMIT 1`,
    [STOCK_PERIODS_KEY]
  );
  return parse(rows[0]?.value);
}

export async function writeStockPeriods(value: StockPeriods): Promise<void> {
  await query(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [STOCK_PERIODS_KEY, JSON.stringify(value)]
  );
}

/** Totals for sales placed from `from` up to, but not including, `to`. null leaves that side open. */
export async function salesTotals(from: string | null, to: string | null): Promise<SalesTotals> {
  const { rows } = await query<{ revenue: number; orders: number; items_sold: number; items_revenue: number }>(
    `SELECT COALESCE(SUM(o.total), 0)::float AS revenue,
            COUNT(*)::int AS orders,
            COALESCE(SUM(i.qty), 0)::int AS items_sold,
            COALESCE(SUM(i.amount), 0)::float AS items_revenue
       FROM orders o
       LEFT JOIN (
         SELECT order_id, SUM(quantity) AS qty, SUM(total_price) AS amount FROM order_items GROUP BY order_id
       ) i ON i.order_id = o.id
      WHERE ${COUNTED} AND ${IN_RANGE}`,
    [from, to]
  );
  const row = rows[0];
  return {
    revenue: Number(row?.revenue) || 0,
    orders: Number(row?.orders) || 0,
    itemsSold: Number(row?.items_sold) || 0,
    itemsRevenue: Number(row?.items_revenue) || 0,
  };
}

/** Every product sold in the range, biggest earner first. */
export async function soldByProduct(from: string | null, to: string | null): Promise<SoldProduct[]> {
  const { rows } = await query<{
    key: string;
    product_id: string | null;
    name: string | null;
    sku: string | null;
    category: string | null;
    units_sold: number;
    orders: number;
    revenue: number;
  }>(
    `SELECT COALESCE(oi.product_id::text, 'name:' || oi.product_name) AS key,
            MAX(oi.product_id::text) AS product_id,
            COALESCE(MAX(p.name), MAX(oi.product_name)) AS name,
            COALESCE(MAX(p.sku), MAX(oi.sku)) AS sku,
            MAX(c.name) AS category,
            COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
            COUNT(DISTINCT oi.order_id)::int AS orders,
            COALESCE(SUM(oi.total_price), 0)::float AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${COUNTED} AND ${IN_RANGE}
      GROUP BY 1
      ORDER BY revenue DESC, name ASC`,
    [from, to]
  );
  return rows.map((row) => ({
    key: row.key,
    productId: row.product_id,
    name: row.name || 'Unnamed product',
    sku: row.sku,
    category: row.category,
    unitsSold: Number(row.units_sold) || 0,
    orders: Number(row.orders) || 0,
    revenue: Number(row.revenue) || 0,
  }));
}