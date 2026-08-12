import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

async function fetchMemories(conversation: {
  user_id?: string | null;
  customer_email?: string | null;
}) {
  if (conversation.user_id) {
    const { data } = await supabaseAdmin
      .from('ai_memory')
      .select('*')
      .eq('customer_id', conversation.user_id)
      .order('created_at', { ascending: false });
    return data || [];
  }
  if (conversation.customer_email) {
    const { data } = await supabaseAdmin
      .from('ai_memory')
      .select('*')
      .eq('customer_email', conversation.customer_email)
      .order('created_at', { ascending: false });
    return data || [];
  }
  return [];
}

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { id } = await context.params;
    const { data: conversation, error } = await supabaseAdmin
      .from('chat_conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const memories = await fetchMemories(conversation);
    return NextResponse.json({ conversation, memories });
  } catch (e: unknown) {
    console.error('Support conversation GET error:', e);
    const message = e instanceof Error ? e.message : 'Failed to load conversation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.is_resolved === 'boolean') {
      updates.is_resolved = body.is_resolved;
    }
    if (typeof body.is_escalated === 'boolean') {
      updates.is_escalated = body.is_escalated;
      if (body.is_escalated) {
        updates.escalated_at = body.escalated_at || new Date().toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: conversation, error } = await supabaseAdmin
      .from('chat_conversations')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !conversation) {
      return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ conversation });
  } catch (e: unknown) {
    console.error('Support conversation PATCH error:', e);
    const message = e instanceof Error ? e.message : 'Failed to update conversation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const { data: conversation } = await supabaseAdmin
      .from('chat_conversations')
      .select('user_id, customer_email')
      .eq('id', id)
      .single();

    const { data: memory, error } = await supabaseAdmin
      .from('ai_memory')
      .insert({
        customer_id: conversation?.user_id || body.customer_id || null,
        customer_email: conversation?.customer_email || body.customer_email || null,
        memory_type: body.memory_type || 'context',
        content: body.content.trim(),
        importance: body.importance || 'normal',
        source_conversation_id: id,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memory }, { status: 201 });
  } catch (e: unknown) {
    console.error('Support conversation POST error:', e);
    const message = e instanceof Error ? e.message : 'Failed to add memory';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('memoryId');
    if (!memoryId) {
      return NextResponse.json({ error: 'memoryId query param required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('ai_memory').delete().eq('id', memoryId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('Support conversation DELETE error:', e);
    const message = e instanceof Error ? e.message : 'Failed to delete memory';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
