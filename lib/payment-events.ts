import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type WebhookProcessingStatus = 'received' | 'processed' | 'ignored' | 'failed';

/**
 * Record a payment webhook/callback for audit + idempotency.
 * Returns { duplicate: true } when the same gateway event/payload was already stored.
 */
export async function recordPaymentWebhookEvent(params: {
  gateway: 'moolre' | 'paystack' | string;
  externalEventId?: string | null;
  externalRef?: string | null;
  orderNumber?: string | null;
  amount?: number | null;
  currency?: string | null;
  payload?: unknown;
  status?: WebhookProcessingStatus;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ id?: string; duplicate: boolean; error?: string }> {
  const payloadHash = params.payload
    ? createHash('sha256').update(JSON.stringify(params.payload)).digest('hex')
    : null;

  const row = {
    gateway: params.gateway,
    external_event_id: params.externalEventId || null,
    external_ref: params.externalRef || null,
    order_number: params.orderNumber || null,
    payload_hash: payloadHash,
    processing_status: params.status || 'received',
    failure_reason: params.failureReason || null,
    amount: params.amount ?? null,
    currency: params.currency || null,
    metadata: params.metadata || {},
    processed_at:
      params.status === 'processed' || params.status === 'ignored'
        ? new Date().toISOString()
        : null,
  };

  const { data, error } = await supabaseAdmin
    .from('payment_webhook_events')
    .insert([row])
    .select('id')
    .maybeSingle();

  if (error) {
    const msg = error.message || '';
    // Unique violation → duplicate event
    if (/duplicate|unique|23505/i.test(msg)) {
      return { duplicate: true };
    }
    return { duplicate: false, error: msg };
  }

  return { id: data?.id, duplicate: false };
}

export async function markPaymentWebhookProcessed(
  id: string,
  status: WebhookProcessingStatus = 'processed',
  failureReason?: string | null
) {
  await supabaseAdmin
    .from('payment_webhook_events')
    .update({
      processing_status: status,
      failure_reason: failureReason || null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);
}
