import { supabaseAdmin } from './supabase-admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Embed fragment to include per-branch stock in a products select. */
export const BRANCH_INVENTORY_SELECT = 'branch_inventory(branch_id, quantity)';

/** Resolves a branch slug or id (from a `branch` query param) to a branch id. */
export async function resolveBranchId(slugOrId: string | null): Promise<string | null> {
  if (!slugOrId) return null;
  const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';
  const { data } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq(column, slugOrId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Product ids that should be hidden for a branch: zero stock at that branch
 * AND no variants (variant stock is global, so variant products stay visible).
 * Products with track_quantity=false / continue_selling=true are re-included
 * by the OR filter applied in `applyBranchVisibilityFilter`.
 */
export async function getHiddenProductIdsForBranch(branchId: string): Promise<string[]> {
  const { data: zeroRows } = await supabaseAdmin
    .from('branch_inventory')
    .select('product_id')
    .eq('branch_id', branchId)
    .lte('quantity', 0);

  const ids = (zeroRows || []).map((r: any) => r.product_id);
  if (ids.length === 0) return [];

  const { data: variantRows } = await supabaseAdmin
    .from('product_variants')
    .select('product_id')
    .in('product_id', ids);

  const withVariants = new Set((variantRows || []).map((r: any) => r.product_id));
  return ids.filter((id: string) => !withVariants.has(id));
}

/**
 * Applies a "show only products available at this branch" filter to a products
 * query (PostgREST builder). Keeps counts/pagination accurate.
 */
export function applyBranchVisibilityFilter(query: any, hiddenIds: string[]): any {
  if (hiddenIds.length === 0) return query;
  return query.or(
    `id.not.in.(${hiddenIds.join(',')}),track_quantity.eq.false,continue_selling.eq.true`
  );
}

/**
 * Replaces each product's global `quantity` with its stock at the given branch
 * (no branch row = 0) and strips the embedded branch_inventory rows.
 */
export function applyBranchQuantity(products: any[], branchId: string): any[] {
  return products.map((p) => {
    const rows: Array<{ branch_id: string; quantity: number }> = Array.isArray(p.branch_inventory)
      ? p.branch_inventory
      : [];
    const qty = rows.find((r) => r.branch_id === branchId)?.quantity ?? 0;
    const { branch_inventory: _ignored, ...rest } = p;
    return { ...rest, quantity: qty };
  });
}
