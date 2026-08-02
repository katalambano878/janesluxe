import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * DELETE /api/admin/categories/[id]
 * Unlinks products from this category (sets category_id to null), then deletes the category.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id: categoryId } = await params;
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing category id' }, { status: 400 });
  }

  try {
    await supabaseAdmin.from('products').update({ category_id: null }).eq('category_id', categoryId);

    const { error } = await supabaseAdmin.from('categories').delete().eq('id', categoryId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete category' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id: categoryId } = await params;
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing category id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();
    const rawSlug = String(body?.slug || '').trim().toLowerCase();
    if (!name || !rawSlug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    const slug = rawSlug.replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)+/g, '');
    let slugCandidate = slug;
    let attempt = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('slug', slugCandidate)
        .neq('id', categoryId)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slugCandidate = `${slug}-${attempt}`;
    }

    const payload = {
      name,
      slug: slugCandidate,
      description: body?.description || '',
      image_url: body?.image_url || '',
      parent_id: body?.parent_id || null,
      status: body?.status || 'active',
      metadata: body?.metadata || {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('categories')
      .update(payload)
      .eq('id', categoryId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update category' }, { status: 500 });
  }
}
