-- ============================================================================
-- FIX: product_variants is missing the `sort_order` column.
--
-- The admin product create/update API inserts `sort_order` for each variant,
-- and the storefront product route selects + orders variants by `sort_order`.
-- The original schema (20260209000000_complete_schema.sql) never created the
-- column, so saving a product with variants fails with:
--   "Could not find the 'sort_order' column of 'product_variants'
--    in the schema cache"
--
-- Safe / idempotent. Adding the column also makes PostgREST reload its schema
-- cache automatically.
-- ============================================================================

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill a stable order for any existing variants (per product, by creation).
WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY product_id ORDER BY created_at) - 1 AS rn
  FROM public.product_variants
)
UPDATE public.product_variants pv
SET sort_order = ordered.rn
FROM ordered
WHERE pv.id = ordered.id
  AND pv.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_product_variants_sort_order
  ON public.product_variants(product_id, sort_order);

-- Force PostgREST to refresh its schema cache immediately.
NOTIFY pgrst, 'reload schema';
