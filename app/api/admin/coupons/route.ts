import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ coupons: data || [] });
  } catch (e: any) {
    console.error('Admin coupons GET error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch coupons' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const code = String(body?.code || '').trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const rawType = String(body.type || body.discount_type || 'percentage').toLowerCase();
    const type =
      rawType === 'fixed' || rawType === 'fixed amount' || rawType === 'fixed_amount'
        ? 'fixed_amount'
        : rawType === 'free_shipping' || rawType === 'free shipping'
          ? 'free_shipping'
          : 'percentage';

    const payload = {
      code,
      description: body.description || null,
      type,
      value: Number(body.value ?? body.discount_value ?? 0),
      minimum_purchase: Number(body.minimum_purchase ?? body.min_purchase_amount ?? 0),
      maximum_discount: body.maximum_discount != null ? Number(body.maximum_discount) : null,
      usage_limit: body.usage_limit != null ? Number(body.usage_limit) : null,
      usage_count: 0,
      per_user_limit: body.per_user_limit != null ? Number(body.per_user_limit) : 1,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      is_active: body.is_active !== false,
      metadata: body.metadata || {},
    };

    const { data, error } = await supabaseAdmin.from('coupons').insert([payload]).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Admin coupons POST error:', e);
    return NextResponse.json({ error: e.message || 'Failed to create coupon' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const body = await request.json();
    const id = body?.id;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.code !== undefined) updates.code = String(body.code).trim().toUpperCase();
    if (body.description !== undefined) updates.description = body.description;
    if (body.type !== undefined || body.discount_type !== undefined) {
      const rawType = String(body.type || body.discount_type || '').toLowerCase();
      updates.type =
        rawType === 'fixed' || rawType === 'fixed amount' || rawType === 'fixed_amount'
          ? 'fixed_amount'
          : rawType === 'free_shipping' || rawType === 'free shipping'
            ? 'free_shipping'
            : 'percentage';
    }
    if (body.value !== undefined || body.discount_value !== undefined) {
      updates.value = Number(body.value ?? body.discount_value);
    }
    if (body.minimum_purchase !== undefined || body.min_purchase_amount !== undefined) {
      updates.minimum_purchase = Number(body.minimum_purchase ?? body.min_purchase_amount);
    }
    if (body.maximum_discount !== undefined) updates.maximum_discount = body.maximum_discount;
    if (body.usage_limit !== undefined) updates.usage_limit = body.usage_limit;
    if (body.start_date !== undefined) updates.start_date = body.start_date;
    if (body.end_date !== undefined) updates.end_date = body.end_date;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('coupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Admin coupons PUT error:', e);
    return NextResponse.json({ error: e.message || 'Failed to update coupon' }, { status: 500 });
  }
}
