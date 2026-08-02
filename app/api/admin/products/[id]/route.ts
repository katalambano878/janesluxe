import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/products/[id]
 * Fetches a single product with variants and images using service role (bypasses RLS).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        categories(id, name),
        product_variants(*),
        product_images(*)
      `)
      .eq('id', productId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ product: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch product' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/products/[id]
 * Updates a product + replaces its variants using the service role (bypasses RLS).
 * Handles duplicate slug by appending a numeric suffix.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { variants = [], ...productData } = body;

    // Ensure slug uniqueness (ignore the current product)
    let slug: string = productData.slug || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let slugCandidate = slug;
    let attempt = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('slug', slugCandidate)
        .neq('id', productId)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slugCandidate = `${slug}-${attempt}`;
    }
    productData.slug = slugCandidate;

    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update(productData)
      .eq('id', productId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Replace variants
    await supabaseAdmin.from('product_variants').delete().eq('product_id', productId);

    if (variants.length > 0) {
      const variantInserts = variants.map((v: any, idx: number) => ({
        product_id: productId,
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

    return NextResponse.json({ ok: true, slug: productData.slug });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update product' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/products/[id]
 * Deletes a product and its dependent rows (images, variants, cart/wishlist, reviews).
 * Fails with 400 if the product has order history.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('id')
      .eq('product_id', productId)
      .limit(1);
    if (orderItems && orderItems.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product that has been ordered. Consider archiving it instead.' },
        { status: 400 }
      );
    }

    await supabaseAdmin.from('cart_items').delete().eq('product_id', productId);
    await supabaseAdmin.from('wishlist_items').delete().eq('product_id', productId);

    const { data: reviews } = await supabaseAdmin.from('reviews').select('id').eq('product_id', productId);
    if (reviews?.length) {
      const reviewIds = reviews.map((r) => r.id);
      await supabaseAdmin.from('review_images').delete().in('review_id', reviewIds);
      await supabaseAdmin.from('reviews').delete().eq('product_id', productId);
    }

    await supabaseAdmin.from('product_images').delete().eq('product_id', productId);
    await supabaseAdmin.from('product_variants').delete().eq('product_id', productId);

    const { error } = await supabaseAdmin.from('products').delete().eq('id', productId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete product' }, { status: 500 });
  }
}
