-- 11. STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('category-images', 'category-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-covers', 'blog-covers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('review-images', 'review-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('cms-images', 'cms-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('site-media', 'site-media', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

-- ============================================================================
-- 12. STORAGE POLICIES (consolidated, matches live database)
-- ============================================================================

-- Public read for all public buckets
CREATE POLICY "storage_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media']));

-- Admin insert/update/delete for all managed buckets
CREATE POLICY "storage_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media'])
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

CREATE POLICY "storage_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media'])
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

CREATE POLICY "storage_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = ANY (ARRAY['product-images', 'category-images', 'avatars', 'blog-images', 'blog-covers', 'review-images', 'cms-images', 'banners', 'site-media'])
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- User avatar upload
CREATE POLICY "storage_avatar_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Authenticated review image upload
CREATE POLICY "storage_review_images_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-images' AND auth.uid() IS NOT NULL);

-- ============================================================================
-- 13. SEED DATA
-- ============================================================================

-- Default roles
INSERT INTO public.roles (id, name, description, enabled, is_system, permissions) VALUES
  ('admin', 'Administrator', 'Full system access', true, true, '{"dashboard":true,"orders":true,"products":true,"categories":true,"customers":true,"reviews":true,"inventory":true,"analytics":true,"coupons":true,"support":true,"customer_insights":true,"notifications":true,"sms_debugger":true,"blog":true,"delivery":true,"modules":true,"staff":true,"roles":true,"pos":true}'),
  ('staff', 'Staff', 'Limited system access based on permissions', true, true, '{"dashboard":true,"orders":true,"products":true,"categories":true,"customers":true,"reviews":true,"inventory":true,"pos":true}'),
  ('customer', 'Customer', 'Customer access', true, true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Default store modules
INSERT INTO public.store_modules (id, enabled) VALUES
  ('blog', false),
  ('customer-insights', true),
  ('notifications', true)
ON CONFLICT (id) DO NOTHING;

-- Default delivery zones (fees set to 0)
INSERT INTO public.delivery_zones (name, description, regions, base_fee, express_fee, estimated_days, is_active) VALUES
  ('Greater Accra', 'Accra and surrounding areas', ARRAY['Accra', 'Tema', 'Madina', 'Haatso', 'East Legon', 'Spintex', 'Kasoa', 'Ashaiman'], 0, 0, '1-2 days', true),
  ('Kumasi', 'Kumasi and surrounding areas', ARRAY['Kumasi', 'Adum', 'Kejetia', 'Bantama'], 0, 0, '2-4 days', true),
  ('Other Regions', 'All other regions in Ghana', ARRAY['Takoradi', 'Cape Coast', 'Tamale', 'Sunyani', 'Ho', 'Koforidua'], 0, 0, '3-5 days', true),
  ('International', 'Worldwide delivery', ARRAY['International'], 0, 0, '7-14 days', true);