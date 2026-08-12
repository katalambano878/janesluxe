import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { id } = await context.params;
    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    let conversation = null;
    if (ticket.conversation_id) {
      const { data: conv } = await supabaseAdmin
        .from('chat_conversations')
        .select('id, session_id, messages, summary, sentiment, customer_name')
        .eq('id', ticket.conversation_id)
        .single();
      conversation = conv;
    }

    return NextResponse.json({ ticket, conversation });
  } catch (e: unknown) {
    console.error('Support ticket GET error:', e);
    const message = e instanceof Error ? e.message : 'Failed to load ticket';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
