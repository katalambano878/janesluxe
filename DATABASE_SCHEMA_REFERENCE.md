# Database Schema Reference (active tables)

Concise reference for Jane's Luxe multi-branch commerce.

## branches
- `id` uuid PK, `name`, `slug` unique, `address`, `phone`, `is_active` bool, `sort_order`, timestamps
- Used by storefront selector + admin switcher

## branch_inventory
- `branch_id` → branches, `product_id` → products, `quantity`
- Stock is per-branch

## products / product_images / product_variants / categories
- Catalog; images via `product_images.product_id`

## orders / order_items
- `orders.branch_id`, `payment_status`, `status`, `metadata` jsonb, money numerics
- `order_items.product_id`, `metadata` jsonb

## profiles + auth.users
- Auth identity; `profiles.role` in (`admin`,`staff`,…)

## Other
- coupons, delivery_zones/riders/assignments, store_settings, support_*, chat_*, cms_content
