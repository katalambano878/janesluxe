import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** A shopper counts as live if their tab pinged within this window. */
const ACTIVE_WINDOW_SECONDS = 90;

function stageFor(page: string, cartItems: number): string {
  if (page.startsWith('/checkout') || page.startsWith('/pay')) return 'checkout';
  if (page.startsWith('/cart')) return 'cart';
  if (cartItems > 0) return 'has_bag';
  if (page.startsWith('/product/')) return 'viewing_product';
  return 'browsing';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`live:${getClientIdentifier(request)}`, {
    maxRequests: 20,
    windowSeconds: 60,
  });
  if (!limit.success) return new NextResponse(null, { status: 204 });

  const body = await request.json().catch(() => null);
  const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.slice(0, 64) : '';
  if (!/^[a-z0-9-]{8,64}$/i.test(visitorId)) {
    return NextResponse.json({ error: 'Invalid visitor' }, { status: 400 });
  }
  const page = typeof body?.page === 'string' && body.page.startsWith('/') ? body.page.slice(0, 200) : '/';
  if (page.startsWith('/admin')) return new NextResponse(null, { status: 204 });

  const cartItems = Math.max(0, Math.min(999, Math.floor(Number(body?.cartItems) || 0)));
  const cartValue = Math.max(0, Math.min(1_000_000, Number(body?.cartValue) || 0));

  try {
    await query(
      `INSERT INTO live_sessions (visitor_id, page, stage, cart_items, cart_value, last_seen)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (visitor_id) DO UPDATE
         SET page = EXCLUDED.page, stage = EXCLUDED.stage, cart_items = EXCLUDED.cart_items,
             cart_value = EXCLUDED.cart_value, last_seen = now()`,
      [visitorId, page, stageFor(page, cartItems), cartItems, cartValue]
    );
    await query(
      `INSERT INTO site_visits (visitor_id)
       SELECT $1
        WHERE NOT EXISTS (
          SELECT 1 FROM site_visits
           WHERE visitor_id = $1
             AND visited_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra'
        )`,
      [visitorId]
    );
    if (Math.random() < 0.02) {
      await query(`DELETE FROM live_sessions WHERE last_seen < now() - interval '1 day'`);
    }
  } catch (err) {
    console.error('[live] ping failed', err);
  }
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const [sessions, today] = await Promise.all([
      query<{ visitor_id: string; page: string; stage: string; cart_items: number; cart_value: string; last_seen: string }>(
        `SELECT visitor_id, page, stage, cart_items, cart_value, last_seen
           FROM live_sessions
          WHERE last_seen > now() - make_interval(secs => $1)
          ORDER BY last_seen DESC
          LIMIT 300`,
        [ACTIVE_WINDOW_SECONDS]
      ),
      query<{ visitors: number; web_orders: number; web_revenue: string }>(
        `SELECT
           (SELECT COUNT(DISTINCT visitor_id)::int FROM site_visits
             WHERE visited_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra') AS visitors,
           (SELECT COUNT(*)::int FROM orders
             WHERE payment_status = 'paid' AND COALESCE(metadata->>'pos_sale', '') <> 'true'
               AND created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra') AS web_orders,
           (SELECT COALESCE(SUM(total), 0) FROM orders
             WHERE payment_status = 'paid' AND COALESCE(metadata->>'pos_sale', '') <> 'true'
               AND created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra') AS web_revenue`
      ),
    ]);

    const rows = sessions.rows.map((r) => ({
      id: r.visitor_id.slice(-6),
      page: r.page,
      stage: r.stage,
      cartItems: Number(r.cart_items) || 0,
      cartValue: Number(r.cart_value) || 0,
      lastSeen: r.last_seen,
    }));
    const t = today.rows[0];

    return NextResponse.json({
      windowSeconds: ACTIVE_WINDOW_SECONDS,
      online: rows.length,
      withBag: rows.filter((r) => r.cartItems > 0).length,
      atCheckout: rows.filter((r) => r.stage === 'checkout').length,
      bagValue: rows.reduce((sum, r) => sum + r.cartValue, 0),
      today: {
        visitors: Number(t?.visitors) || 0,
        webOrders: Number(t?.web_orders) || 0,
        webRevenue: Number(t?.web_revenue) || 0,
      },
      sessions: rows,
    });
  } catch (err) {
    console.error('[live] load failed', err);
    return NextResponse.json({ error: 'Could not load live shoppers.' }, { status: 500 });
  }
}