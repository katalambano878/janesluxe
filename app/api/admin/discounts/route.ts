import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Markdowns lower the stored price of chosen products and keep the original
 * in metadata.discount, so ending a markdown restores the exact old prices.
 * They do not stack: re-applying always starts from the saved original.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Markdown = {
  original_price: number;
  original_compare_at: number | null;
  type: 'percent' | 'fixed';
  value: number;
  applied_at: string;
  applied_by: string;
};

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function markdownPrice(base: number, type: Markdown['type'], value: number) {
  return round(type === 'percent' ? base * (1 - value / 100) : base - value);
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && UUID.test(v)).slice(0, 500) : [];
}

function storeSaleRunning(): boolean {
  return false;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const [products, categories] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.sku, p.status::text AS status, p.price::float AS price,
              p.compare_at_price::float AS compare_at_price, p.category_id, c.name AS category,
              p.metadata->'discount' AS markdown,
              (SELECT COUNT(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position NULLS LAST LIMIT 1) AS image
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.status <> 'archived'
        ORDER BY (p.metadata ? 'discount') DESC, p.name`
    ),
    query(`SELECT id, name FROM categories WHERE status = 'active' ORDER BY position NULLS LAST, name`),
  ]);

  return NextResponse.json({
    products: products.rows,
    categories: categories.rows,
    storeSaleRunning: storeSaleRunning(),
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const user = gate.auth.user;
  const member = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.email || 'Admin',
    role: gate.auth.role,
  };

  const body = await request.json().catch(() => ({}));
  const type: Markdown['type'] = body.type === 'fixed' ? 'fixed' : 'percent';
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'Enter how much to take off.' }, { status: 400 });
  }
  if (type === 'percent' && value >= 90) {
    return NextResponse.json({ error: 'Keep percentage markdowns below 90%.' }, { status: 400 });
  }
  if (storeSaleRunning()) {
    return NextResponse.json(
      { error: 'A whole-store sale is on. Turn it off first so products are not discounted twice.' },
      { status: 409 }
    );
  }

  const productIds = ids(body.productIds);
  if (productIds.length === 0) return NextResponse.json({ error: 'Choose at least one product.' }, { status: 400 });

  const { rows: products } = await query<{
    id: string;
    name: string;
    price: number;
    compare_at_price: number | null;
    metadata: { discount?: Markdown } | null;
  }>(
    `SELECT id, name, price::float AS price, compare_at_price::float AS compare_at_price, metadata
       FROM products WHERE id = ANY($1::uuid[])`,
    [productIds]
  );

  const appliedAt = new Date().toISOString();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const p of products) {
    const previous: Markdown | undefined = p.metadata?.discount;
    const base = previous?.original_price ?? p.price;
    const next = markdownPrice(base, type, value);
    if (!(base > 0) || next <= 0) {
      skipped.push(p.name);
      continue;
    }
    const markdown: Markdown = {
      original_price: base,
      original_compare_at: previous ? previous.original_compare_at : p.compare_at_price,
      type,
      value,
      applied_at: appliedAt,
      applied_by: member.name,
    };
    await query(
      `UPDATE products
          SET price = $2, compare_at_price = $3,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('discount', $4::jsonb),
              updated_at = now()
        WHERE id = $1`,
      [p.id, next, base, JSON.stringify(markdown)]
    );

    const { rows: variants } = await query<{
      id: string;
      price: number;
      compare_at_price: number | null;
      metadata: { discount?: Markdown } | null;
    }>(
      `SELECT id, price::float AS price, compare_at_price::float AS compare_at_price, metadata
         FROM product_variants WHERE product_id = $1`,
      [p.id]
    );
    for (const v of variants) {
      const vPrev: Markdown | undefined = v.metadata?.discount;
      const vBase = vPrev?.original_price ?? v.price;
      const vNext = markdownPrice(vBase, type, value);
      if (!(vBase > 0) || vNext <= 0) continue;
      await query(
        `UPDATE product_variants
            SET price = $2, compare_at_price = $3,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('discount', $4::jsonb),
                updated_at = now()
          WHERE id = $1`,
        [
          v.id,
          vNext,
          vBase,
          JSON.stringify({
            ...markdown,
            original_price: vBase,
            original_compare_at: vPrev ? vPrev.original_compare_at : v.compare_at_price,
          }),
        ]
      );
    }
    applied.push(p.name);
  }

  const off = type === 'percent' ? `${value}%` : `GH₵${value.toFixed(2)}`;
  return NextResponse.json({
    message:
      `${off} off ${applied.length} product${applied.length === 1 ? '' : 's'}.` +
      (skipped.length ? ` Skipped ${skipped.join(', ')} because the price would drop to zero.` : ''),
  });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const body = await request.json().catch(() => ({}));
  const productIds = body.all === true ? null : ids(body.productIds);
  if (productIds && productIds.length === 0) {
    return NextResponse.json({ error: 'Choose which markdowns to end.' }, { status: 400 });
  }

  const restore = (table: 'products' | 'product_variants', scope: string) => `
    UPDATE ${table}
       SET price = (metadata->'discount'->>'original_price')::numeric,
           compare_at_price = NULLIF(metadata->'discount'->>'original_compare_at', '')::numeric,
           metadata = metadata - 'discount',
           updated_at = now()
     WHERE metadata ? 'discount' AND ${scope}
     RETURNING id`;

  const productScope = productIds ? 'id = ANY($1::uuid[])' : 'TRUE';
  const variantScope = productIds ? 'product_id = ANY($1::uuid[])' : 'TRUE';
  const params = productIds ? [productIds] : [];

  const restored = await query(restore('products', productScope), params);
  await query(restore('product_variants', variantScope), params);

  return NextResponse.json({
    message: `Original prices are back on ${restored.rowCount} product${restored.rowCount === 1 ? '' : 's'}.`,
  });
}