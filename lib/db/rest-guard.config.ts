// Which tables the browser may read and write through /rest/v1 for this shop.
// Everything not listed here is staff-only. See rest-guard.ts for the rules.

export interface GuardConfig {
  /** profiles.role values (lower case) with full access. */
  staffRoles: string[];
  /** SQL returning one row with a `role` column for the user id in $1. */
  staffRoleSql: string;
  /** Catalogue / CMS tables anyone may read. */
  publicRead: string[];
  /** Column names removed (at any depth) from every non-staff read, e.g. cost prices. */
  hiddenColumnNames: string[];
  /** Rows removed from non-staff reads, e.g. site_settings key admin_pin. */
  hiddenRows: Record<string, { column: string; values: string[] }>;
  /** Rows a signed-in customer owns: reads and own-mode writes are pinned to them. */
  ownRows: Record<string, { userColumn: string; emailColumn?: string }>;
  /** Tables readable through a parent row the caller may read (order_items under orders). */
  ownChildren: Record<string, { parent: string; fk: string }>;
  /** One row readable by anyone with its exact value in one of these columns. */
  guestLookup: Record<string, { columns: string[]; patterns: Record<string, RegExp> }>;
  /** "parent>child": columns of a staff-only table that may be embedded under a public one. */
  publicEmbeds: Record<string, string[]>;
  /**
   * Browser writes allowed for non-staff callers.
   *   insert: "anyone" | "user" (signed in) | "own" (owner column forced) |
   *           "childOfNewOrder" (only into the caller's own new unpaid order)
   *   update / delete: "own" (pinned to the caller's rows)
   *   upsertOn: conflict columns that make an own-mode upsert safe
   *   ownerColumn: the user-id column of a table not listed in ownRows
   *     (e.g. reviews.user_id), so rows cannot be written for someone else
   */
  write: Record<
    string,
    {
      insert?: "anyone" | "user" | "own" | "childOfNewOrder";
      update?: "own";
      delete?: "own";
      upsertOn?: string[];
      ownerColumn?: string;
    }
  >;
  /** Columns dropped from non-staff inserts and updates. */
  protectedColumns: Record<string, string[]>;
  /** For childOfNewOrder: how new the order must be, and SQL that is true while it is unpaid. */
  childWrite?: { maxAgeMinutes: number; unpaidSql: string };
  /** RPCs non-staff may call. */
  rpc: Record<string, "anyone" | "user">;
  /** Storage buckets signed-in customers may upload to. */
  userUploadBuckets: string[];
}

// Jane's Luxe: the storefront reads the catalogue, reviews, CMS text and the
// maintenance flag through /rest/v1; checkout, order success, pay and the shop
// listing go through server routes (/api/storefront/*) that use the in-process
// admin client. No page looks an order up through /rest/v1, so there is no
// guest lookup by order number.
export const REST_GUARD: GuardConfig = {
  staffRoles: ["admin", "staff"],
  staffRoleSql: "SELECT role::text AS role FROM public.profiles WHERE id = $1",
  publicRead: [
    "banners", // AnnouncementBar
    "categories", // product page embed
    "cms_content", // contact page
    "product_images",
    "product_variants",
    "products",
    "reviews", // ProductReviews (approved reviews of a product)
    "store_modules", // module toggles
    "store_settings", // middleware reads key=maintenance_mode with the anon key
  ],
  hiddenColumnNames: ["cost_per_item"],
  hiddenRows: {},
  ownRows: {
    orders: { userColumn: "user_id", emailColumn: "email" }, // account order history
    profiles: { userColumn: "id" },
  },
  ownChildren: {
    order_items: { parent: "orders", fk: "order_id" },
  },
  guestLookup: {},
  publicEmbeds: {},
  write: {
    contact_submissions: { insert: "anyone" },
    reviews: { insert: "user", ownerColumn: "user_id" },
  },
  protectedColumns: {
    reviews: ["verified_purchase", "helpful_votes"],
  },
  childWrite: { maxAgeMinutes: 120, unpaidSql: "COALESCE(payment_status::text, 'pending') <> 'paid'" },
  // Order tracking: SECURITY DEFINER, needs the order number and the matching email or phone.
  rpc: { get_order_for_tracking: "anyone" },
  userUploadBuckets: [],
};
