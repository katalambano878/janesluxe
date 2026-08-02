-- Restore multi-branch inventory triggers (functions already exist on some DBs
-- but triggers were missing) and backfill missing branch_inventory rows so
-- storefront/admin stop showing false "Out of Stock".

-- 1. Ensure sync + init functions exist ---------------------------------------
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
      ELSE
        -- No branch rows yet: seed active branches from the new total
        INSERT INTO public.branch_inventory (branch_id, product_id, quantity)
        SELECT id, NEW.id, CASE WHEN rn = 1 THEN COALESCE(NEW.quantity, 0) ELSE 0 END
        FROM (
          SELECT id, row_number() OVER (ORDER BY sort_order, created_at) AS rn
          FROM public.branches WHERE is_active = true
        ) b
        ON CONFLICT (branch_id, product_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. (Re)create triggers ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_product_total_quantity ON public.branch_inventory;
CREATE TRIGGER trg_sync_product_total_quantity
AFTER INSERT OR UPDATE OF quantity OR DELETE ON public.branch_inventory
FOR EACH ROW EXECUTE FUNCTION public.sync_product_total_quantity();

DROP TRIGGER IF EXISTS trg_init_branch_inventory ON public.products;
CREATE TRIGGER trg_init_branch_inventory
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.init_branch_inventory_for_product();

DROP TRIGGER IF EXISTS trg_init_branch_inventory_branch ON public.branches;
CREATE TRIGGER trg_init_branch_inventory_branch
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.init_branch_inventory_for_branch();

DROP TRIGGER IF EXISTS trg_rebalance_branch_inventory ON public.products;
CREATE TRIGGER trg_rebalance_branch_inventory
AFTER UPDATE OF quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.rebalance_branch_inventory_on_product_update();

-- 3. Backfill missing branch rows ---------------------------------------------
-- Prefer products.quantity; if that is 0 but variants have stock, use variant sum.
WITH product_stock AS (
  SELECT
    p.id AS product_id,
    GREATEST(
      COALESCE(p.quantity, 0),
      COALESCE((SELECT SUM(pv.quantity) FROM public.product_variants pv WHERE pv.product_id = p.id), 0)
    )::integer AS qty
  FROM public.products p
)
INSERT INTO public.branch_inventory (branch_id, product_id, quantity)
SELECT b.id, ps.product_id,
  CASE
    WHEN b.is_active AND NOT EXISTS (
      SELECT 1 FROM public.branch_inventory bi
      WHERE bi.product_id = ps.product_id
    ) THEN ps.qty
    ELSE 0
  END
FROM product_stock ps
CROSS JOIN public.branches b
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- Products that already had some branch rows but are missing the active branch:
-- put remaining global stock onto the first active branch that has no row.
WITH missing AS (
  SELECT p.id AS product_id, p.quantity,
    b.id AS branch_id,
    row_number() OVER (PARTITION BY p.id ORDER BY b.sort_order, b.created_at) AS rn
  FROM public.products p
  JOIN public.branches b ON b.is_active = true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.branch_inventory bi
    WHERE bi.product_id = p.id AND bi.branch_id = b.id
  )
)
INSERT INTO public.branch_inventory (branch_id, product_id, quantity)
SELECT branch_id, product_id,
  CASE WHEN rn = 1 THEN GREATEST(COALESCE(quantity, 0), 0) ELSE 0 END
FROM missing
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- 4. Resync products.quantity from branch totals ------------------------------
UPDATE public.products p
SET quantity = COALESCE((
  SELECT SUM(bi.quantity) FROM public.branch_inventory bi WHERE bi.product_id = p.id
), 0);
