import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function tokenMatchesProject(token: string, projectRef: string): boolean {
  if (!projectRef) return false;
  const normalized = token.replace(/^"+|"+$/g, '');
  const payload = decodeJwtPayload(normalized);
  const ref = typeof payload?.ref === 'string' ? payload.ref : '';
  if (ref && ref === projectRef) return true;
  const iss = typeof payload?.iss === 'string' ? payload.iss : '';
  return iss.includes(`https://${projectRef}.supabase.co/auth/v1`);
}

function getAccessToken(request: Request): string | null {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || '';
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (tokenMatchesProject(t, projectRef)) return t;
  }
  const cookieHeader = request.headers.get('cookie') || '';
  const directMatch = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (directMatch) {
    const t = decodeURIComponent(directMatch[1].trim());
    if (tokenMatchesProject(t, projectRef)) return t;
  }
  const projectScopedMatch = cookieHeader.match(/\bsb-[a-z0-9]+-access-token=([^;]+)/i);
  if (projectScopedMatch) {
    const t = decodeURIComponent(projectScopedMatch[1].trim());
    if (tokenMatchesProject(t, projectRef)) return t;
  }
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;
  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0] && tokenMatchesProject(parsed[0], projectRef)) return parsed[0];
    if (parsed?.access_token && tokenMatchesProject(parsed.access_token, projectRef)) return parsed.access_token;
    if (typeof parsed === 'string' && tokenMatchesProject(parsed, projectRef)) return parsed;
  } catch {
    if (tokenMatchesProject(decoded, projectRef)) return decoded;
  }
  return null;
}

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/admin/products/[id]
 * Fetches a single product with variants and images using service role (bypasses RLS).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdmin(request);
  if (err) return err;

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
  const err = await requireAdmin(request);
  if (err) return err;

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
  const err = await requireAdmin(request);
  if (err) return err;

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
