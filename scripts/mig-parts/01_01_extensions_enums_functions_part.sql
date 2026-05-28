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
