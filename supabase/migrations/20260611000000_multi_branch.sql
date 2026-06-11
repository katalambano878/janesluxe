-- ============================================================================
-- MULTI-BRANCH SUPPORT
-- Adds branches (Adenta / Madina), per-branch inventory, branch-scoped orders
-- and branch-aware stock decrement on payment.
--
-- Invariant: products.quantity is kept equal to SUM(branch_inventory.quantity)
-- for that product via triggers, so all existing global-stock code keeps working.
-- ============================================================================

-- 1. Branches -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Per-branch inventory (product level) -------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_inventory (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_product ON public.branch_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON public.branch_inventory(branch_id);

-- 3. Orders carry the branch they were placed against --------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON public.orders(branch_id);

-- 4. Seed the two initial branches ---------------------------------------------
INSERT INTO public.branches (name, slug, sort_order)
VALUES
  ('Adenta Branch', 'adenta', 1),
  ('Madina Branch', 'madina', 2)
ON CONFLICT (slug) DO NOTHING;

-- 5. Seed per-branch stock by splitting the current global quantity ------------
-- (Adenta gets the ceiling half, Madina the floor half, so totals are preserved.)
INSERT INTO public.branch_inventory (branch_id, product_id, quantity)
SELECT
  b.id,
  p.id,
  CASE
    WHEN b.slug = 'adenta' THEN CEIL(COALESCE(p.quantity, 0) / 2.0)::integer
    ELSE FLOOR(COALESCE(p.quantity, 0) / 2.0)::integer
  END
FROM public.products p
CROSS JOIN public.branches b
WHERE b.slug IN ('adenta', 'madina')
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- 6. Keep products.quantity = SUM of branch quantities --------------------------
CREATE OR REPLACE FUNCTION public.sync_product_total_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pid uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.products
  SET quantity = (
    SELECT COALESCE(SUM(quantity), 0) FROM public.branch_inventory WHERE product_id = pid
  )
  WHERE id = pid;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_total_quantity ON public.branch_inventory;
CREATE TRIGGER trg_sync_product_total_quantity
AFTER INSERT OR UPDATE OF quantity OR DELETE ON public.branch_inventory
FOR EACH ROW EXECUTE FUNCTION public.sync_product_total_quantity();

-- 7. New products get branch rows automatically (stock split evenly) -----------
CREATE OR REPLACE FUNCTION public.init_branch_inventory_for_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
  base integer;
  rem integer;
BEGIN
  SELECT COUNT(*) INTO n FROM public.branches WHERE is_active = true;
  IF n = 0 THEN
    RETURN NEW;
  END IF;
  base := COALESCE(NEW.quantity, 0) / n;
  rem  := COALESCE(NEW.quantity, 0) % n;
  INSERT INTO public.branch_inventory (branch_id, product_id, quantity)
  SELECT b.id, NEW.id, base + CASE WHEN b.rn <= rem THEN 1 ELSE 0 END
  FROM (
    SELECT id, row_number() OVER (ORDER BY sort_order, created_at) AS rn
    FROM public.branches WHERE is_active = true
  ) b
  ON CONFLICT (branch_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_branch_inventory ON public.products;
CREATE TRIGGER trg_init_branch_inventory
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.init_branch_inventory_for_product();

-- 8. New branches get zero-stock rows for every product -------------------------
CREATE OR REPLACE FUNCTION public.init_branch_inventory_for_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.branch_inventory (branch_id, product_id, quantity)
  SELECT NEW.id, p.id, 0 FROM public.products p
  ON CONFLICT (branch_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_branch_inventory_branch ON public.branches;
CREATE TRIGGER trg_init_branch_inventory_branch
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.init_branch_inventory_for_branch();

-- 9. If admin edits products.quantity directly, push the delta into the branch
--    with the most stock (the sync trigger then self-corrects the total).
CREATE OR REPLACE FUNCTION public.rebalance_branch_inventory_on_product_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total integer;
  diff integer;
  target uuid;
BEGIN
  -- Skip when this update was caused by the branch_inventory sync trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    SELECT COALESCE(SUM(quantity), 0) INTO total
    FROM public.branch_inventory WHERE product_id = NEW.id;
    diff := COALESCE(NEW.quantity, 0) - total;
    IF diff <> 0 THEN
      SELECT id INTO target
      FROM public.branch_inventory
      WHERE product_id = NEW.id
      ORDER BY quantity DESC, created_at ASC
      LIMIT 1;
      IF target IS NOT NULL THEN
        UPDATE public.branch_inventory
        SET quantity = GREATEST(0, quantity + diff), updated_at = now()
        WHERE id = target;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rebalance_branch_inventory ON public.products;
CREATE TRIGGER trg_rebalance_branch_inventory
AFTER UPDATE OF quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.rebalance_branch_inventory_on_product_update();

-- 10. updated_at maintenance ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_branch_inventory_updated_at ON public.branch_inventory;
CREATE TRIGGER trg_branch_inventory_updated_at
BEFORE UPDATE ON public.branch_inventory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Branch-aware mark_order_paid (text overload used by payment callbacks) ----
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
      IF updated_order.branch_id IS NOT NULL THEN
        -- Decrement the ordering branch's stock; sync trigger updates products.quantity
        UPDATE branch_inventory bi
        SET quantity = GREATEST(0, bi.quantity - oi.qty), updated_at = now()
        FROM (
          SELECT product_id, SUM(quantity) AS qty
          FROM order_items WHERE order_id = updated_order.id
          GROUP BY product_id
        ) oi
        WHERE bi.product_id = oi.product_id AND bi.branch_id = updated_order.branch_id;
      ELSE
        -- No branch on the order (legacy / POS): take stock from the branch
        -- holding the most units, keeping the global total consistent.
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
        -- Products with no branch rows at all: fall back to global decrement
        UPDATE products p SET quantity = GREATEST(0, p.quantity - oi.quantity)
        FROM order_items oi
        WHERE oi.order_id = updated_order.id AND oi.product_id = p.id
          AND NOT EXISTS (SELECT 1 FROM branch_inventory b3 WHERE b3.product_id = p.id);
      END IF;
      -- Variant-level stock stays global (variants are not branch-scoped yet)
      UPDATE product_variants pv SET quantity = GREATEST(0, pv.quantity - oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = updated_order.id AND oi.product_id = pv.product_id
        AND oi.variant_name IS NOT NULL AND oi.variant_name = pv.name;
      UPDATE orders SET metadata = metadata || '{"stock_reduced": true}'::jsonb WHERE id = updated_order.id;
    END IF;
  ELSE
    SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
  END IF;
  RETURN to_jsonb(updated_order);
END;
$$;

-- 12. Row Level Security ---------------------------------------------------------
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branches are publicly readable" ON public.branches;
CREATE POLICY "Branches are publicly readable"
ON public.branches FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage branches" ON public.branches;
CREATE POLICY "Admins manage branches"
ON public.branches FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Branch inventory is publicly readable" ON public.branch_inventory;
CREATE POLICY "Branch inventory is publicly readable"
ON public.branch_inventory FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage branch inventory" ON public.branch_inventory;
CREATE POLICY "Admins manage branch inventory"
ON public.branch_inventory FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

GRANT SELECT ON public.branches TO anon, authenticated;
GRANT ALL ON public.branches TO authenticated, service_role;
GRANT SELECT ON public.branch_inventory TO anon, authenticated;
GRANT ALL ON public.branch_inventory TO authenticated, service_role;
