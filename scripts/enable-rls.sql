-- ============================================================
-- SECURITY FIX: Enable Row Level Security on ALL tables
-- Run this ENTIRE script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new
-- ============================================================

-- 1. ORDERS (users see only their own)
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Anon can create guest orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Anon can create guest orders" ON public.orders FOR INSERT WITH CHECK (user_id IS NULL);

-- 2. ORDER_ITEMS (users see only their order's items)
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;
CREATE POLICY "Users can view own order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Users can insert order items" ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)));

-- 3. PROFILES (users see only their own)
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 4. CUSTOMERS (admin/staff only)
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage customers" ON public.customers;
CREATE POLICY "Admin can manage customers" ON public.customers FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- 5. PRODUCTS (public read)
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products" ON public.products FOR SELECT USING (true);

-- 6. PRODUCT_IMAGES (public read)
ALTER TABLE IF EXISTS public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view product images" ON public.product_images;
CREATE POLICY "Public can view product images" ON public.product_images FOR SELECT USING (true);

-- 7. PRODUCT_VARIANTS (public read)
ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants;
CREATE POLICY "Public can view variants" ON public.product_variants FOR SELECT USING (true);

-- 8. CATEGORIES (public read)
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true);

-- 9. BANNERS (public read)
ALTER TABLE IF EXISTS public.banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view banners" ON public.banners;
CREATE POLICY "Public can view banners" ON public.banners FOR SELECT USING (true);

-- 10. STORE_MODULES (public read)
ALTER TABLE IF EXISTS public.store_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view modules" ON public.store_modules;
CREATE POLICY "Public can view modules" ON public.store_modules FOR SELECT USING (true);

-- 11. REVIEWS (public read, auth insert)
ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "Public can view reviews" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 12. REVIEW_IMAGES (public read)
ALTER TABLE IF EXISTS public.review_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view review images" ON public.review_images;
CREATE POLICY "Public can view review images" ON public.review_images FOR SELECT USING (true);

-- 13. COUPONS (public read for validation)
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read coupons" ON public.coupons;
CREATE POLICY "Public can read coupons" ON public.coupons FOR SELECT USING (true);

-- 14. BLOG_POSTS (public read)
ALTER TABLE IF EXISTS public.blog_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view posts" ON public.blog_posts;
CREATE POLICY "Public can view posts" ON public.blog_posts FOR SELECT USING (true);

-- 15. PAGES (public read)
ALTER TABLE IF EXISTS public.pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view pages" ON public.pages;
CREATE POLICY "Public can view pages" ON public.pages FOR SELECT USING (true);

-- 16. CMS_CONTENT (public read)
ALTER TABLE IF EXISTS public.cms_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view cms" ON public.cms_content;
CREATE POLICY "Public can view cms" ON public.cms_content FOR SELECT USING (true);

-- 17. SITE_SETTINGS (public read)
ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view settings" ON public.site_settings;
CREATE POLICY "Public can view settings" ON public.site_settings FOR SELECT USING (true);

-- 18. STORE_SETTINGS (public read)
ALTER TABLE IF EXISTS public.store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view store settings" ON public.store_settings;
CREATE POLICY "Public can view store settings" ON public.store_settings FOR SELECT USING (true);

-- 19. NAVIGATION (public read)
ALTER TABLE IF EXISTS public.navigation_menus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view menus" ON public.navigation_menus;
CREATE POLICY "Public can view menus" ON public.navigation_menus FOR SELECT USING (true);

ALTER TABLE IF EXISTS public.navigation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view nav items" ON public.navigation_items;
CREATE POLICY "Public can view nav items" ON public.navigation_items FOR SELECT USING (true);

-- 20. ADDRESSES (users own only)
ALTER TABLE IF EXISTS public.addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own addresses" ON public.addresses;
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id);

-- 21. CART_ITEMS (users own only)
ALTER TABLE IF EXISTS public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cart" ON public.cart_items;
CREATE POLICY "Users manage own cart" ON public.cart_items FOR ALL USING (auth.uid() = user_id);

-- 22. WISHLIST_ITEMS (users own only)
ALTER TABLE IF EXISTS public.wishlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlist_items;
CREATE POLICY "Users manage own wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id);

-- 23. NOTIFICATIONS (admin only)
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can manage notifications" ON public.notifications;
CREATE POLICY "Admin can manage notifications" ON public.notifications FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- 24. AUDIT_LOGS (admin only)
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can view audit logs" ON public.audit_logs;
CREATE POLICY "Admin can view audit logs" ON public.audit_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- 25. ORDER_STATUS_HISTORY (users see own order history)
ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own order history" ON public.order_status_history;
CREATE POLICY "Users can view own order history" ON public.order_status_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid()));

-- 26. SUPPORT_TICKETS (users own + admin)
ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own tickets" ON public.support_tickets;
CREATE POLICY "Users manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- 27. SUPPORT_MESSAGES (users see own ticket messages + admin)
ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view messages for own tickets" ON public.support_messages;
CREATE POLICY "Users view messages for own tickets" ON public.support_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = support_messages.ticket_id AND (support_tickets.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))));

-- 28. RETURN_REQUESTS (users own + admin)
ALTER TABLE IF EXISTS public.return_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own returns" ON public.return_requests;
CREATE POLICY "Users manage own returns" ON public.return_requests FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- 29. RETURN_ITEMS (users see own return items + admin)
ALTER TABLE IF EXISTS public.return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own return items" ON public.return_items;
CREATE POLICY "Users view own return items" ON public.return_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.return_requests WHERE return_requests.id = return_items.return_request_id AND (return_requests.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))));

-- ============================================================
-- VERIFICATION: Check all tables have RLS enabled
-- ============================================================
SELECT tablename, 
       CASE WHEN rowsecurity THEN '✅ SECURED' ELSE '❌ EXPOSED' END AS rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY rowsecurity ASC, tablename;
