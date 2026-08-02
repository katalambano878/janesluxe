import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

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
    };

    const { data, error } = await supabaseAdmin.from('categories').insert([payload]).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create category' }, { status: 500 });
  }
}
