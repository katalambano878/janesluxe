import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { BRANCH_INVENTORY_SELECT, resolveBranchId, applyBranchQuantity } from '@/lib/branch-server';

/**
 * GET /api/storefront/products/[slug]
 * Returns a single product by slug with variants and images (service role, so variants always load).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const branchParam = new URL(request.url).searchParams.get('branch');
  if (!slug) {
    return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    const branchId = await resolveBranchId(branchParam);

    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        categories(name, slug),
        product_variants(id, name, price, quantity, option1, option2, image_url, metadata, sort_order),
        product_images(url, position, alt_text, media_type),
        ${BRANCH_INVENTORY_SELECT}
      `)
      .eq('status', 'active');

    if (isUUID) {
      query = query.or(`id.eq.${slug},slug.eq.${slug}`);
    } else {
      query = query.eq('slug', slug);
    }

    const { data: productData, error } = await query.single();

    if (error || !productData) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Sort variants by sort_order
    if (productData.product_variants) {
      productData.product_variants.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    const payload = branchId ? applyBranchQuantity([productData], branchId)[0] : productData;

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('[Storefront API] Product by slug error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
