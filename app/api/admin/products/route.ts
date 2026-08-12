import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/300?text=No+Image';

/**
 * GET /api/admin/products
 * Returns products with product_images (and categories, variant count) using service role.
 * Use this in the admin products list so images always load regardless of RLS.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'newest';

    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        categories(name),
        product_variants(id),
        product_images(url, position),
        branch_inventory(branch_id, quantity)
      `);

    if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
    if (sortBy === 'price_asc') query = query.order('price', { ascending: true });
    if (sortBy === 'price_desc') query = query.order('price', { ascending: false });
    if (sortBy === 'name') query = query.order('name', { ascending: true });
    if (sortBy === 'stock') query = query.order('quantity', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[Admin products] query failed:', error.message || error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const products = (data || []).map((p: any) => {
      const images = Array.isArray(p.product_images) ? [...p.product_images] : [];
      images.sort((a: any, b: any) => (Number(a.position) ?? 0) - (Number(b.position) ?? 0));
      const firstImageUrl = images.find((img: any) => Number(img.position) === 0)?.url
        || images[0]?.url
        || PLACEHOLDER_IMAGE;
      const variants = Array.isArray(p.product_variants) ? p.product_variants : [];

      return {
        ...p,
        category: p.categories?.name || 'Uncategorized',
        image: firstImageUrl,
        product_images: images,
        // Plain-Postgres compat does not support PostgREST aggregate embeds like
        // product_variants(count) — count ids client-side instead.
        variantsCount: variants.length,
        stock: p.quantity,
        sales: 0,
        rating: p.rating_avg || 0,
      };
    });

    return NextResponse.json(products);
  } catch (e: any) {
    console.error('[Admin products] exception:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Failed to fetch products' }, { status: 500 });
  }
}

/**
 * POST /api/admin/products
 * Creates a new product + variants using the service role (bypasses RLS).
 * Handles duplicate slug by appending a numeric suffix.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const { variants = [], ...productData } = body;

    // Ensure slug is unique
    let slug: string = productData.slug || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let slugCandidate = slug;
    let attempt = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('slug', slugCandidate)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slugCandidate = `${slug}-${attempt}`;
    }
    productData.slug = slugCandidate;

    const { data: newProduct, error: insertError } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (insertError || !newProduct) {
      return NextResponse.json({ error: insertError?.message || 'Failed to create product' }, { status: 500 });
    }

    // Insert variants if any
    if (variants.length > 0) {
      const variantInserts = variants.map((v: any, idx: number) => ({
        product_id: newProduct.id,
        name: v.name || v.color || 'Default',
        sku: v.sku || null,
        price: parseFloat(v.price) || 0,
        quantity: parseInt(v.stock) || 0,
        option1: v.name || null,
        option2: v.color?.trim() || null,
        image_url: v.image_url?.trim() || null,
        sort_order: v.sort_order ?? idx,
        metadata: v.colorHex ? { color_hex: v.colorHex } : {},
      }));
      // Insert in chunks of 100 to avoid payload limits
      const CHUNK = 100;
      for (let i = 0; i < variantInserts.length; i += CHUNK) {
        const chunk = variantInserts.slice(i, i + CHUNK);
        const { error: varError } = await supabaseAdmin.from('product_variants').insert(chunk);
        if (varError) {
          return NextResponse.json({ error: varError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ id: newProduct.id, slug: newProduct.slug });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create product' }, { status: 500 });
  }
}
