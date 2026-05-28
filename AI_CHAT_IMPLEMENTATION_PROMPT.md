  # AI Chat Widget & Support System — Complete Implementation Prompt

  > **Use this prompt to implement the full AI-powered chat widget and support system on the same Next.js + Supabase e-commerce project that doesn't yet have it.**

  ---

  ## Overview

  Implement a comprehensive AI-powered customer support chat widget with:
  - Real-time AI assistant powered by Groq (LLM with function calling)
  - Product search, order tracking, coupon validation, support ticket creation, returns initiation
  - Full website knowledge base so the AI can answer any question about the business
  - Admin Support Hub with conversation history, ticket management, knowledge base, and analytics
  - Markdown rendering in chat messages
  - Post-chat feedback collection
  - AI memory system that remembers customers across conversations
  - Sentiment analysis, auto-categorization, and auto-escalation
  - Mobile-responsive full-screen chat on phones, floating panel on desktop

  ---

  ## Tech Stack

  - **Framework:** Next.js 15 (App Router)
  - **Database:** Supabase (PostgreSQL)
  - **AI:** Groq API (`openai/gpt-oss-120b` model) with function calling
  - **UI:** Tailwind CSS + Remix Icons (`remixicon`)
  - **Charts:** Recharts (for analytics page)
  - **Auth:** Supabase Auth (cookie-based session detection)

  ---

  ## Environment Variables Required

  Add to `.env.local`:
  ```
  GROQ_API_KEY=your_groq_api_key_here
  ```

  The following should already exist:
  ```
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  ```

  ---

  ## PART 1: Database Schema Changes

  The project already has a `chat_conversations` table with basic columns (`id`, `user_id`, `session_id`, `messages`, `metadata`, `created_at`, `updated_at`) and basic `support_tickets` / `support_messages` tables. We need to enhance these and add new tables.

  ### 1A. Enhance `chat_conversations` table

  ```sql
  ALTER TABLE public.chat_conversations
    ADD COLUMN IF NOT EXISTS sentiment text,
    ADD COLUMN IF NOT EXISTS sentiment_score decimal(3,2),
    ADD COLUMN IF NOT EXISTS category text,
    ADD COLUMN IF NOT EXISTS intent text,
    ADD COLUMN IF NOT EXISTS summary text,
    ADD COLUMN IF NOT EXISTS is_resolved boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_escalated boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
    ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS customer_email text,
    ADD COLUMN IF NOT EXISTS customer_name text,
    ADD COLUMN IF NOT EXISTS ai_handled boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS first_response_ms integer,
    ADD COLUMN IF NOT EXISTS tags text[],
    ADD COLUMN IF NOT EXISTS page_context text,
    ADD COLUMN IF NOT EXISTS duration_seconds integer;
  ```

  ### 1B. Create new support system tables

  ```sql
  -- Enhanced support tickets (if needed, add columns to existing table)
  ALTER TABLE public.support_tickets
    ADD COLUMN IF NOT EXISTS customer_name text,
    ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.chat_conversations(id),
    ADD COLUMN IF NOT EXISTS channel text DEFAULT 'web',
    ADD COLUMN IF NOT EXISTS sla_deadline timestamptz,
    ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS resolution_notes text;

  -- Support ticket messages (enhanced, add if missing)
  ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS sender_type text DEFAULT 'customer',
    ADD COLUMN IF NOT EXISTS sender_name text;

  -- Customer Insights (aggregated intelligence)
  CREATE TABLE IF NOT EXISTS public.customer_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES auth.users(id),
    customer_email text,
    customer_name text,
    total_conversations integer DEFAULT 0,
    total_tickets integer DEFAULT 0,
    avg_sentiment_score decimal(3,2),
    preferred_categories text[],
    last_interaction_at timestamptz,
    lifetime_value decimal(10,2) DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(customer_id),
    UNIQUE(customer_email)
  );

  -- Knowledge Base
  CREATE TABLE IF NOT EXISTS public.support_knowledge_base (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    content text NOT NULL,
    category text,
    tags text[],
    source text DEFAULT 'manual',
    is_published boolean DEFAULT true,
    helpful_count integer DEFAULT 0,
    not_helpful_count integer DEFAULT 0,
    view_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  -- Customer Feedback
  CREATE TABLE IF NOT EXISTS public.support_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid REFERENCES public.chat_conversations(id),
    customer_id uuid REFERENCES auth.users(id),
    customer_email text,
    rating integer CHECK (rating >= 1 AND rating <= 5),
    feedback_text text,
    feedback_categories text[],
    created_at timestamptz DEFAULT now()
  );

  -- AI Memory (persistent memory across conversations)
  CREATE TABLE IF NOT EXISTS public.ai_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES auth.users(id),
    customer_email text,
    memory_type text NOT NULL, -- 'preference', 'issue', 'context', 'instruction', 'fact'
    content text NOT NULL,
    importance text DEFAULT 'normal', -- 'low', 'normal', 'high', 'critical'
    source_conversation_id uuid REFERENCES public.chat_conversations(id),
    expires_at timestamptz,
    created_at timestamptz DEFAULT now()
  );

  -- Daily Analytics Aggregation
  CREATE TABLE IF NOT EXISTS public.support_analytics_daily (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date date NOT NULL UNIQUE,
    total_conversations integer DEFAULT 0,
    total_tickets integer DEFAULT 0,
    avg_rating decimal(3,2),
    avg_response_ms integer,
    positive_sentiment integer DEFAULT 0,
    neutral_sentiment integer DEFAULT 0,
    negative_sentiment integer DEFAULT 0,
    ai_resolved integer DEFAULT 0,
    human_escalated integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
  );

  -- Escalation Rules
  CREATE TABLE IF NOT EXISTS public.support_escalation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    condition_type text NOT NULL, -- 'sentiment', 'keyword', 'message_count', 'no_resolution'
    condition_value text NOT NULL,
    action text NOT NULL, -- 'create_ticket', 'notify_admin', 'flag_urgent'
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  ```

  ### 1C. Indexes

  ```sql
  CREATE INDEX IF NOT EXISTS idx_chat_conv_sentiment ON public.chat_conversations(sentiment);
  CREATE INDEX IF NOT EXISTS idx_chat_conv_category ON public.chat_conversations(category);
  CREATE INDEX IF NOT EXISTS idx_chat_conv_resolved ON public.chat_conversations(is_resolved);
  CREATE INDEX IF NOT EXISTS idx_chat_conv_escalated ON public.chat_conversations(is_escalated);
  CREATE INDEX IF NOT EXISTS idx_chat_conv_email ON public.chat_conversations(customer_email);
  CREATE INDEX IF NOT EXISTS idx_kb_published ON public.support_knowledge_base(is_published);
  CREATE INDEX IF NOT EXISTS idx_kb_category ON public.support_knowledge_base(category);
  CREATE INDEX IF NOT EXISTS idx_feedback_rating ON public.support_feedback(rating);
  CREATE INDEX IF NOT EXISTS idx_feedback_conv ON public.support_feedback(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_memory_customer ON public.ai_memory(customer_id);
  CREATE INDEX IF NOT EXISTS idx_memory_email ON public.ai_memory(customer_email);
  CREATE INDEX IF NOT EXISTS idx_memory_type ON public.ai_memory(memory_type);
  CREATE INDEX IF NOT EXISTS idx_analytics_date ON public.support_analytics_daily(date);
  ```

  ### 1D. Enable RLS on new tables

  ```sql
  ALTER TABLE public.customer_insights ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.support_knowledge_base ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.support_analytics_daily ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.support_escalation_rules ENABLE ROW LEVEL SECURITY;

  -- Admin/staff full access policies for each table
  CREATE POLICY "Admin access customer_insights" ON public.customer_insights FOR ALL USING (public.is_admin_or_staff());
  CREATE POLICY "Admin access knowledge_base" ON public.support_knowledge_base FOR ALL USING (public.is_admin_or_staff());
  CREATE POLICY "Admin access feedback" ON public.support_feedback FOR ALL USING (public.is_admin_or_staff());
  CREATE POLICY "Admin access ai_memory" ON public.ai_memory FOR ALL USING (public.is_admin_or_staff());
  CREATE POLICY "Admin access analytics" ON public.support_analytics_daily FOR ALL USING (public.is_admin_or_staff());
  CREATE POLICY "Admin access escalation_rules" ON public.support_escalation_rules FOR ALL USING (public.is_admin_or_staff());
  CREATE POLICY "Admin access chat_conversations" ON public.chat_conversations FOR ALL USING (public.is_admin_or_staff());

  -- Service role full access
  CREATE POLICY "Service role customer_insights" ON public.customer_insights FOR ALL USING (auth.role() = 'service_role');
  CREATE POLICY "Service role knowledge_base" ON public.support_knowledge_base FOR ALL USING (auth.role() = 'service_role');
  CREATE POLICY "Service role feedback" ON public.support_feedback FOR ALL USING (auth.role() = 'service_role');
  CREATE POLICY "Service role ai_memory" ON public.ai_memory FOR ALL USING (auth.role() = 'service_role');
  CREATE POLICY "Service role analytics" ON public.support_analytics_daily FOR ALL USING (auth.role() = 'service_role');
  CREATE POLICY "Service role escalation_rules" ON public.support_escalation_rules FOR ALL USING (auth.role() = 'service_role');
  CREATE POLICY "Service role chat_conversations" ON public.chat_conversations FOR ALL USING (auth.role() = 'service_role');

  -- Customer policies
  CREATE POLICY "Customers submit feedback" ON public.support_feedback FOR INSERT WITH CHECK (true);
  CREATE POLICY "Public view published kb" ON public.support_knowledge_base FOR SELECT USING (is_published = true);
  ```

  ### 1E. RPC Functions

  Create these PostgreSQL functions:

  1. **`generate_ticket_number()`** — Generates ticket numbers like `TKT-00001`
  2. **`get_support_dashboard_stats()`** — Returns KPIs for the support dashboard
  3. **`get_ai_memories(p_customer_id uuid, p_customer_email text)`** — Retrieves AI memories for a customer
  4. **`save_ai_memory(...)`** — Stores a new AI memory
  5. **`upsert_customer_insight(...)`** — Creates/updates aggregated customer insights
  6. **`aggregate_support_analytics(p_date date)`** — Aggregates daily support metrics
  7. **`search_chat_conversations(p_search text, p_sentiment text, p_resolved text, p_limit int, p_offset int)`** — Deep search across message content in conversations (searches inside the `messages` jsonb column using `::text ILIKE`)

  The `search_chat_conversations` function is critical — it returns `jsonb` with `{data: [...], total: N}` and searches:
  - `messages::text ILIKE '%search%'` (searches inside actual chat message content)
  - `customer_email`, `customer_name`, `summary`, `session_id`, `category`, `intent`

  ### 1F. Seed Knowledge Base

  Insert ~20 articles into `support_knowledge_base` covering all website content:
  - Business overview (about Store, founded by Founder, China sourcing)
  - Contact info (phone: [PHONE], Manager: [MANAGER_PHONE], Support: [SUPPORT_PHONE], email: support@example.com)
  - Shipping policy (Standard GH₵20, Express GH₵40, Free pickup, Free over GH₵300, zones)
  - Returns policy (30 days, unused, 5-7 day refund)
  - Payment methods (Mobile Money MTN/Vodafone/AirtelTigo via Moolre, COD Accra only)
  - Account management (signup, password reset, guest checkout)
  - Shopping guide (browse, filter, sort, cart, checkout)
  - FAQ sections (orders, shipping, returns, payment, account)
  - Help center, support tickets, blog, privacy, terms
  - Store features (free pickup, 30-day returns, 24/7 support, secure payment)

  Set `source = 'website_content'` for all seeded articles.

  ---

  ## PART 2: Files to Create

  ### 2A. `lib/chat-tools.ts` (~400 lines)

  This is the tool functions library. Implements these exported functions (each takes a `supabase` client as first arg):

  - **`searchProducts(supabase, query, limit)`** — Searches products table by name/description, returns `ChatProduct[]`
  - **`getProductForCart(supabase, slugOrId)`** — Gets a single product by slug or UUID
  - **`trackOrder(supabase, orderNumber, email)`** — Tracks order by number + email, returns `ChatOrder`
  - **`getCustomerOrders(supabase, userId, limit)`** — Gets recent orders for logged-in user
  - **`checkCoupon(supabase, code, cartTotal)`** — Validates a coupon code
  - **`createSupportTicket(supabase, { userId, email, subject, description, category })`** — Creates a support ticket
  - **`initiateReturn(supabase, { userId, orderId, reason, description })`** — Starts a return request
  - **`getRecommendations(supabase, context)`** — Gets product recommendations
  - **`getStoreInfo(topic)`** — Returns static store info (shipping, returns, payment, contact, about, hours)
  - **`getCustomerProfile(supabase, userId)`** — Gets customer profile for personalization

  Exported types: `ChatProduct`, `ChatOrder`, `ChatCoupon`, `ChatTicket`, `ChatReturn`, `ChatCustomerProfile`

  ### 2B. `lib/site-knowledge.ts` (~450 lines)

  In-memory website knowledge base with:
  - `SiteKnowledgeEntry` type: `{ id, title, path, category, content, keywords }`
  - `SITE_KNOWLEDGE` array: ~20 entries covering every public page of the website
  - `searchSiteKnowledge(query, maxResults)` — Keyword-weighted search returning top matches
  - `getKnowledgeByCategory(category)` — Filter by category
  - `getSiteMapSummary()` — Returns a condensed site map string for the system prompt

  Content categories: `company`, `contact`, `shipping`, `returns`, `payment`, `account`, `shopping`, `faq`, `legal`, `support`, `content`, `orders`

  Each entry has content extracted from the actual frontend pages (about, contact, shipping, returns, FAQs, help center, blog, privacy, terms, etc.). Keywords are used for weighted matching.

  ### 2C. `components/MarkdownMessage.tsx` (~160 lines)

  Lightweight markdown renderer for chat messages (no external dependencies). Supports:
  - `**bold**` → `<strong>`
  - `*italic*` → `<em>`
  - `` `code` `` → `<code>`
  - `[link](url)` → `<a>`
  - `- bullet list` / `* bullet list` → `<ul><li>`
  - `1. numbered list` → `<ol><li>`
  - Paragraph separation from line breaks

  Props: `{ content: string, className?: string, isUserMessage?: boolean }`

  Uses different styling for user messages (light text on dark bg) vs assistant messages (dark text on light bg). Bullet markers are emerald-colored.

  ### 2D. `components/ChatWidget.tsx` (~770 lines)

  The main chat widget component. Import it dynamically with `ssr: false` in the store layout.

  **Structure:**
  - Floating toggle button (emerald green, fixed position, above mobile bottom nav)
  - Chat panel (full screen on mobile `inset-0`, floating 400px panel on desktop)
  - Header with title "Store", online indicator, clear chat button, close button
  - Message list with auto-scroll
  - Message bubbles using `MarkdownMessage` for rendering
  - Product cards (image, name, price, Add to Cart button, View button)
  - Order cards (order number, status badge, progress bar, items, total)
  - Ticket cards (support ticket confirmation)
  - Return cards (return request confirmation)
  - Coupon cards (valid/invalid display)
  - Quick reply buttons (horizontally scrollable on mobile, wrapped on desktop)
  - Post-chat feedback (star rating + optional text, appears when clearing chat with 3+ messages)
  - Input area with 16px font on mobile (prevents iOS zoom), safe area padding for iPhone
  - "Powered by " footer linked to https://example.com

  **Key behaviors:**
  - Messages persist in `localStorage` (last 30 messages)
  - Session ID stored in `sessionStorage`
  - Sends messages to `/api/chat` with conversation history, session ID, and current page path
  - Credentials: `include` (sends auth cookies for user detection)
  - Unread badge counter when chat is closed
  - Rate limited to 12 messages/minute

  **Mobile responsive:**
  - Full screen on mobile (`fixed inset-0`), floating panel on desktop (`sm:bottom-6 sm:right-4 sm:w-[400px] sm:h-[min(75vh,600px)] sm:rounded-2xl`)
  - Safe area insets for iPhone notch/home indicator
  - Toggle button hidden when chat is open
  - Close button always visible
  - Input font 16px on mobile to prevent iOS auto-zoom
  - Quick replies horizontally scrollable on mobile, hidden scrollbar
  - Product cards slightly more compact on mobile

  ### 2E. `app/api/chat/route.ts` (~1060 lines)

  The main AI chat API endpoint. This is the brain of the system.

  **Architecture:**
  1. Receives POST with `{ messages, newMessage, sessionId, pagePath }`
  2. Rate limits by session/IP (12/minute)
  3. Detects auth from Supabase cookie
  4. Fetches customer profile if logged in
  5. Fetches AI memories for the customer
  6. Searches knowledge base (both Supabase KB and in-memory site knowledge)
  7. Builds system prompt with full context
  8. Calls Groq API with function calling (11 tools)
  9. Handles up to 3 rounds of tool calling
  10. Persists conversation to database with sentiment, category, intent, summary
  11. Auto-saves memories for negative sentiment and product searches

  **LLM Configuration:**
  - API: `https://api.groq.com/openai/v1/chat/completions`
  - Model: `openai/gpt-oss-120b`
  - Max tokens: 1024
  - Temperature: 0.6
  - Conversation history: last 18 messages

  **System Prompt includes:**
  - Business identity and policies
  - Critical conversation rules (anti-repetition, context retention, honesty)
  - Limitations (can't reset passwords, modify orders, etc.)
  - Auto-escalation rules (create ticket + share contact info when stuck)
  - Contact info ([PHONE], Manager: [MANAGER_PHONE], support@example.com)
  - Full site map of all pages
  - Customer context (profile, auth status)
  - AI memories from past conversations
  - Pre-fetched site knowledge based on the user's message

  **11 Tools (function calling):**
  1. `search_products` — Search products by query
  2. `get_product_for_cart` — Get a specific product for cart
  3. `track_order` — Track order by number + email
  4. `get_customer_orders` — Get recent orders (auth required)
  5. `check_coupon` — Validate discount code
  6. `create_support_ticket` — Create ticket (accepts email from conversation)
  7. `initiate_return` — Start return (auth required)
  8. `get_recommendations` — Product recommendations
  9. `get_store_info` — Store policies/info
  10. `get_customer_profile` — Logged-in customer profile
  11. `get_website_info` — Search all website content/pages/policies/FAQs

  **Fallback:** If no Groq API key, uses rule-based pattern matching with the same tool functions.

  **Conversation Persistence:**
  - Calls `upsert_chat_conversation` RPC with last 20 messages
  - Updates enhanced columns: sentiment, category, intent, summary, message_count, customer_email, customer_name, is_resolved, is_escalated, page_context, duration_seconds
  - Auto-saves AI memory for negative sentiment experiences
  - Auto-saves preference memories from product searches

  ### 2F. Support API Routes

  Create these API routes:

  **`app/api/support/conversations/route.ts`** (~55 lines)
  - GET: List conversations with pagination, search, filters
  - PATCH: Update conversation metadata (is_resolved, etc.)

  **`app/api/support/tickets/route.ts`** (~105 lines)
  - GET: List tickets with pagination, status/priority filters, search
  - POST: Create new ticket (generates ticket number, sets SLA deadline)
  - PATCH: Update ticket status, priority, assignment, resolution

  **`app/api/support/tickets/[id]/messages/route.ts`** (~55 lines)
  - GET: Get all messages for a ticket
  - POST: Add message to ticket (reply, internal note, system message)

  **`app/api/support/knowledge-base/route.ts`** (~75 lines)
  - GET: List articles with search, category filter
  - POST: Create article
  - PATCH: Update article
  - DELETE: Delete article

  **`app/api/support/feedback/route.ts`** (~40 lines)
  - POST: Submit feedback (rating + optional text)
  - GET: List recent feedback

  **`app/api/support/analytics/route.ts`** (~110 lines)
  - GET: Aggregated analytics (conversation stats, ticket stats, sentiment, categories, ratings, daily trends)

  All support API routes use the Supabase service role key for admin access.

  ### 2G. Admin Support Hub Pages

  Add a "Support Hub" menu item to `app/admin/layout.tsx`:
  ```typescript
  {
    title: 'Support Hub',
    icon: 'ri-customer-service-2-line',
    path: '/admin/support',
  },
  ```

  Create these admin pages:

  **`app/admin/support/page.tsx`** (~240 lines) — Dashboard
  - KPI cards: total conversations, open tickets, avg satisfaction, AI resolution rate
  - Recent AI conversations list
  - Open tickets list
  - Quick action links to sub-pages

  **`app/admin/support/conversations/page.tsx`** (~220 lines) — Conversation List
  - Deep search across message content using `search_chat_conversations` RPC
  - Debounced search input (400ms)
  - Filter by sentiment and resolution status
  - Shows: mood icon, customer name/email, summary, message count, category, status, date
  - Match snippet preview when searching (shows which message matched)
  - Pagination

  **`app/admin/support/conversations/[id]/page.tsx`** (~285 lines) — Conversation Detail
  - Full chat transcript with `MarkdownMessage` rendering
  - Customer info sidebar
  - Conversation metadata (messages, category, intent, AI handled, page context, timestamps)
  - AI memory management (view, add, delete memory notes)
  - Mark as resolved button
  - Create ticket from conversation button
  - Raw metadata view

  **`app/admin/support/tickets/page.tsx`** (~250 lines) — Tickets List
  - Status tabs (All, Open, In Progress, Waiting, Resolved)
  - Priority filter, search
  - Create new ticket modal
  - Shows: ticket number, subject, customer, priority, status, assignee, date

  **`app/admin/support/tickets/[id]/page.tsx`** (~285 lines) — Ticket Detail
  - Ticket info and controls (status, priority, assignee dropdowns)
  - Threaded message view (customer, agent, system, AI messages with different colors)
  - Reply form with internal note toggle
  - Customer info sidebar
  - Linked conversation preview (if created from chat)
  - Resolution panel

  **`app/admin/support/knowledge-base/page.tsx`** (~210 lines) — Knowledge Base
  - Article list with search and category filter
  - Create/edit article modal (title, content, category, tags)
  - Publish/unpublish toggle
  - Delete articles
  - Shows: title, category, source, helpful stats, date

  **`app/admin/support/analytics/page.tsx`** (~210 lines) — Analytics Dashboard
  - KPI summary cards
  - Recharts charts: Sentiment distribution (PieChart), Customer satisfaction (BarChart), Conversation categories (PieChart), Ticket status (PieChart), Daily trends (LineChart)
  - Date range selector (7/14/30 days)

  ---

  ## PART 3: Integration Points

  ### 3A. Store Layout

  In `app/(store)/layout.tsx`, import ChatWidget dynamically:
  ```typescript
  const ChatWidget = dynamic(() => import('@/components/ChatWidget'), { ssr: false });
  ```

  Add `<ChatWidget />` inside the layout, after all other components (before closing `</div>`).

  ### 3B. Admin Layout

  Add the Support Hub menu item to the `menuItems` array in `app/admin/layout.tsx`.

  ---

  ## PART 4: Business-Specific Content

  ### Contact Information
  - **Business Name:** Store
  - **Tagline:** "Premium Quality Products For Less."
  - **Founder:** Founder (Snapchat/TikTok personality, travels to China to source products)
  - **Main Phone:** [PHONE]
  - **Manager (Manager):** [MANAGER_PHONE]
  - **Support:** [SUPPORT_PHONE]
  - **Email:** support@example.com
  - **Location:** Accra, Ghana
  - **Hours:** Mon-Sat, 8AM-8PM GMT

  ### Shipping
  - Standard: GH₵20 (2-5 days)
  - Express: GH₵40 next day (Accra & Kumasi only)
  - Store Pickup: FREE same day
  - Free shipping over GH₵300
  - Zones: Accra Metro (1-2 days), Greater Accra (2-3), Major Cities (3-4), Other (4-5)

  ### Returns
  - 30 days from delivery, unused, original packaging
  - Free return shipping for defective items
  - Refunds in 5-7 business days
  - Exchange option available

  ### Payment
  - Mobile Money: MTN, Vodafone, AirtelTigo via Moolre
  - Cash on Delivery: Accra only
  - Currency: GH₵ (Ghana Cedis)

  ### Website Pages (full site map for AI)
  - `/` — Homepage
  - `/shop` — All products
  - `/categories` — Browse categories
  - `/product/[slug]` — Product detail
  - `/cart` — Shopping cart
  - `/checkout` — Checkout flow
  - `/order-tracking` — Track orders
  - `/returns` — Return requests
  - `/account` — User account
  - `/wishlist` — Saved items
  - `/about` — Our story
  - `/contact` — Contact info
  - `/faqs` — FAQs
  - `/help` — Help center
  - `/blog` — Blog articles
  - `/shipping` — Shipping policy
  - `/privacy` — Privacy policy
  - `/terms` — Terms & conditions
  - `/support/ticket` — Create support ticket
  - `/auth/login` — Sign in
  - `/auth/signup` — Create account
  - `/auth/forgot-password` — Reset password

  ---

  ## PART 5: Key Implementation Details

  ### AI Conversation Flow Rules
  1. NEVER ask for information the customer already provided
  2. NEVER repeat the same question twice
  3. NEVER give generic "How can I help?" after the customer stated their need
  4. ALWAYS acknowledge provided information and proceed immediately
  5. ALWAYS be honest about limitations (can't reset passwords, modify orders, etc.)
  6. ALWAYS create a support ticket AND provide contact info when unable to help
  7. Maintain full context throughout the conversation

  ### Auto-Escalation
  When the AI cannot help:
  1. Automatically create a support ticket using `create_support_ticket`
  2. Share direct contact info: Phone [PHONE], WhatsApp, Manager [MANAGER_PHONE], email support@example.com
  3. Never leave the customer without a path forward

  ### Message Handling
  - Messages stored in `chat_conversations.messages` as raw jsonb arrays (NOT double-stringified)
  - The `upsert_chat_conversation` RPC handles the upsert
  - Parse messages safely: if `typeof messages === 'string'`, JSON.parse it (backward compat)

  ### Chat Widget Footer
  Display: `Powered by ` linked to `https://example.com`

  ---

  ## PART 6: File Checklist

  Create these files:
  - [ ] `lib/chat-tools.ts`
  - [ ] `lib/site-knowledge.ts`
  - [ ] `components/MarkdownMessage.tsx`
  - [ ] `components/ChatWidget.tsx`
  - [ ] `app/api/chat/route.ts`
  - [ ] `app/api/support/conversations/route.ts`
  - [ ] `app/api/support/tickets/route.ts`
  - [ ] `app/api/support/tickets/[id]/messages/route.ts`
  - [ ] `app/api/support/knowledge-base/route.ts`
  - [ ] `app/api/support/feedback/route.ts`
  - [ ] `app/api/support/analytics/route.ts`
  - [ ] `app/admin/support/page.tsx`
  - [ ] `app/admin/support/conversations/page.tsx`
  - [ ] `app/admin/support/conversations/[id]/page.tsx`
  - [ ] `app/admin/support/tickets/page.tsx`
  - [ ] `app/admin/support/tickets/[id]/page.tsx`
  - [ ] `app/admin/support/knowledge-base/page.tsx`
  - [ ] `app/admin/support/analytics/page.tsx`

  Modify these files:
  - [ ] `app/(store)/layout.tsx` — Add ChatWidget import and component
  - [ ] `app/admin/layout.tsx` — Add Support Hub menu item
  - [ ] `.env.local` — Add GROQ_API_KEY

  Database:
  - [ ] Apply all migrations (table alterations, new tables, indexes, RLS, RPC functions)
  - [ ] Seed knowledge base with website content
  - [ ] Grant EXECUTE on RPC functions to `authenticated` and `anon` roles

  ---

  *Total: ~5,000+ lines of code across 20 files, 7 new database tables, 7 RPC functions, 20 knowledge base articles.*
