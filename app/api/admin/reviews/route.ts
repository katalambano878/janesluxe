import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/150';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { data: reviews, error } = await supabaseAdmin
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const productIds = [...new Set((reviews || []).map((r) => r.product_id).filter(Boolean))];
    const userIds = [...new Set((reviews || []).map((r) => r.user_id).filter(Boolean))];

    const productMap = new Map<string, { name: string; image: string }>();
    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name')
        .in('id', productIds);

      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, url, position')
        .in('product_id', productIds)
        .order('position', { ascending: true });

      const imageByProduct = new Map<string, string>();
      for (const img of images || []) {
        if (!imageByProduct.has(img.product_id)) {
          imageByProduct.set(img.product_id, img.url);
        }
      }

      for (const p of products || []) {
        productMap.set(p.id, {
          name: p.name,
          image: imageByProduct.get(p.id) || PLACEHOLDER_IMAGE,
        });
      }
    }

    const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      for (const p of profiles || []) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
    }

    const formatted = (reviews || []).map((r) => {
      const product = productMap.get(r.product_id) || { name: 'Unknown Product', image: PLACEHOLDER_IMAGE };
      const profile = r.user_id ? profileMap.get(r.user_id) : null;
      const statusRaw = r.status || 'pending';
      const status =
        typeof statusRaw === 'string'
          ? statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase()
          : 'Pending';

      return {
        id: r.id,
        customer: {
          name: profile?.full_name || 'Anonymous',
          email: profile?.email || 'N/A',
        },
        product: {
          name: product.name,
          image: product.image,
        },
        rating: r.rating,
        title: r.title,
        comment: r.content,
        date: r.created_at,
        status,
        helpful: r.helpful_votes || 0,
      };
    });

    return NextResponse.json({ reviews: formatted });
  } catch (e: any) {
    console.error('Admin reviews API error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch reviews' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      updates.status = String(body.status).toLowerCase();
    }
    if (body.is_approved !== undefined) {
      updates.status = body.is_approved ? 'approved' : 'rejected';
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No update fields provided' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .update(updates)
      .in('id', ids)
      .select();

    if (error) throw error;
    return NextResponse.json({ updated: data?.length || 0, reviews: data || [] });
  } catch (e: any) {
    console.error('Admin reviews PATCH error:', e);
    return NextResponse.json({ error: e.message || 'Failed to update reviews' }, { status: 500 });
  }
}
