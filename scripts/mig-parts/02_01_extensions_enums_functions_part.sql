-- upsert_chat_conversation
CREATE OR REPLACE FUNCTION public.upsert_chat_conversation(
  p_session_id text, p_user_id uuid DEFAULT NULL, p_messages jsonb DEFAULT '[]'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.chat_conversations WHERE session_id = p_session_id LIMIT 1;
IF v_id IS NOT NULL THEN
    UPDATE public.chat_conversations SET messages = p_messages, metadata = p_metadata, user_id = COALESCE(p_user_id, user_id), updated_at = now() WHERE id = v_id;
RETURN v_id;
ELSE
    INSERT INTO public.chat_conversations (session_id, user_id, messages, metadata)
    VALUES (p_session_id, p_user_id, p_messages, p_metadata) RETURNING id INTO v_id;
RETURN v_id;
END IF;
END;
$$;
-- get_chat_conversation
CREATE OR REPLACE FUNCTION public.get_chat_conversation(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object('id', id, 'session_id', session_id, 'user_id', user_id,
    'messages', messages, 'metadata', metadata, 'created_at', created_at, 'updated_at', updated_at)
  INTO v_result FROM public.chat_conversations WHERE session_id = p_session_id LIMIT 1;
RETURN COALESCE(v_result, NULL);
END;
$$;
-- generate_ticket_number
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '#(\d+)$') AS integer)), 0) + 1
  INTO v_num FROM support_tickets;
RETURN 'TKT-' || LPAD(v_num::text, 5, '0');
END;
$$;
-- get_ai_memories
CREATE OR REPLACE FUNCTION public.get_ai_memories(p_customer_email text DEFAULT NULL, p_customer_id uuid DEFAULT NULL)
RETURNS SETOF ai_memory
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM ai_memory
  WHERE (p_customer_email IS NOT NULL AND customer_email = p_customer_email)
     OR (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
  ORDER BY created_at DESC LIMIT 50;
END;
$$;
-- upsert_customer_insight
CREATE OR REPLACE FUNCTION public.upsert_customer_insight(p_customer_id uuid, p_customer_email text DEFAULT NULL, p_customer_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM customer_insights
  WHERE customer_id = p_customer_id OR (p_customer_email IS NOT NULL AND customer_email = p_customer_email) LIMIT 1;
IF v_id IS NULL THEN
    INSERT INTO customer_insights (customer_id, customer_email, customer_name, first_contact_at, last_contact_at)
    VALUES (p_customer_id, p_customer_email, p_customer_name, now(), now()) RETURNING id INTO v_id;
ELSE
    UPDATE customer_insights SET customer_name = COALESCE(p_customer_name, customer_name),
      customer_email = COALESCE(p_customer_email, customer_email), last_contact_at = now(), updated_at = now()
    WHERE id = v_id;
END IF;
RETURN v_id;
END;
$$;
-- get_support_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_support_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'open_tickets', (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')),
    'unresolved_chats', (SELECT COUNT(*) FROM chat_conversations WHERE (is_resolved = false OR is_resolved IS NULL) AND created_at > now() - interval '7 days'),
    'avg_satisfaction', (SELECT ROUND(AVG(rating)::numeric, 1) FROM support_feedback WHERE created_at > now() - interval '30 days'),
    'escalated_today', (SELECT COUNT(*) FROM chat_conversations WHERE is_escalated = true AND escalated_at::date = CURRENT_DATE),
    'total_today', (SELECT COUNT(*) FROM chat_conversations WHERE created_at::date = CURRENT_DATE)
  ) INTO result;
RETURN result;
END;
$$;
-- search_chat_conversations
CREATE OR REPLACE FUNCTION public.search_chat_conversations(
  p_search text DEFAULT NULL, p_sentiment text DEFAULT NULL, p_resolved text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS SETOF chat_conversations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM chat_conversations c
  WHERE (p_search IS NULL OR p_search = '' OR c.customer_name ILIKE '%' || p_search || '%'
         OR c.customer_email ILIKE '%' || p_search || '%' OR c.summary ILIKE '%' || p_search || '%'
         OR c.session_id ILIKE '%' || p_search || '%')
    AND (p_sentiment IS NULL OR p_sentiment = '' OR c.sentiment = p_sentiment)
    AND (p_resolved IS NULL OR p_resolved = '' OR
         (p_resolved = 'true' AND c.is_resolved = true) OR
         (p_resolved = 'false' AND (c.is_resolved = false OR c.is_resolved IS NULL)))
  ORDER BY c.updated_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$;
-- mark_order_paid (text-based overload matching code calls)
CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE updated_order orders;
BEGIN
  UPDATE orders SET payment_status = 'paid',
    status = CASE WHEN status = 'pending' THEN 'processing'::order_status
                  WHEN status = 'awaiting_payment' THEN 'processing'::order_status ELSE status END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
      jsonb_build_object('moolre_reference', moolre_ref, 'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  WHERE order_number = order_ref RETURNING * INTO updated_order;
IF updated_order.id IS NOT NULL THEN
    IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
      UPDATE products p SET quantity = GREATEST(0, p.quantity - oi.quantity) FROM order_items oi WHERE oi.order_id = updated_order.id AND oi.product_id = p.id;
UPDATE product_variants pv SET quantity = GREATEST(0, pv.quantity - oi.quantity) FROM order_items oi WHERE oi.order_id = updated_order.id AND oi.product_id = pv.product_id AND oi.variant_name IS NOT NULL AND oi.variant_name = pv.name;
UPDATE orders SET metadata = metadata || '{"stock_reduced": true}'::jsonb WHERE id = updated_order.id;
END IF;
ELSE
    SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
END IF;
RETURN to_jsonb(updated_order);
END;
$$;
-- ============================================================================;
