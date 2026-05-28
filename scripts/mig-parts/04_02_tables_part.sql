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
-- ============================================================================;
