-- =============================================================================
-- Jane's Luxe — database integrity hardening (plain Postgres)
-- Safe / reversible where practical. Apply as postgres (or table owner).
-- Target DB confirmed: janesluxe @ fleet-postgres (app www.janesluxe.com)
-- =============================================================================

-- Track applied migrations in-app (Supabase migration history not present)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- ---------------------------------------------------------------------------
-- Currency default (Ghana store) — data already GHS; fix schema default only
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ALTER COLUMN currency SET DEFAULT 'GHS';

-- ---------------------------------------------------------------------------
-- Financial / quantity check constraints (idempotent via DO blocks)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_nonneg'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_nonneg CHECK (total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_subtotal_nonneg'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_subtotal_nonneg CHECK (subtotal >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_nonneg'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_quantity_nonneg CHECK (quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_quantity_nonneg'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_quantity_nonneg CHECK (quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_inventory_quantity_nonneg'
  ) THEN
    ALTER TABLE public.branch_inventory
      ADD CONSTRAINT branch_inventory_quantity_nonneg CHECK (quantity >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Hot-path indexes for admin dashboards / payment lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_payment_created
  ON public.orders (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_metadata_gin
  ON public.orders USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_customers_email_lower
  ON public.customers (lower(email));

-- ---------------------------------------------------------------------------
-- Payment webhook / callback event log (idempotency + audit)
-- Does not replace orders.metadata payment model — complements it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  external_event_id text,
  external_ref text,
  order_number text,
  payload_hash text,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  failure_reason text,
  amount numeric,
  currency text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_gateway_event
  ON public.payment_webhook_events (gateway, external_event_id)
  WHERE external_event_id IS NOT NULL AND external_event_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_gateway_payload
  ON public.payment_webhook_events (gateway, payload_hash)
  WHERE payload_hash IS NOT NULL AND payload_hash <> '';

CREATE INDEX IF NOT EXISTS idx_payment_webhook_order
  ON public.payment_webhook_events (order_number, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_status
  ON public.payment_webhook_events (processing_status, received_at DESC);

-- ---------------------------------------------------------------------------
-- Lightweight SMS delivery log (optional observability; not required for send)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'moolre',
  recipient_masked text,
  message_type text,
  related_order_number text,
  provider_message_id text,
  idempotency_key text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_order
  ON public.sms_delivery_log (related_order_number, created_at DESC);

-- ---------------------------------------------------------------------------
-- mark_order_paid (text overload): make concurrent-safe + idempotent
-- Only transition unpaid → paid; only reduce stock once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
  already orders;
BEGIN
  -- Atomic claim: only unpaid rows transition
  UPDATE orders SET
    payment_status = 'paid',
    status = CASE
      WHEN status = 'pending' THEN 'processing'::order_status
      WHEN status = 'awaiting_payment' THEN 'processing'::order_status
      ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'moolre_reference', moolre_ref,
        'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
    updated_at = now()
  WHERE order_number = order_ref
    AND payment_status IS DISTINCT FROM 'paid'
  RETURNING * INTO updated_order;

  IF updated_order.id IS NULL THEN
    SELECT * INTO already FROM orders WHERE order_number = order_ref;
    IF already.id IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN to_jsonb(already);
  END IF;

  -- Stock reduction once (claim via metadata flag in same statement race-safe enough
  -- when only unpaid→paid transition runs once)
  IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
    IF updated_order.branch_id IS NOT NULL THEN
      UPDATE branch_inventory bi
      SET quantity = GREATEST(0, bi.quantity - oi.qty), updated_at = now()
      FROM (
        SELECT product_id, SUM(quantity) AS qty
        FROM order_items WHERE order_id = updated_order.id
        GROUP BY product_id
      ) oi
      WHERE bi.product_id = oi.product_id AND bi.branch_id = updated_order.branch_id;
    ELSE
      UPDATE branch_inventory bi
      SET quantity = GREATEST(0, bi.quantity - oi.qty), updated_at = now()
      FROM (
        SELECT product_id, SUM(quantity) AS qty
        FROM order_items WHERE order_id = updated_order.id
        GROUP BY product_id
      ) oi
      WHERE bi.product_id = oi.product_id
        AND bi.id = (
          SELECT b2.id FROM branch_inventory b2
          WHERE b2.product_id = oi.product_id
          ORDER BY b2.quantity DESC, b2.created_at ASC
          LIMIT 1
        );

      UPDATE products p SET quantity = GREATEST(0, p.quantity - oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = updated_order.id AND oi.product_id = p.id
        AND NOT EXISTS (SELECT 1 FROM branch_inventory b3 WHERE b3.product_id = p.id);
    END IF;

    UPDATE product_variants pv
    SET quantity = GREATEST(0, pv.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = updated_order.id
      AND oi.product_id = pv.product_id
      AND oi.variant_name IS NOT NULL
      AND oi.variant_name = pv.name;

    UPDATE orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"stock_reduced": true}'::jsonb
    WHERE id = updated_order.id
      AND (metadata->>'stock_reduced') IS NULL
    RETURNING * INTO updated_order;
  END IF;

  RETURN to_jsonb(updated_order);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, text) TO PUBLIC;

INSERT INTO public.schema_migrations (version, notes)
VALUES (
  '20260812000000_database_integrity_hardening',
  'currency default GHS, check constraints, payment_webhook_events, sms_delivery_log, idempotent mark_order_paid'
)
ON CONFLICT (version) DO NOTHING;
