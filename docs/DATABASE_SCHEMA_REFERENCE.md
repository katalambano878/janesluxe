# Database Schema Reference

**PostgreSQL 16 — database `janesluxe`**

## Auth

### `auth.users`
GoTrue-compatible users. PK `id` uuid. Unique `email`. Linked from `profiles.id` and many FKs.

### `public.profiles`
PK `id` → `auth.users`. Columns: `email`, `role` (`user_role`), `full_name`, `phone`, `avatar_url`, timestamps.

### `public.roles`
Role definitions + `permissions` jsonb + `enabled`.

## Commerce

| Table | PK | Purpose | Key FKs / uniques |
|-------|----|---------|-------------------|
| `categories` | uuid | Product categories | parent self-FK |
| `products` | uuid | Catalog | → categories; unique slug |
| `product_images` | uuid | Images | → products |
| `product_variants` | uuid | Variants + `sort_order` | → products |
| `branches` | uuid | Store locations | slug |
| `branch_inventory` | uuid | Per-branch stock | unique (branch_id, product_id) |
| `coupons` | uuid | Discounts | unique code; `discount_type` |
| `customers` | uuid | CRM | unique email; → auth.users |
| `orders` | uuid | Orders | unique order_number; → users, branches |
| `order_items` | uuid | Line items | → orders, products, variants |
| `order_status_history` | uuid | Status audit | → orders |
| `cart_items` / `wishlist_items` | uuid | Account cart/wishlist | → users, products |
| `reviews` / `review_images` | uuid | Reviews | → products, users |

### `orders` notable columns
`payment_status` (`payment_status` enum), `status` (`order_status`), `total`/`subtotal` numeric ≥ 0, `currency` default **GHS**, `metadata` jsonb (payment refs, confirmation_sent_at, stock_reduced), `branch_id`.

## Payments (complement)

| Table | Purpose |
|-------|---------|
| `payment_webhook_events` | Idempotent callback/webhook audit |
| `sms_delivery_log` | Optional SMS attempt log |

Payment success state remains on `orders.payment_status` + `orders.metadata`.

## Support / delivery / CMS

`chat_conversations`, `ai_memory`, `support_tickets`, `support_ticket_messages`, `support_feedback`, `support_knowledge_base`, `support_canned_responses`, `support_escalation_rules`, `support_analytics_daily`, `delivery_zones`, `riders`, `delivery_assignments`, `delivery_status_history`, `blog_posts`, `pages`, `cms_content`, `banners`, `navigation_menus`, `navigation_items`, `store_modules`, `store_settings`, `site_settings`, `notifications`, `contact_submissions`, `return_requests`, `return_items`, `audit_logs`, `addresses`, `customer_insights`.

## Meta

| Table | Purpose |
|-------|---------|
| `schema_migrations` | Applied SQL migration versions |

## Triggers (inventory)

- `trg_init_branch_inventory` on products insert
- `trg_init_branch_inventory_branch` on branches insert
- `trg_rebalance_branch_inventory` on products.quantity update
- `trg_sync_product_total_quantity` on branch_inventory

## Key RPCs used by app

`mark_order_paid`, `update_customer_stats`, `upsert_customer_from_order`, `get_order_for_tracking`, `generate_ticket_number`, `get_ai_memories`, `upsert_customer_insight`, `upsert_chat_conversation`, `get_support_dashboard_stats`, `search_chat_conversations`.
