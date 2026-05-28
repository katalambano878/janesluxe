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
-- 4. TABLES
-- ============================================================================

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE,
  role user_role DEFAULT 'customer'::user_role,
  full_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  gender gender_type,
  preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Roles (RBAC)
CREATE TABLE public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  is_system boolean DEFAULT false,
  permissions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Addresses
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  type address_type DEFAULT 'shipping'::address_type,
  is_default boolean DEFAULT false,
  label text,
  full_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Settings
CREATE TABLE public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Site Settings (key-value with category)
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.categories(id),
  image_url text,
  position integer DEFAULT 0,
  status category_status DEFAULT 'active'::category_status,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  short_description text,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  sku text UNIQUE,
  barcode text,
  quantity integer DEFAULT 0,
  track_quantity boolean DEFAULT true,
  continue_selling boolean DEFAULT false,
  weight numeric,
  weight_unit text DEFAULT 'kg'::text,
  category_id uuid REFERENCES public.categories(id),
  brand text,
  vendor text,
  tags text[],
  status product_status DEFAULT 'active'::product_status,
  featured boolean DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  external_id text,
  external_source text,
  seo_title text,
  seo_description text,
  rating_avg numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  moq integer DEFAULT 1 CHECK (moq >= 1)
);

-- Product Images
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  url text NOT NULL,
  alt_text text,
  position integer DEFAULT 0,
  width integer,
  height integer,
  created_at timestamptz DEFAULT now(),
  media_type text DEFAULT 'image' CHECK (media_type IN ('image', 'video'))
);

-- Product Variants
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  sku text UNIQUE,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  quantity integer DEFAULT 0,
  weight numeric,
  option1 text,
  option2 text,
  option3 text,
  image_url text,
  barcode text,
  external_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  description text,
  type discount_type NOT NULL,
  value numeric NOT NULL,
  minimum_purchase numeric DEFAULT 0,
  maximum_discount numeric,
  usage_limit integer,
  usage_count integer DEFAULT 0,
  per_user_limit integer DEFAULT 1,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  phone text,
  status order_status DEFAULT 'pending'::order_status,
  payment_status payment_status DEFAULT 'pending'::payment_status,
  currency text DEFAULT 'USD'::text,
  subtotal numeric NOT NULL,
  tax_total numeric DEFAULT 0,
  shipping_total numeric DEFAULT 0,
  discount_total numeric DEFAULT 0,
  total numeric NOT NULL,
  shipping_method text,
  payment_method text,
  payment_provider text,
  payment_transaction_id text,
  notes text,
  cancel_reason text,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  payment_reminder_sent boolean DEFAULT false,
  payment_reminder_sent_at timestamptz
);

-- Order Items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  product_name text NOT NULL,
  variant_name text,
  sku text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Order Status History
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  status order_status NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Cart Items
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id, variant_id)
);

-- Wishlist Items
CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.products(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  user_id uuid REFERENCES auth.users(id),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  content text,
  status review_status DEFAULT 'pending'::review_status,
  verified_purchase boolean DEFAULT false,
  helpful_votes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Review Images
CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  review_id uuid REFERENCES public.reviews(id),
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Blog Posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL,
  featured_image text,
  author_id uuid REFERENCES auth.users(id),
  status blog_status DEFAULT 'draft'::blog_status,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Requests
CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  user_id uuid REFERENCES auth.users(id),
  status return_status DEFAULT 'pending'::return_status,
  reason text NOT NULL,
  description text,
  refund_amount numeric,
  refund_method text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Items
CREATE TABLE public.return_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  return_request_id uuid REFERENCES public.return_requests(id),
  order_item_id uuid REFERENCES public.order_items(id),
  quantity integer NOT NULL,
  reason text,
  condition text,
  created_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Pages (CMS)
CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text,
  status text DEFAULT 'draft'::text,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CMS Content blocks
CREATE TABLE public.cms_content (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  section text NOT NULL,
  block_key text NOT NULL,
  title text,
  subtitle text,
  content text,
  image_url text,
  button_text text,
  button_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, block_key)
);

-- Banners
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'promotional'::text,
  title text,
  subtitle text,
  image_url text,
  background_color text DEFAULT '#000000'::text,
  text_color text DEFAULT '#FFFFFF'::text,
  button_text text,
  button_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  position text DEFAULT 'top'::text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation Menus
CREATE TABLE public.navigation_menus (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation Items
CREATE TABLE public.navigation_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  menu_id uuid REFERENCES public.navigation_menus(id),
  parent_id uuid REFERENCES public.navigation_items(id),
  label text NOT NULL,
  url text NOT NULL,
  icon text,
  is_external boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Modules (feature flags)
CREATE TABLE public.store_modules (
  id text PRIMARY KEY,
  enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Customers (CRM / POS)
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  phone text,
  full_name text,
  first_name text,
  last_name text,
  user_id uuid REFERENCES auth.users(id),
  default_address jsonb,
  notes text,
  tags text[],
  total_orders integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  secondary_phone text,
  secondary_email text
);

-- Chat Conversations (AI chat widget persistence)
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sentiment text DEFAULT 'neutral',
  sentiment_score numeric,
  category text,
  intent text,
  summary text,
  is_resolved boolean DEFAULT false,
  is_escalated boolean DEFAULT false,
  escalated_at timestamptz,
  message_count integer DEFAULT 0,
  customer_email text,
  customer_name text,
  ai_handled boolean DEFAULT true,
  first_response_ms integer,
  tags text[],
  page_context text,
  duration_seconds integer
);

-- AI Memory
CREATE TABLE public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_email text,
  memory_type text NOT NULL DEFAULT 'context',
  content text NOT NULL,
  importance text DEFAULT 'normal',
  expires_at timestamptz,
  source_conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Customer Insights (CRM analytics)
CREATE TABLE public.customer_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_email text,
  customer_name text,
  total_conversations integer DEFAULT 0,
  total_tickets integer DEFAULT 0,
  total_messages_sent integer DEFAULT 0,
  avg_satisfaction numeric,
  preferred_categories text[],
  preferred_products text[],
  communication_style text,
  sentiment_trend text DEFAULT 'neutral',
  preferences jsonb DEFAULT '{}'::jsonb,
  ai_notes jsonb DEFAULT '{}'::jsonb,
  important_context text[],
  lifetime_value numeric DEFAULT 0,
  churn_risk text DEFAULT 'low',
  vip_status boolean DEFAULT false,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  customer_name text,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  category text,
  assigned_to text,
  channel text DEFAULT 'chat',
  tags text[],
  resolution text,
  resolved_at timestamptz,
  closed_at timestamptz,
  first_response_at timestamptz,
  sla_deadline timestamptz,
  satisfaction_rating integer,
  satisfaction_feedback text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Ticket Messages
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'agent',
  sender_id text,
  sender_name text,
  content text NOT NULL,
  attachments jsonb,
  is_internal boolean DEFAULT false,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Support Feedback
CREATE TABLE public.support_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text text,
  feedback_categories text[],
  created_at timestamptz DEFAULT now()
);

-- Support Knowledge Base
CREATE TABLE public.support_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  tags text[],
  source text DEFAULT 'manual',
  source_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  helpful_count integer DEFAULT 0,
  not_helpful_count integer DEFAULT 0,
  is_published boolean DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Canned Responses
CREATE TABLE public.support_canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  shortcut text,
  use_count integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Escalation Rules
CREATE TABLE public.support_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  condition_type text NOT NULL,
  condition_value jsonb NOT NULL,
  action_type text NOT NULL,
  action_value jsonb NOT NULL,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Analytics Daily
CREATE TABLE public.support_analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_conversations integer DEFAULT 0,
  total_messages integer DEFAULT 0,
  total_tickets_created integer DEFAULT 0,
  total_tickets_resolved integer DEFAULT 0,
  avg_response_time_ms integer,
  avg_resolution_time_ms integer,
  avg_satisfaction numeric,
  top_categories jsonb,
  top_intents jsonb,
  sentiment_distribution jsonb,
  ai_handled_count integer DEFAULT 0,
  human_escalated_count integer DEFAULT 0,
  unique_customers integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Delivery Zones
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  description text,
  regions text[] DEFAULT '{}',
  base_fee numeric DEFAULT 0,
  express_fee numeric DEFAULT 0,
  estimated_days text DEFAULT '1-3 days',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Riders
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  vehicle_type text DEFAULT 'motorcycle',
  license_plate text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_delivery', 'off_duty')),
  avatar_url text,
  zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  total_deliveries integer DEFAULT 0,
  successful_deliveries integer DEFAULT 0,
  rating_avg numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Delivery Assignments
CREATE TABLE public.delivery_assignments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  status text DEFAULT 'assigned' CHECK (status IN ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_at timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  in_transit_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  estimated_delivery timestamptz,
  delivery_notes text,
  failure_reason text,
  proof_of_delivery text,
  customer_signature text,
  delivery_fee numeric DEFAULT 0,
  assigned_by uuid REFERENCES auth.users(id),
  zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Delivery Status History
CREATE TABLE public.delivery_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Contact Submissions
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- Profiles
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

-- Addresses
CREATE INDEX idx_addresses_user_id ON public.addresses USING btree (user_id);

-- Audit Logs
CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);

-- Categories
CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);
CREATE INDEX idx_categories_slug ON public.categories USING btree (slug);
CREATE INDEX idx_categories_status ON public.categories USING btree (status);

-- Products
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_featured ON public.products USING btree (featured);
CREATE INDEX idx_products_slug ON public.products USING btree (slug);
CREATE INDEX idx_products_status ON public.products USING btree (status);
CREATE INDEX idx_products_brand ON public.products USING btree (brand);
CREATE INDEX idx_products_name ON public.products USING btree (name);
CREATE INDEX idx_products_price ON public.products USING btree (price);
CREATE INDEX idx_products_created ON public.products USING btree (created_at);

-- Product Images
CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id);
CREATE INDEX idx_product_images_position ON public.product_images USING btree (position);

-- Product Variants
CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id);

-- Blog Posts
CREATE INDEX idx_blog_posts_slug ON public.blog_posts USING btree (slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts USING btree (status);
CREATE INDEX idx_blog_posts_author ON public.blog_posts USING btree (author_id);

-- Coupons
CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);
CREATE INDEX idx_coupons_active ON public.coupons USING btree (is_active);

-- Orders
CREATE INDEX idx_orders_number ON public.orders USING btree (order_number);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);
CREATE INDEX idx_orders_email ON public.orders USING btree (email);
CREATE INDEX idx_orders_payment ON public.orders USING btree (payment_status);
CREATE INDEX idx_orders_created ON public.orders USING btree (created_at);

-- Order Items
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);
CREATE INDEX idx_order_items_variant ON public.order_items USING btree (variant_id);

-- Order Status History
CREATE INDEX idx_order_status_history_order ON public.order_status_history USING btree (order_id);
CREATE INDEX idx_order_status_history_created_by ON public.order_status_history USING btree (created_by);

-- Cart Items
CREATE INDEX idx_cart_items_user ON public.cart_items USING btree (user_id);
CREATE INDEX idx_cart_items_product ON public.cart_items USING btree (product_id);
CREATE INDEX idx_cart_items_variant ON public.cart_items USING btree (variant_id);

-- Wishlist Items
CREATE INDEX idx_wishlist_items_user ON public.wishlist_items USING btree (user_id);
CREATE INDEX idx_wishlist_items_product ON public.wishlist_items USING btree (product_id);

-- Notifications
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id) WHERE read_at IS NULL;

-- Reviews
CREATE INDEX idx_reviews_product ON public.reviews USING btree (product_id);
CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);
CREATE INDEX idx_reviews_user ON public.reviews USING btree (user_id);

-- Review Images
CREATE INDEX idx_review_images_review ON public.review_images USING btree (review_id);

-- Return Requests
CREATE INDEX idx_return_requests_order ON public.return_requests USING btree (order_id);
CREATE INDEX idx_return_requests_user ON public.return_requests USING btree (user_id);

-- Return Items
CREATE INDEX idx_return_items_return_request ON public.return_items USING btree (return_request_id);
CREATE INDEX idx_return_items_order_item ON public.return_items USING btree (order_item_id);

-- Pages
CREATE INDEX idx_pages_slug ON public.pages USING btree (slug);

-- CMS Content
CREATE INDEX idx_cms_content_section ON public.cms_content USING btree (section);

-- Banners
CREATE INDEX idx_banners_active ON public.banners USING btree (is_active);

-- Navigation Items
CREATE INDEX idx_navigation_items_menu ON public.navigation_items USING btree (menu_id);
CREATE INDEX idx_navigation_items_parent ON public.navigation_items USING btree (parent_id);

-- Store Settings
CREATE INDEX idx_store_settings_updated_by ON public.store_settings USING btree (updated_by);

-- Customers
CREATE INDEX idx_customers_email ON public.customers USING btree (email);
CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id);
CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);

-- Chat Conversations
CREATE INDEX idx_chat_conversations_session ON public.chat_conversations USING btree (session_id);
CREATE INDEX idx_chat_conversations_user ON public.chat_conversations USING btree (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_chat_conversations_created ON public.chat_conversations USING btree (created_at);
CREATE INDEX idx_chat_conversations_category ON public.chat_conversations USING btree (category);
CREATE INDEX idx_chat_conversations_sentiment ON public.chat_conversations USING btree (sentiment);

-- AI Memory
CREATE INDEX idx_ai_memory_customer_email ON public.ai_memory USING btree (customer_email);
CREATE INDEX idx_ai_memory_type ON public.ai_memory USING btree (memory_type);
CREATE INDEX idx_ai_memory_source_conversation ON public.ai_memory USING btree (source_conversation_id);

-- Customer Insights
CREATE INDEX idx_customer_insights_email ON public.customer_insights USING btree (customer_email);

-- Support Tickets
CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);
CREATE INDEX idx_support_tickets_conversation ON public.support_tickets USING btree (conversation_id);
CREATE INDEX idx_support_tickets_number ON public.support_tickets USING btree (ticket_number);

-- Support Ticket Messages
CREATE INDEX idx_support_ticket_messages_ticket ON public.support_ticket_messages USING btree (ticket_id);

-- Support Feedback
CREATE INDEX idx_support_feedback_conversation ON public.support_feedback USING btree (conversation_id);
CREATE INDEX idx_support_feedback_ticket ON public.support_feedback USING btree (ticket_id);

-- Support Knowledge Base
CREATE INDEX idx_support_kb_source_ticket ON public.support_knowledge_base USING btree (source_ticket_id);

-- Riders
CREATE INDEX idx_riders_status ON public.riders USING btree (status);
CREATE INDEX idx_riders_zone ON public.riders USING btree (zone_id);

-- Delivery Assignments
CREATE INDEX idx_delivery_assignments_order ON public.delivery_assignments USING btree (order_id);
CREATE INDEX idx_delivery_assignments_rider ON public.delivery_assignments USING btree (rider_id);
CREATE INDEX idx_delivery_assignments_status ON public.delivery_assignments USING btree (status);
CREATE INDEX idx_delivery_assignments_zone ON public.delivery_assignments USING btree (zone_id);
CREATE INDEX idx_delivery_assignments_assigned_by ON public.delivery_assignments USING btree (assigned_by);

-- Delivery Status History
CREATE INDEX idx_delivery_status_history_assignment ON public.delivery_status_history USING btree (assignment_id);
CREATE INDEX idx_delivery_status_history_changed_by ON public.delivery_status_history USING btree (changed_by);

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_banners_updated_at BEFORE UPDATE ON public.banners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cms_content_updated_at BEFORE UPDATE ON public.cms_content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_return_requests_updated_at BEFORE UPDATE ON public.return_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customer_insights_updated_at BEFORE UPDATE ON public.customer_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_navigation_items_updated_at BEFORE UPDATE ON public.navigation_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_navigation_menus_updated_at BEFORE UPDATE ON public.navigation_menus FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON public.riders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_assignments_updated_at BEFORE UPDATE ON public.delivery_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON public.delivery_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Review rating auto-update
CREATE TRIGGER on_review_change AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- Auth trigger: auto-create profile on signup
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- Matches live database exactly. Uses (select auth.uid()) for performance.
-- Every admin FOR ALL policy has WITH CHECK.
-- ============================================================================

-- ── Profiles ──
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING ((select auth.uid()) = id OR is_admin_or_staff());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING ((select auth.uid()) = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Roles ──
CREATE POLICY "roles_select" ON public.roles FOR SELECT USING (true);
CREATE POLICY "roles_admin" ON public.roles FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Addresses ──
CREATE POLICY "addresses_select_own" ON public.addresses FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "addresses_insert_own" ON public.addresses FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "addresses_update_own" ON public.addresses FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "addresses_delete_own" ON public.addresses FOR DELETE USING ((select auth.uid()) = user_id);
CREATE POLICY "addresses_admin_all" ON public.addresses FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Store Settings ──
CREATE POLICY "store_settings_select" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "store_settings_admin" ON public.store_settings FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Site Settings ──
CREATE POLICY "site_settings_select" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "site_settings_admin" ON public.site_settings FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Audit Logs ──
CREATE POLICY "audit_logs_admin" ON public.audit_logs FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT WITH CHECK (is_admin_or_staff());

-- ── Categories ──
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_admin" ON public.categories FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Products ──
CREATE POLICY "products_select_active" ON public.products FOR SELECT USING (status = 'active'::product_status OR is_admin_or_staff());
CREATE POLICY "products_admin" ON public.products FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Product Images ──
CREATE POLICY "product_images_select" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "product_images_insert_admin" ON public.product_images FOR INSERT WITH CHECK (is_admin_or_staff());
CREATE POLICY "product_images_update_admin" ON public.product_images FOR UPDATE USING (is_admin_or_staff());
CREATE POLICY "product_images_delete_admin" ON public.product_images FOR DELETE USING (is_admin_or_staff());
CREATE POLICY "product_images_admin" ON public.product_images FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Product Variants ──
CREATE POLICY "product_variants_select" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "product_variants_admin" ON public.product_variants FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Coupons ──
CREATE POLICY "coupons_select_active" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "coupons_admin" ON public.coupons FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Orders ──
CREATE POLICY "orders_select_own" ON public.orders FOR SELECT USING ((select auth.uid()) = user_id OR user_id IS NULL OR is_admin_or_staff());
CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id) OR ((select auth.uid()) IS NULL AND user_id IS NULL));
CREATE POLICY "orders_update_admin" ON public.orders FOR UPDATE USING (is_admin_or_staff());
CREATE POLICY "orders_delete_admin" ON public.orders FOR DELETE USING (is_admin_or_staff());

-- ── Order Items ──
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND (orders.user_id = (select auth.uid()) OR orders.user_id IS NULL)) OR is_admin_or_staff());
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND (orders.user_id = (select auth.uid()) OR orders.user_id IS NULL)));
CREATE POLICY "order_items_admin" ON public.order_items FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Order Status History ──
CREATE POLICY "order_status_history_select" ON public.order_status_history FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.user_id = (select auth.uid())) OR is_admin_or_staff());
CREATE POLICY "order_status_history_admin" ON public.order_status_history FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Cart Items ──
CREATE POLICY "cart_items_select_own" ON public.cart_items FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "cart_items_insert_own" ON public.cart_items FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "cart_items_update_own" ON public.cart_items FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "cart_items_delete_own" ON public.cart_items FOR DELETE USING ((select auth.uid()) = user_id);

-- ── Wishlist Items ──
CREATE POLICY "wishlist_items_select_own" ON public.wishlist_items FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "wishlist_items_insert_own" ON public.wishlist_items FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "wishlist_items_delete_own" ON public.wishlist_items FOR DELETE USING ((select auth.uid()) = user_id);

-- ── Reviews ──
CREATE POLICY "reviews_select" ON public.reviews FOR SELECT USING (status = 'approved'::review_status OR (select auth.uid()) = user_id OR is_admin_or_staff());
CREATE POLICY "reviews_insert_auth" ON public.reviews FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "reviews_update_own" ON public.reviews FOR UPDATE USING ((select auth.uid()) = user_id OR is_admin_or_staff());
CREATE POLICY "reviews_admin" ON public.reviews FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Review Images ──
CREATE POLICY "review_images_select" ON public.review_images FOR SELECT USING (true);
CREATE POLICY "review_images_insert" ON public.review_images FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "review_images_admin" ON public.review_images FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Blog Posts ──
CREATE POLICY "blog_posts_select_published" ON public.blog_posts FOR SELECT USING (status = 'published'::blog_status OR is_admin_or_staff());
CREATE POLICY "blog_posts_admin" ON public.blog_posts FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Return Requests ──
CREATE POLICY "return_requests_select_own" ON public.return_requests FOR SELECT USING ((select auth.uid()) = user_id OR is_admin_or_staff());
CREATE POLICY "return_requests_insert_own" ON public.return_requests FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "return_requests_admin" ON public.return_requests FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Return Items ──
CREATE POLICY "return_items_select" ON public.return_items FOR SELECT USING (EXISTS (SELECT 1 FROM return_requests WHERE return_requests.id = return_items.return_request_id AND return_requests.user_id = (select auth.uid())) OR is_admin_or_staff());
CREATE POLICY "return_items_insert" ON public.return_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM return_requests WHERE return_requests.id = return_items.return_request_id AND return_requests.user_id = (select auth.uid())));
CREATE POLICY "return_items_admin" ON public.return_items FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Notifications ──
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING ((select auth.uid()) = user_id OR is_admin_or_staff());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "notifications_admin" ON public.notifications FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Pages ──
CREATE POLICY "pages_select" ON public.pages FOR SELECT USING (true);
CREATE POLICY "pages_admin" ON public.pages FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── CMS Content ──
CREATE POLICY "cms_content_select" ON public.cms_content FOR SELECT USING (is_active = true);
CREATE POLICY "cms_content_admin" ON public.cms_content FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Banners ──
CREATE POLICY "banners_select" ON public.banners FOR SELECT USING (is_active = true);
CREATE POLICY "banners_admin" ON public.banners FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Navigation Menus ──
CREATE POLICY "navigation_menus_select" ON public.navigation_menus FOR SELECT USING (true);
CREATE POLICY "navigation_menus_admin" ON public.navigation_menus FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Navigation Items ──
CREATE POLICY "navigation_items_select" ON public.navigation_items FOR SELECT USING (is_active = true);
CREATE POLICY "navigation_items_admin" ON public.navigation_items FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Store Modules ──
CREATE POLICY "store_modules_select" ON public.store_modules FOR SELECT USING (true);
CREATE POLICY "store_modules_admin" ON public.store_modules FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Customers ──
CREATE POLICY "customers_select_own" ON public.customers FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (is_admin_or_staff());
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (is_admin_or_staff());
CREATE POLICY "customers_admin" ON public.customers FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Chat Conversations ──
CREATE POLICY "chat_conversations_select_own" ON public.chat_conversations FOR SELECT USING ((select auth.uid()) = user_id OR is_admin_or_staff() OR true);
CREATE POLICY "chat_conversations_insert" ON public.chat_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "chat_conversations_update" ON public.chat_conversations FOR UPDATE USING ((select auth.uid()) = user_id OR user_id IS NULL OR is_admin_or_staff());
CREATE POLICY "chat_conversations_admin" ON public.chat_conversations FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── AI Memory ──
CREATE POLICY "ai_memory_select" ON public.ai_memory FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "ai_memory_insert" ON public.ai_memory FOR INSERT WITH CHECK (is_admin_or_staff());
CREATE POLICY "ai_memory_admin" ON public.ai_memory FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Customer Insights ──
CREATE POLICY "customer_insights_select" ON public.customer_insights FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "customer_insights_admin" ON public.customer_insights FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Tickets ──
CREATE POLICY "support_tickets_select" ON public.support_tickets FOR SELECT USING (true);
CREATE POLICY "support_tickets_insert" ON public.support_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "support_tickets_admin" ON public.support_tickets FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Ticket Messages ──
CREATE POLICY "support_ticket_messages_select" ON public.support_ticket_messages FOR SELECT USING (true);
CREATE POLICY "support_ticket_messages_insert" ON public.support_ticket_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "support_ticket_messages_admin" ON public.support_ticket_messages FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Feedback ──
CREATE POLICY "support_feedback_insert" ON public.support_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "support_feedback_admin" ON public.support_feedback FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Knowledge Base ──
CREATE POLICY "support_kb_select" ON public.support_knowledge_base FOR SELECT USING (is_published = true);
CREATE POLICY "support_kb_admin" ON public.support_knowledge_base FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Canned Responses ──
CREATE POLICY "support_canned_select" ON public.support_canned_responses FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "support_canned_admin" ON public.support_canned_responses FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Escalation Rules ──
CREATE POLICY "support_escalation_select" ON public.support_escalation_rules FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "support_escalation_admin" ON public.support_escalation_rules FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Support Analytics ──
CREATE POLICY "support_analytics_select" ON public.support_analytics_daily FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "support_analytics_admin" ON public.support_analytics_daily FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Delivery Zones ──
CREATE POLICY "delivery_zones_select" ON public.delivery_zones FOR SELECT USING (is_active = true);
CREATE POLICY "delivery_zones_admin" ON public.delivery_zones FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Riders ──
CREATE POLICY "riders_select" ON public.riders FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "riders_admin" ON public.riders FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Delivery Assignments ──
CREATE POLICY "delivery_assignments_select" ON public.delivery_assignments FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "delivery_assignments_admin" ON public.delivery_assignments FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ── Delivery Status History ──
CREATE POLICY "delivery_status_history_select" ON public.delivery_status_history FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "delivery_status_history_admin" ON public.delivery_status_history FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Contact Submissions
CREATE POLICY "contact_submissions_insert" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "contact_submissions_admin" ON public.contact_submissions FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ============================================================================
-- 9. GRANTS
-- ============================================================================

-- Storefront (anon + authenticated) read access
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT SELECT ON public.store_modules TO anon, authenticated;
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT SELECT ON public.cms_content TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.roles TO anon, authenticated;
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT SELECT ON public.pages TO anon, authenticated;
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT SELECT ON public.navigation_menus TO anon, authenticated;
GRANT SELECT ON public.navigation_items TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT SELECT ON public.review_images TO anon, authenticated;
GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT SELECT ON public.support_knowledge_base TO anon, authenticated;

-- Guest checkout (anon can insert orders, order items, support, chat)
GRANT SELECT, INSERT ON public.orders TO anon;
GRANT SELECT, INSERT ON public.order_items TO anon;
GRANT SELECT, INSERT ON public.reviews TO anon;
GRANT SELECT, INSERT ON public.support_tickets TO anon;
GRANT SELECT, INSERT ON public.support_ticket_messages TO anon;
GRANT SELECT, INSERT ON public.chat_conversations TO anon;
GRANT INSERT ON public.support_feedback TO anon;

-- Authenticated: full CRUD on all tables (RLS enforces row-level restrictions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_content TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.navigation_menus TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.navigation_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_knowledge_base TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_canned_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_escalation_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_analytics_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.riders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_status_history TO authenticated;

-- Service role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============================================================================
-- 10. FUNCTION GRANTS
-- ============================================================================

-- Public storefront functions (safe for anon)
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_products(text, text, text, integer, integer, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(text, uuid, numeric, numeric, text, text, integer, integer) TO anon, authenticated;

-- Authenticated-only functions
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

-- Revoke sensitive functions from anon
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM anon;

-- New RPC function grants
GRANT EXECUTE ON FUNCTION public.upsert_customer_from_order(text, text, text, text, text, uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_customer_from_order(text, text, text, text, text, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_customer_stats(text, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_customer_stats(text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_for_tracking(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_chat_conversation(text, uuid, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_conversation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_memories(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_memories(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_customer_insight(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_customer_insight(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_support_dashboard_stats() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_support_dashboard_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.search_chat_conversations(text, text, text, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_chat_conversations(text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(text, text) FROM anon;

-- Contact submissions
GRANT INSERT ON public.contact_submissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_submissions TO authenticated;
GRANT ALL ON public.contact_submissions TO service_role;

-- ============================================================================
-- 11. STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('category-images', 'category-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-covers', 'blog-covers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('review-images', 'review-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('cms-images', 'cms-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('site-media', 'site-media', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

-- ============================================================================
-- 12. STORAGE POLICIES (consolidated, matches live database)
-- ============================================================================

-- Public read for all public buckets
CREATE POLICY "storage_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media']));

-- Admin insert/update/delete for all managed buckets
CREATE POLICY "storage_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media'])
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

CREATE POLICY "storage_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media'])
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

CREATE POLICY "storage_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media'])
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- User avatar upload
CREATE POLICY "storage_avatar_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Authenticated review image upload
CREATE POLICY "storage_review_images_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-images' AND auth.uid() IS NOT NULL);

-- ============================================================================
-- 13. SEED DATA
-- ============================================================================

-- Default roles
INSERT INTO public.roles (id, name, description, enabled, is_system, permissions) VALUES
  ('admin', 'Administrator', 'Full system access', true, true, '{"dashboard":true,"orders":true,"products":true,"categories":true,"customers":true,"reviews":true,"inventory":true,"analytics":true,"coupons":true,"support":true,"customer_insights":true,"notifications":true,"sms_debugger":true,"blog":true,"delivery":true,"modules":true,"staff":true,"roles":true,"pos":true}'),
  ('staff', 'Staff', 'Limited system access based on permissions', true, true, '{"dashboard":true,"orders":true,"products":true,"categories":true,"customers":true,"reviews":true,"inventory":true,"pos":true}'),
  ('customer', 'Customer', 'Customer access', true, true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Default store modules
INSERT INTO public.store_modules (id, enabled) VALUES
  ('blog', false),
  ('customer-insights', true),
  ('notifications', true)
ON CONFLICT (id) DO NOTHING;

-- Default delivery zones (fees set to 0)
INSERT INTO public.delivery_zones (name, description, regions, base_fee, express_fee, estimated_days, is_active) VALUES
  ('Greater Accra', 'Accra and surrounding areas', ARRAY['Accra', 'Tema', 'Madina', 'Haatso', 'East Legon', 'Spintex', 'Kasoa', 'Ashaiman'], 0, 0, '1-2 days', true),
  ('Kumasi', 'Kumasi and surrounding areas', ARRAY['Kumasi', 'Adum', 'Kejetia', 'Bantama'], 0, 0, '2-4 days', true),
  ('Other Regions', 'All other regions in Ghana', ARRAY['Takoradi', 'Cape Coast', 'Tamale', 'Sunyani', 'Ho', 'Koforidua'], 0, 0, '3-5 days', true),
  ('International', 'Worldwide delivery', ARRAY['International'], 0, 0, '7-14 days', true);
