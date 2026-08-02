import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { id } = await params;

  try {
    // Fetch current order to preserve metadata
    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('metadata')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        metadata: { ...(order.metadata || {}), manually_marked_paid: true },
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
