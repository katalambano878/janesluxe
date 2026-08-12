import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

function isPosSale(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  return m.pos_sale === true || m.pos_sale === 'true';
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('total, payment_method, payment_status, metadata, created_at')
      .gte('created_at', todayStart.toISOString());

    if (error) throw error;

    const posOrders = (orders || []).filter((o) => isPosSale(o.metadata));
    const paid = posOrders.filter((o) => o.payment_status === 'paid');

    const summary = {
      totalSales: paid.reduce((s, o) => s + Number(o.total || 0), 0),
      orderCount: paid.length,
      cashSales: paid
        .filter((o) => o.payment_method === 'cash')
        .reduce((s, o) => s + Number(o.total || 0), 0),
      cardSales: paid
        .filter((o) => o.payment_method === 'card')
        .reduce((s, o) => s + Number(o.total || 0), 0),
      momoSales: paid
        .filter((o) => o.payment_method === 'paystack' || o.payment_method === 'moolre')
        .reduce((s, o) => s + Number(o.total || 0), 0),
    };

    return NextResponse.json(summary);
  } catch (e: any) {
    console.error('Admin POS summary API error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch POS summary' }, { status: 500 });
  }
}
