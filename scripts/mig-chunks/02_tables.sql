-- 4. TABLES
-- ============================================================================

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE,
  role user_role DEFAULT 'customer'::user_role,
  full_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  gender gender_type,
  preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Roles (RBAC)
CREATE TABLE public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  is_system boolean DEFAULT false,
  permissions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Addresses
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  type address_type DEFAULT 'shipping'::address_type,
  is_default boolean DEFAULT false,
  label text,
  full_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Settings
CREATE TABLE public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Site Settings (key-value with category)
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.categories(id),
  image_url text,
  position integer DEFAULT 0,
  status category_status DEFAULT 'active'::category_status,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  short_description text,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  sku text UNIQUE,
  barcode text,
  quantity integer DEFAULT 0,
  track_quantity boolean DEFAULT true,
  continue_selling boolean DEFAULT false,
  weight numeric,
  weight_unit text DEFAULT 'kg'::text,
  category_id uuid REFERENCES public.categories(id),
  brand text,
  vendor text,
  tags text[],
  status product_status DEFAULT 'active'::product_status,
  featured boolean DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  external_id text,
  external_source text,
  seo_title text,
  seo_description text,
  rating_avg numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  moq integer DEFAULT 1 CHECK (moq >= 1)
);

-- Product Images
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  url text NOT NULL,
  alt_text text,
  position integer DEFAULT 0,
  width integer,
  height integer,
  created_at timestamptz DEFAULT now(),
  media_type text DEFAULT 'image' CHECK (media_type IN ('image', 'video'))
);

-- Product Variants
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  sku text UNIQUE,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  quantity integer DEFAULT 0,
  weight numeric,
  option1 text,
  option2 text,
  option3 text,
  image_url text,
  barcode text,
  external_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  description text,
  type discount_type NOT NULL,
  value numeric NOT NULL,
  minimum_purchase numeric DEFAULT 0,
  maximum_discount numeric,
  usage_limit integer,
  usage_count integer DEFAULT 0,
  per_user_limit integer DEFAULT 1,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  phone text,
  status order_status DEFAULT 'pending'::order_status,
  payment_status payment_status DEFAULT 'pending'::payment_status,
  currency text DEFAULT 'USD'::text,
  subtotal numeric NOT NULL,
  tax_total numeric DEFAULT 0,
  shipping_total numeric DEFAULT 0,
  discount_total numeric DEFAULT 0,
  total numeric NOT NULL,
  shipping_method text,
  payment_method text,
  payment_provider text,
  payment_transaction_id text,
  notes text,
  cancel_reason text,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  payment_reminder_sent boolean DEFAULT false,
  payment_reminder_sent_at timestamptz
);

-- Order Items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  product_name text NOT NULL,
  variant_name text,
  sku text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Order Status History
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  status order_status NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Cart Items
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id, variant_id)
);

-- Wishlist Items
CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.products(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  user_id uuid REFERENCES auth.users(id),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  content text,
  status review_status DEFAULT 'pending'::review_status,
  verified_purchase boolean DEFAULT false,
  helpful_votes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Review Images
CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  review_id uuid REFERENCES public.reviews(id),
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Blog Posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL,
  featured_image text,
  author_id uuid REFERENCES auth.users(id),
  status blog_status DEFAULT 'draft'::blog_status,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Requests
CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  user_id uuid REFERENCES auth.users(id),
  status return_status DEFAULT 'pending'::return_status,
  reason text NOT NULL,
  description text,
  refund_amount numeric,
  refund_method text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Items
CREATE TABLE public.return_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  return_request_id uuid REFERENCES public.return_requests(id),
  order_item_id uuid REFERENCES public.order_items(id),
  quantity integer NOT NULL,
  reason text,
  condition text,
  created_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Pages (CMS)
CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text,
  status text DEFAULT 'draft'::text,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CMS Content blocks
CREATE TABLE public.cms_content (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  section text NOT NULL,
  block_key text NOT NULL,
  title text,
  subtitle text,
  content text,
  image_url text,
  button_text text,
  button_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, block_key)
);

-- Banners
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'promotional'::text,
  title text,
  subtitle text,
  image_url text,
  background_color text DEFAULT '#000000'::text,
  text_color text DEFAULT '#FFFFFF'::text,
  button_text text,
  button_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  position text DEFAULT 'top'::text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation Menus
CREATE TABLE public.navigation_menus (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation Items
CREATE TABLE public.navigation_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  menu_id uuid REFERENCES public.navigation_menus(id),
  parent_id uuid REFERENCES public.navigation_items(id),
  label text NOT NULL,
  url text NOT NULL,
  icon text,
  is_external boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Modules (feature flags)
CREATE TABLE public.store_modules (
  id text PRIMARY KEY,
  enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Customers (CRM / POS)
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  phone text,
  full_name text,
  first_name text,
  last_name text,
  user_id uuid REFERENCES auth.users(id),
  default_address jsonb,
  notes text,
  tags text[],
  total_orders integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  secondary_phone text,
  secondary_email text
);

-- Chat Conversations (AI chat widget persistence)
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sentiment text DEFAULT 'neutral',
  sentiment_score numeric,
  category text,
  intent text,
  summary text,
  is_resolved boolean DEFAULT false,
  is_escalated boolean DEFAULT false,
  escalated_at timestamptz,
  message_count integer DEFAULT 0,
  customer_email text,
  customer_name text,
  ai_handled boolean DEFAULT true,
  first_response_ms integer,
  tags text[],
  page_context text,
  duration_seconds integer
);

-- AI Memory
CREATE TABLE public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_email text,
  memory_type text NOT NULL DEFAULT 'context',
  content text NOT NULL,
  importance text DEFAULT 'normal',
  expires_at timestamptz,
  source_conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Customer Insights (CRM analytics)
CREATE TABLE public.customer_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_email text,
  customer_name text,
  total_conversations integer DEFAULT 0,
  total_tickets integer DEFAULT 0,
  total_messages_sent integer DEFAULT 0,
  avg_satisfaction numeric,
  preferred_categories text[],
  preferred_products text[],
  communication_style text,
  sentiment_trend text DEFAULT 'neutral',
  preferences jsonb DEFAULT '{}'::jsonb,
  ai_notes jsonb DEFAULT '{}'::jsonb,
  important_context text[],
  lifetime_value numeric DEFAULT 0,
  churn_risk text DEFAULT 'low',
  vip_status boolean DEFAULT false,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  customer_name text,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  category text,
  assigned_to text,
  channel text DEFAULT 'chat',
  tags text[],
  resolution text,
  resolved_at timestamptz,
  closed_at timestamptz,
  first_response_at timestamptz,
  sla_deadline timestamptz,
  satisfaction_rating integer,
  satisfaction_feedback text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Ticket Messages
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'agent',
  sender_id text,
  sender_name text,
  content text NOT NULL,
  attachments jsonb,
  is_internal boolean DEFAULT false,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Support Feedback
CREATE TABLE public.support_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text text,
  feedback_categories text[],
  created_at timestamptz DEFAULT now()
);

-- Support Knowledge Base
CREATE TABLE public.support_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  tags text[],
  source text DEFAULT 'manual',
  source_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  helpful_count integer DEFAULT 0,
  not_helpful_count integer DEFAULT 0,
  is_published boolean DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Canned Responses
CREATE TABLE public.support_canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  shortcut text,
  use_count integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Escalation Rules
CREATE TABLE public.support_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  condition_type text NOT NULL,
  condition_value jsonb NOT NULL,
  action_type text NOT NULL,
  action_value jsonb NOT NULL,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Analytics Daily
CREATE TABLE public.support_analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_conversations integer DEFAULT 0,
  total_messages integer DEFAULT 0,
  total_tickets_created integer DEFAULT 0,
  total_tickets_resolved integer DEFAULT 0,
  avg_response_time_ms integer,
  avg_resolution_time_ms integer,
  avg_satisfaction numeric,
  top_categories jsonb,
  top_intents jsonb,
  sentiment_distribution jsonb,
  ai_handled_count integer DEFAULT 0,
  human_escalated_count integer DEFAULT 0,
  unique_customers integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Delivery Zones
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  description text,
  regions text[] DEFAULT '{}',
  base_fee numeric DEFAULT 0,
  express_fee numeric DEFAULT 0,
  estimated_days text DEFAULT '1-3 days',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Riders
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  vehicle_type text DEFAULT 'motorcycle',
  license_plate text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_delivery', 'off_duty')),
  avatar_url text,
  zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  total_deliveries integer DEFAULT 0,
  successful_deliveries integer DEFAULT 0,
  rating_avg numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Delivery Assignments
CREATE TABLE public.delivery_assignments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  status text DEFAULT 'assigned' CHECK (status IN ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_at timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  in_transit_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  estimated_delivery timestamptz,
  delivery_notes text,
  failure_reason text,
  proof_of_delivery text,
  customer_signature text,
  delivery_fee numeric DEFAULT 0,
  assigned_by uuid REFERENCES auth.users(id),
  zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Delivery Status History
CREATE TABLE public.delivery_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Contact Submissions
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================