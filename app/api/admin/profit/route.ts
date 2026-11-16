import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VariantRow = { price: number; compare_at_price?: number | null };

function minVariantPrice(variants: VariantRow[], fallback: number): number {
  if (!Array.isArray(variants) || variants.length === 0) return fallback;
  const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : fallback;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  if (gate.auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only administrators can view profit margins.' }, { status: 403 });
  }

  const { rows: products } = await query(
    `SELECT p.id, p.name, p.sku, p.status::text AS status, p.price::float AS price,
            p.compare_at_price::float AS compare_at_price,
            p.quantity, p.metadata, c.name AS category,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position NULLS LAST LIMIT 1) AS image,
            COALESCE((SELECT json_agg(json_build_object('price', v.price, 'compare_at_price', v.compare_at_price))
                        FROM product_variants v WHERE v.product_id = p.id), '[]'::json) AS variants,
            pc.cost_price::float AS cost_price, pc.supplier_name, pc.notes, pc.updated_at AS cost_updated_at,
            COALESCE(sold.units, 0)::int AS units_sold_30d
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_costs pc ON pc.product_id = p.id
       LEFT JOIN (
         SELECT oi.product_id, SUM(oi.quantity) AS units
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.payment_status = 'paid' AND o.created_at > now() - interval '30 days'
          GROUP BY oi.product_id
       ) sold ON sold.product_id = p.id
      WHERE p.status <> 'archived'
      ORDER BY p.name`
  );

  const rows = products.rows.map((p: {
    id: string;
    name: string;
    sku: string | null;
    status: string;
    price: number;
    compare_at_price: number | null;
    quantity: number | null;
    metadata: { discount?: { original_price?: number } } | null;
    category: string | null;
    image: string | null;
    variants: VariantRow[];
    cost_price: number | null;
    supplier_name: string | null;
    notes: string | null;
    cost_updated_at: string | null;
    units_sold_30d: number;
  }) => {
    const markdown = p.metadata?.discount;
    const basePrice = Number(p.price) || 0;
    const regularPrice = Number(markdown?.original_price) || basePrice;
    const sellingPrice = minVariantPrice(p.variants, basePrice);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      status: p.status,
      category: p.category,
      image: p.image,
      stock: p.quantity,
      regularPrice,
      sellingPrice,
      onPromotion: sellingPrice < regularPrice - 0.005,
      costPrice: p.cost_price,
      supplierName: p.supplier_name,
      notes: p.notes,
      costUpdatedAt: p.cost_updated_at,
      unitsSold30d: p.units_sold_30d,
    };
  });

  return NextResponse.json({ products: rows });
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const user = gate.auth.user;
  if (gate.auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only administrators can update profit margins.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const productId = typeof body.productId === 'string' ? body.productId : '';
  if (!UUID.test(productId)) return NextResponse.json({ error: 'Pick a product.' }, { status: 400 });

  const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim().slice(0, 120) : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

  if (body.costPrice === null || body.costPrice === '') {
    await query(`DELETE FROM product_costs WHERE product_id = $1`, [productId]);
    return NextResponse.json({ message: 'Cost cleared.' });
  }

  const cost = Number(body.costPrice);
  if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000) {
    return NextResponse.json({ error: 'Enter what you paid the supplier, in cedis.' }, { status: 400 });
  }

  const { rows } = await query<{ name: string }>(
    `WITH saved AS (
       INSERT INTO product_costs (product_id, supplier_name, cost_price, notes, updated_by, updated_at)
       VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5, now())
       ON CONFLICT (product_id) DO UPDATE
         SET supplier_name = EXCLUDED.supplier_name, cost_price = EXCLUDED.cost_price,
             notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING product_id
     )
     SELECT p.name FROM products p JOIN saved s ON s.product_id = p.id`,
    [productId, supplierName, Math.round(cost * 100) / 100, notes, user.id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  return NextResponse.json({ message: `Saved cost for ${rows[0].name}.` });
}