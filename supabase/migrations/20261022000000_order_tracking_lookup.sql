-- Order tracking was an exact match on order_number + email.
-- Customers copy "#ORD-..." from the confirmation email/SMS, type the
-- tracking code in any case, or identify themselves with the phone
-- number the text was sent to. Those lookups returned no order.

CREATE OR REPLACE FUNCTION public.lookup_phone_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) >= 9 THEN right(d, 9)
    ELSE ''
  END
  FROM (
    SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.normalize_lookup_email(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cleaned AS (
    SELECT lower(btrim(coalesce(p, ''))) AS v
  ), parts AS (
    SELECT
      v,
      split_part(v, '@', 1) AS local_part,
      regexp_replace(split_part(v, '@', 2), '\.+$', '') AS domain
    FROM cleaned
  )
  SELECT CASE
    WHEN v = '' OR position('@' IN v) = 0 THEN v
    ELSE local_part || '@' || CASE domain
      WHEN 'gmail.con' THEN 'gmail.com'
      WHEN 'gamil.com' THEN 'gmail.com'
      WHEN 'gmsil.com' THEN 'gmail.com'
      WHEN 'gmial.com' THEN 'gmail.com'
      WHEN 'gmai.com' THEN 'gmail.com'
      WHEN 'gmail.co' THEN 'gmail.com'
      WHEN 'gmail.cm' THEN 'gmail.com'
      WHEN 'yaho.com' THEN 'yahoo.com'
      WHEN 'yahoo.co' THEN 'yahoo.com'
      WHEN 'icloud.con' THEN 'icloud.com'
      WHEN 'icloud.co' THEN 'icloud.com'
      ELSE domain
    END
  END
  FROM parts;
$$;

CREATE OR REPLACE FUNCTION public.get_order_for_tracking(p_order_number text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.orders;
  items jsonb;
  result jsonb;
  search_term text;
  verifier text;
  phone_key text;
BEGIN
  search_term := upper(btrim(coalesce(p_order_number, '')));
  search_term := regexp_replace(search_term, '^ORDER[[:space:]]*', '');
  search_term := regexp_replace(search_term, '^#+', '');
  search_term := regexp_replace(search_term, '[^A-Z0-9-]', '', 'g');

  verifier := btrim(coalesce(p_email, ''));
  IF search_term = '' OR verifier = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE upper(order_number) = search_term
     OR upper(coalesce(metadata->>'tracking_number', '')) = search_term
     OR upper(coalesce(payment_transaction_id, '')) = search_term
  ORDER BY created_at DESC
  LIMIT 1;

  IF o.id IS NULL THEN
    RETURN NULL;
  END IF;

  phone_key := public.lookup_phone_key(verifier);
  IF position('@' IN verifier) > 0 THEN
    IF public.normalize_lookup_email(o.email) <> public.normalize_lookup_email(verifier)
       AND public.normalize_lookup_email(o.shipping_address->>'email') <> public.normalize_lookup_email(verifier) THEN
      RETURN NULL;
    END IF;
  ELSE
    IF phone_key = ''
       OR (
         phone_key <> public.lookup_phone_key(o.phone)
         AND phone_key <> public.lookup_phone_key(o.shipping_address->>'phone')
       ) THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'product_name', oi.product_name,
    'variant_name', oi.variant_name,
    'quantity', oi.quantity,
    'unit_price', oi.unit_price,
    'metadata', COALESCE(oi.metadata, '{}'::jsonb) || jsonb_build_object(
      'image',
      (SELECT pi.url FROM public.product_images pi WHERE pi.product_id = oi.product_id LIMIT 1)
    )
  ))
  INTO items
  FROM public.order_items oi
  WHERE oi.order_id = o.id;

  IF items IS NULL THEN
    items := '[]'::jsonb;
  END IF;

  result := jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'total', o.total,
    'email', o.email,
    'created_at', o.created_at,
    'shipping_address', COALESCE(o.shipping_address, '{}'::jsonb),
    'metadata', COALESCE(o.metadata, '{}'::jsonb),
    'order_items', items
  );
  RETURN result;
END;
$$;
