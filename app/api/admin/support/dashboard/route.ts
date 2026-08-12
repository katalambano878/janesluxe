import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    let rawStats: Record<string, unknown> | null = null;
    const { data: statsData, error: statsError } = await supabaseAdmin.rpc(
      'get_support_dashboard_stats'
    );
    if (!statsError && statsData != null) {
      rawStats =
        typeof statsData === 'string'
          ? (JSON.parse(statsData) as Record<string, unknown>)
          : (statsData as Record<string, unknown>);
    }

    const { data: conversations } = await supabaseAdmin
      .from('chat_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(8);

    const { data: tickets } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .in('status', ['open', 'in_progress', 'waiting_customer'])
      .order('created_at', { ascending: false })
      .limit(10);

    const { count: urgentCount } = await supabaseAdmin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('priority', 'urgent')
      .in('status', ['open', 'in_progress', 'waiting_customer']);

    const { count: totalConversations } = await supabaseAdmin
      .from('chat_conversations')
      .select('id', { count: 'exact', head: true });

    // Normalize flat RPC shape into the nested shape the UI expects
    const stats = {
      tickets: {
        open: Number(rawStats?.open_tickets ?? tickets?.length ?? 0),
        urgent: Number(urgentCount ?? 0),
      },
      conversations: {
        today: Number(rawStats?.total_today ?? 0),
        total: Number(totalConversations ?? 0),
        unresolved: Number(rawStats?.unresolved_chats ?? 0),
      },
      ai_performance: {
        resolution_rate: 0,
        escalated: Number(rawStats?.escalated_today ?? 0),
      },
      satisfaction: {
        avg_rating: rawStats?.avg_satisfaction ?? '0',
        total_reviews: 0,
      },
    };

    return NextResponse.json({
      stats,
      conversations: conversations || [],
      tickets: tickets || [],
    });
  } catch (e: unknown) {
    console.error('Support dashboard API error:', e);
    const message = e instanceof Error ? e.message : 'Failed to load dashboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
