import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { id } = await params;

    let customer: any = null;

    if (id.startsWith('guest-')) {
      const guestEmail = id.slice('guest-'.length);
      const { data: byEmail, error: emailLookupError } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('email', guestEmail)
        .maybeSingle();
      if (emailLookupError) throw emailLookupError;
      if (byEmail) {
        customer = byEmail;
      } else {
        customer = {
          id,
          email: guestEmail,
          full_name: 'Guest',
          phone: null,
          user_id: null,
        };
      }
    } else {
      const { data: customerRow, error: customerError } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (customerError) throw customerError;
      if (customerRow) {
        customer = customerRow;
      } else if (UUID_RE.test(id)) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (profile) customer = profile;
      }
    }

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    let orders: any[] = [];

    if (customer.user_id || UUID_RE.test(id)) {
      const userId = customer.user_id || id;
      const { data: userOrders, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      orders = userOrders || [];
    }

    if (orders.length === 0 && customer.email) {
      const { data: emailOrders, error: emailOrdersError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('email', customer.email)
        .order('created_at', { ascending: false });

      if (emailOrdersError) throw emailOrdersError;
      orders = emailOrders || [];
    }

    return NextResponse.json({ customer, orders });
  } catch (e: any) {
    console.error('Admin customer detail API error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch customer' }, { status: 500 });
  }
}
