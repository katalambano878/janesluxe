-- ============================================================================
-- COMPLETE E-COMMERCE DATABASE SCHEMA
-- 
-- This single migration creates the entire database from scratch.
-- Run this on a fresh Supabase project to get the full schema.
--
-- To duplicate this project for a new store:
--   1. Create a new Supabase project
--   2. Run this migration in the Supabase SQL Editor
--   3. Update .env.local with the new project URL and keys
--   4. Update branding in site_settings / CMS content
--   5. Create an admin user and set their role in profiles
--
-- No store-specific data or branding is included.
--
-- Last verified against live database: 2026-04-14
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================================
-- 2. CUSTOM ENUM TYPES
-- ============================================================================
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE address_type AS ENUM ('shipping', 'billing', 'both');
CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');
CREATE TYPE category_status AS ENUM ('active', 'inactive');
CREATE TYPE order_status AS ENUM ('pending', 'awaiting_payment', 'processing', 'shipped', 'dispatched_to_rider', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount', 'free_shipping');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE blog_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE return_status AS ENUM ('pending', 'approved', 'rejected', 'processing', 'completed');

-- ============================================================================
-- 3. HELPER FUNCTIONS (needed before tables for RLS policies & triggers)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'staff')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.products
  SET
    rating_avg = (
      SELECT COALESCE(AVG(rating), 0)
      FROM public.reviews
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
      AND status = 'approved'::review_status
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
      AND status = 'approved'::review_status
    )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_number text;
  counter integer;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM public.orders;
  new_number := 'ORD-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(counter::text, 4, '0');
  RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_transaction_id text DEFAULT NULL, p_payment_method text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET
    payment_status = 'paid'::payment_status,
    status = 'processing'::order_status,
    payment_transaction_id = COALESCE(p_transaction_id, payment_transaction_id),
    payment_method = COALESCE(p_payment_method, payment_method),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, notes)
  VALUES (p_order_id, 'processing'::order_status, 'Payment confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(p_product_id uuid, p_variant_id uuid DEFAULT NULL, p_quantity_change integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET quantity = quantity + p_quantity_change, updated_at = now()
    WHERE id = p_variant_id;
  ELSE
    UPDATE public.products
    SET quantity = quantity + p_quantity_change, updated_at = now()
    WHERE id = p_product_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_orders', (SELECT COUNT(*) FROM public.orders),
    'total_revenue', (SELECT COALESCE(SUM(total), 0) FROM public.orders WHERE payment_status = 'paid'),
    'total_products', (SELECT COUNT(*) FROM public.products WHERE status = 'active'),
    'total_customers', (SELECT COUNT(*) FROM public.customers),
    'pending_orders', (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    'low_stock_products', (SELECT COUNT(*) FROM public.products WHERE quantity < 10 AND track_quantity = true AND status = 'active'),
    'recent_orders', (
      SELECT COALESCE(jsonb_agg(row_to_json(o)), '[]'::jsonb)
      FROM (SELECT id, order_number, total, status, created_at FROM public.orders ORDER BY created_at DESC LIMIT 5) o
    )
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_storefront_products(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  total_count integer;
  cat_id uuid;
BEGIN
  IF p_category IS NOT NULL AND p_category != '' THEN
    SELECT id INTO cat_id FROM public.categories WHERE slug = p_category AND status = 'active';
  END IF;
  SELECT COUNT(*) INTO total_count
  FROM public.products p
  WHERE p.status = 'active'
    AND (cat_id IS NULL OR p.category_id = cat_id)
    AND (p_search IS NULL OR p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.description ILIKE '%' || p_search || '%')
    AND (p_min_price IS NULL OR p.price >= p_min_price)
    AND (p_max_price IS NULL OR p.price <= p_max_price);
  SELECT jsonb_build_object(
    'products', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT p.id, p.name, p.slug, p.price, p.compare_at_price, p.short_description,
               p.category_id, c.name as category_name, c.slug as category_slug,
               p.rating_avg, p.review_count, p.featured, p.tags, p.quantity, p.moq,
               (SELECT jsonb_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'alt_text', pi.alt_text, 'position', pi.position))
                FROM public.product_images pi WHERE pi.product_id = p.id ORDER BY pi.position) as images
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        WHERE p.status = 'active'
          AND (cat_id IS NULL OR p.category_id = cat_id)
          AND (p_search IS NULL OR p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.description ILIKE '%' || p_search || '%')
          AND (p_min_price IS NULL OR p.price >= p_min_price)
          AND (p_max_price IS NULL OR p.price <= p_max_price)
        ORDER BY
          CASE WHEN p_sort = 'newest' THEN p.created_at END DESC,
          CASE WHEN p_sort = 'price_asc' THEN p.price END ASC,
          CASE WHEN p_sort = 'price_desc' THEN p.price END DESC,
          CASE WHEN p_sort = 'rating' THEN p.rating_avg END DESC,
          CASE WHEN p_sort = 'name_asc' THEN p.name END ASC,
          CASE WHEN p_sort = 'name_desc' THEN p.name END DESC
        LIMIT p_limit OFFSET (p_page - 1) * p_limit
      ) t
    ), '[]'::jsonb),
    'total', total_count,
    'page', p_page,
    'limit', p_limit,
    'total_pages', CEIL(total_count::numeric / p_limit::numeric)::integer
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_products(
  search_query text,
  category_filter uuid DEFAULT NULL,
  min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  sort_by text DEFAULT 'created_at',
  sort_order text DEFAULT 'desc',
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, name text, slug text, price numeric, compare_at_price numeric, category_id uuid, status product_status, featured boolean, rating_avg numeric, review_count integer, created_at timestamptz, image_url text)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.slug, p.price, p.compare_at_price,
    p.category_id, p.status, p.featured, p.rating_avg, p.review_count,
    p.created_at,
    (SELECT pi.url FROM public.product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC LIMIT 1) as image_url
  FROM public.products p
  WHERE p.status = 'active'::product_status
    AND (search_query IS NULL OR search_query = '' OR
         p.name ILIKE '%' || search_query || '%' OR
         p.description ILIKE '%' || search_query || '%' OR
         p.tags::text ILIKE '%' || search_query || '%')
    AND (category_filter IS NULL OR p.category_id = category_filter)
    AND (min_price IS NULL OR p.price >= min_price)
    AND (max_price IS NULL OR p.price <= max_price)
  ORDER BY
    CASE WHEN sort_by = 'price' AND sort_order = 'asc' THEN p.price END ASC,
    CASE WHEN sort_by = 'price' AND sort_order = 'desc' THEN p.price END DESC,
    CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN p.name END ASC,
    CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN p.name END DESC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'desc' THEN p.created_at END DESC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'asc' THEN p.created_at END ASC,
    CASE WHEN sort_by = 'rating' THEN p.rating_avg END DESC
  LIMIT page_limit OFFSET page_offset;
END;
$$;

-- upsert_customer_from_order
CREATE OR REPLACE FUNCTION public.upsert_customer_from_order(
  p_email text, p_phone text, p_full_name text, p_first_name text, p_last_name text,
  p_user_id uuid DEFAULT NULL, p_address jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_customer_id UUID;
BEGIN
  SELECT id INTO v_customer_id FROM customers WHERE email = p_email LIMIT 1;
  IF v_customer_id IS NULL AND p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT id INTO v_customer_id FROM customers WHERE phone = p_phone OR secondary_phone = p_phone LIMIT 1;
  END IF;
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (email, phone, full_name, first_name, last_name, user_id, default_address)
    VALUES (p_email, p_phone, p_full_name, p_first_name, p_last_name, p_user_id, p_address)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE customers SET
      full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
      user_id = COALESCE(p_user_id, user_id),
      default_address = COALESCE(p_address, default_address),
      updated_at = NOW()
    WHERE id = v_customer_id;
  END IF;
  RETURN v_customer_id;
END;
$$;

-- update_customer_stats
CREATE OR REPLACE FUNCTION public.update_customer_stats(p_customer_email text, p_order_total numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + p_order_total,
    last_order_at = NOW(), updated_at = NOW()
  WHERE email = p_customer_email;
END;
$$;

-- get_order_for_tracking
CREATE OR REPLACE FUNCTION public.get_order_for_tracking(p_order_number text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE o public.orders; items jsonb; result jsonb; search_term text;
BEGIN
  search_term := trim(p_order_number);
  IF search_term = '' OR p_email IS NULL OR trim(p_email) = '' THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.orders WHERE order_number = search_term LIMIT 1;
  IF o.id IS NULL THEN SELECT * INTO o FROM public.orders WHERE metadata->>'tracking_number' = search_term LIMIT 1; END IF;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  IF lower(trim(o.email)) <> lower(trim(p_email)) THEN RETURN NULL; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', oi.id, 'product_name', oi.product_name, 'variant_name', oi.variant_name,
    'quantity', oi.quantity, 'unit_price', oi.unit_price,
    'metadata', COALESCE(oi.metadata, '{}'::jsonb) || jsonb_build_object('image',
      (SELECT pi.url FROM public.product_images pi WHERE pi.product_id = oi.product_id LIMIT 1))))
  INTO items FROM public.order_items oi WHERE oi.order_id = o.id;
  IF items IS NULL THEN items := '[]'::jsonb; END IF;
  result := jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
    'payment_status', o.payment_status, 'total', o.total, 'email', o.email,
    'created_at', o.created_at, 'shipping_address', COALESCE(o.shipping_address, '{}'::jsonb),
    'metadata', COALESCE(o.metadata, '{}'::jsonb), 'order_items', items);
  RETURN result;
END;
$$;

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

-- ============================================================================