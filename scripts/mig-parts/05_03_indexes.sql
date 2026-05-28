-- 5. INDEXES
-- ============================================================================

-- Profiles
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

-- Addresses
CREATE INDEX idx_addresses_user_id ON public.addresses USING btree (user_id);

-- Audit Logs
CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);

-- Categories
CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);
CREATE INDEX idx_categories_slug ON public.categories USING btree (slug);
CREATE INDEX idx_categories_status ON public.categories USING btree (status);

-- Products
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_featured ON public.products USING btree (featured);
CREATE INDEX idx_products_slug ON public.products USING btree (slug);
CREATE INDEX idx_products_status ON public.products USING btree (status);
CREATE INDEX idx_products_brand ON public.products USING btree (brand);
CREATE INDEX idx_products_name ON public.products USING btree (name);
CREATE INDEX idx_products_price ON public.products USING btree (price);
CREATE INDEX idx_products_created ON public.products USING btree (created_at);

-- Product Images
CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id);
CREATE INDEX idx_product_images_position ON public.product_images USING btree (position);

-- Product Variants
CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id);

-- Blog Posts
CREATE INDEX idx_blog_posts_slug ON public.blog_posts USING btree (slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts USING btree (status);
CREATE INDEX idx_blog_posts_author ON public.blog_posts USING btree (author_id);

-- Coupons
CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);
CREATE INDEX idx_coupons_active ON public.coupons USING btree (is_active);

-- Orders
CREATE INDEX idx_orders_number ON public.orders USING btree (order_number);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);
CREATE INDEX idx_orders_email ON public.orders USING btree (email);
CREATE INDEX idx_orders_payment ON public.orders USING btree (payment_status);
CREATE INDEX idx_orders_created ON public.orders USING btree (created_at);

-- Order Items
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);
CREATE INDEX idx_order_items_variant ON public.order_items USING btree (variant_id);

-- Order Status History
CREATE INDEX idx_order_status_history_order ON public.order_status_history USING btree (order_id);
CREATE INDEX idx_order_status_history_created_by ON public.order_status_history USING btree (created_by);

-- Cart Items
CREATE INDEX idx_cart_items_user ON public.cart_items USING btree (user_id);
CREATE INDEX idx_cart_items_product ON public.cart_items USING btree (product_id);
CREATE INDEX idx_cart_items_variant ON public.cart_items USING btree (variant_id);

-- Wishlist Items
CREATE INDEX idx_wishlist_items_user ON public.wishlist_items USING btree (user_id);
CREATE INDEX idx_wishlist_items_product ON public.wishlist_items USING btree (product_id);

-- Notifications
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id) WHERE read_at IS NULL;

-- Reviews
CREATE INDEX idx_reviews_product ON public.reviews USING btree (product_id);
CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);
CREATE INDEX idx_reviews_user ON public.reviews USING btree (user_id);

-- Review Images
CREATE INDEX idx_review_images_review ON public.review_images USING btree (review_id);

-- Return Requests
CREATE INDEX idx_return_requests_order ON public.return_requests USING btree (order_id);
CREATE INDEX idx_return_requests_user ON public.return_requests USING btree (user_id);

-- Return Items
CREATE INDEX idx_return_items_return_request ON public.return_items USING btree (return_request_id);
CREATE INDEX idx_return_items_order_item ON public.return_items USING btree (order_item_id);

-- Pages
CREATE INDEX idx_pages_slug ON public.pages USING btree (slug);

-- CMS Content
CREATE INDEX idx_cms_content_section ON public.cms_content USING btree (section);

-- Banners
CREATE INDEX idx_banners_active ON public.banners USING btree (is_active);

-- Navigation Items
CREATE INDEX idx_navigation_items_menu ON public.navigation_items USING btree (menu_id);
CREATE INDEX idx_navigation_items_parent ON public.navigation_items USING btree (parent_id);

-- Store Settings
CREATE INDEX idx_store_settings_updated_by ON public.store_settings USING btree (updated_by);

-- Customers
CREATE INDEX idx_customers_email ON public.customers USING btree (email);
CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id);
CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);

-- Chat Conversations
CREATE INDEX idx_chat_conversations_session ON public.chat_conversations USING btree (session_id);
CREATE INDEX idx_chat_conversations_user ON public.chat_conversations USING btree (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_chat_conversations_created ON public.chat_conversations USING btree (created_at);
CREATE INDEX idx_chat_conversations_category ON public.chat_conversations USING btree (category);
CREATE INDEX idx_chat_conversations_sentiment ON public.chat_conversations USING btree (sentiment);

-- AI Memory
CREATE INDEX idx_ai_memory_customer_email ON public.ai_memory USING btree (customer_email);
CREATE INDEX idx_ai_memory_type ON public.ai_memory USING btree (memory_type);
CREATE INDEX idx_ai_memory_source_conversation ON public.ai_memory USING btree (source_conversation_id);

-- Customer Insights
CREATE INDEX idx_customer_insights_email ON public.customer_insights USING btree (customer_email);

-- Support Tickets
CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);
CREATE INDEX idx_support_tickets_conversation ON public.support_tickets USING btree (conversation_id);
CREATE INDEX idx_support_tickets_number ON public.support_tickets USING btree (ticket_number);

-- Support Ticket Messages
CREATE INDEX idx_support_ticket_messages_ticket ON public.support_ticket_messages USING btree (ticket_id);

-- Support Feedback
CREATE INDEX idx_support_feedback_conversation ON public.support_feedback USING btree (conversation_id);
CREATE INDEX idx_support_feedback_ticket ON public.support_feedback USING btree (ticket_id);

-- Support Knowledge Base
CREATE INDEX idx_support_kb_source_ticket ON public.support_knowledge_base USING btree (source_ticket_id);

-- Riders
CREATE INDEX idx_riders_status ON public.riders USING btree (status);
CREATE INDEX idx_riders_zone ON public.riders USING btree (zone_id);

-- Delivery Assignments
CREATE INDEX idx_delivery_assignments_order ON public.delivery_assignments USING btree (order_id);
CREATE INDEX idx_delivery_assignments_rider ON public.delivery_assignments USING btree (rider_id);
CREATE INDEX idx_delivery_assignments_status ON public.delivery_assignments USING btree (status);
CREATE INDEX idx_delivery_assignments_zone ON public.delivery_assignments USING btree (zone_id);
CREATE INDEX idx_delivery_assignments_assigned_by ON public.delivery_assignments USING btree (assigned_by);

-- Delivery Status History
CREATE INDEX idx_delivery_status_history_assignment ON public.delivery_status_history USING btree (assignment_id);
CREATE INDEX idx_delivery_status_history_changed_by ON public.delivery_status_history USING btree (changed_by);

-- ============================================================================