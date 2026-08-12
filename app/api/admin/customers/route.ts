import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10) || 500, 1000);

    const { data: customerRows, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    let customers = customerRows || [];

    // If customers table is sparse, supplement from profiles + distinct order emails
    if (customers.length < 5) {
      const seenEmails = new Set(customers.map((c) => c.email?.toLowerCase()).filter(Boolean));

      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, phone, created_at, role')
        .order('created_at', { ascending: false })
        .limit(200);

      for (const profile of profiles || []) {
        if (profile.role && profile.role !== 'customer') continue;
        const emailKey = profile.email?.toLowerCase();
        if (!emailKey || seenEmails.has(emailKey)) continue;
        seenEmails.add(emailKey);
        customers.push({
          id: profile.id,
          email: profile.email,
          phone: profile.phone,
          full_name: profile.full_name,
          first_name: null,
          last_name: null,
          user_id: profile.id,
          total_orders: 0,
          total_spent: 0,
          last_order_at: null,
          created_at: profile.created_at,
        });
      }

      const { data: orderEmails } = await supabaseAdmin
        .from('orders')
        .select('email, phone, shipping_address, created_at, total, status')
        .not('email', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      const guestMap = new Map<string, any>();
      for (const order of orderEmails || []) {
        const emailKey = order.email?.toLowerCase();
        if (!emailKey || seenEmails.has(emailKey)) continue;

        const addr = order.shipping_address || {};
        const firstName = addr.firstName || '';
        const lastName = addr.lastName || '';
        const fullName = addr.full_name || `${firstName} ${lastName}`.trim() || 'Guest';

        const existing = guestMap.get(emailKey);
        if (!existing) {
          guestMap.set(emailKey, {
            email: order.email,
            phone: order.phone || addr.phone,
            full_name: fullName,
            first_name: firstName || null,
            last_name: lastName || null,
            user_id: null,
            total_orders: order.status !== 'cancelled' ? 1 : 0,
            total_spent: order.status !== 'cancelled' ? Number(order.total) || 0 : 0,
            last_order_at: order.created_at,
            created_at: order.created_at,
          });
        } else if (order.status !== 'cancelled') {
          existing.total_orders += 1;
          existing.total_spent += Number(order.total) || 0;
          if (new Date(order.created_at) > new Date(existing.last_order_at)) {
            existing.last_order_at = order.created_at;
          }
        }
      }

      for (const [, guest] of guestMap) {
        seenEmails.add(guest.email.toLowerCase());
        customers.push({
          id: `guest-${guest.email}`,
          ...guest,
        });
      }
    }

    return NextResponse.json({ customers });
  } catch (e: any) {
    console.error('Admin customers API error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch customers' }, { status: 500 });
  }
}
