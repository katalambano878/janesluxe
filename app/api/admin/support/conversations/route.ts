import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function matchesSearch(conv: Record<string, unknown>, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  const fields = [
    conv.customer_name,
    conv.customer_email,
    conv.summary,
    conv.session_id,
    typeof conv.messages === 'string' ? conv.messages : JSON.stringify(conv.messages ?? ''),
  ];
  return fields.some((f) => String(f ?? '').toLowerCase().includes(term));
}

async function fallbackList(
  search: string,
  sentiment: string,
  status: string,
  limit: number,
  offset: number
) {
  let query = supabaseAdmin
    .from('chat_conversations')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false });

  if (sentiment) query = query.eq('sentiment', sentiment);
  if (status === 'true') query = query.eq('is_resolved', true);
  else if (status === 'false') query = query.or('is_resolved.eq.false,is_resolved.is.null');
  else if (status === 'escalated') query = query.eq('is_escalated', true);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  let conversations = (data || []) as Record<string, unknown>[];
  if (search) {
    conversations = conversations.filter((c) => matchesSearch(c, search));
  }

  return { conversations, total: search ? conversations.length : count ?? conversations.length };
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sentiment = searchParams.get('sentiment') || '';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'search_chat_conversations',
      {
        p_search: search || null,
        p_sentiment: sentiment || null,
        p_resolved: status === 'escalated' ? null : status || null,
        p_limit: limit,
        p_offset: offset,
      }
    );

    if (!rpcError && rpcData != null) {
      let conversations = rpcData as Record<string, unknown>[];
      if (status === 'escalated') {
        conversations = conversations.filter((c) => c.is_escalated === true);
      }
      if (search) {
        conversations = conversations.filter((c) => matchesSearch(c, search));
      }

      let total = conversations.length;
      if (!search && status !== 'escalated') {
        let countQuery = supabaseAdmin
          .from('chat_conversations')
          .select('*', { count: 'exact', head: true });
        if (sentiment) countQuery = countQuery.eq('sentiment', sentiment);
        if (status === 'true') countQuery = countQuery.eq('is_resolved', true);
        else if (status === 'false') countQuery = countQuery.or('is_resolved.eq.false,is_resolved.is.null');
        const { count } = await countQuery;
        total = count ?? conversations.length;
      } else if (status === 'escalated') {
        const { count } = await supabaseAdmin
          .from('chat_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('is_escalated', true);
        total = count ?? conversations.length;
      }

      return NextResponse.json({ conversations, total });
    }

    const result = await fallbackList(search, sentiment, status, limit, offset);
    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error('Support conversations API error:', e);
    const message = e instanceof Error ? e.message : 'Failed to load conversations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
