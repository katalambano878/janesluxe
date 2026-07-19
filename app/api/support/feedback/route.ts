import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth';

// Public: customers submit chat/ticket feedback from the storefront widget.
export async function POST(req: NextRequest) {
  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from('support_feedback')
    .insert({
      conversation_id: body.conversation_id || null,
      ticket_id: body.ticket_id || null,
      customer_id: body.customer_id || null,
      customer_email: body.customer_email || null,
      rating: body.rating,
      feedback_text: body.feedback_text || null,
      feedback_categories: body.feedback_categories || [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { requireAdmin: true });
  if (!auth.authenticated) return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('support_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
