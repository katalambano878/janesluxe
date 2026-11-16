-- Supplier costs, live shoppers, daily visit counts, and staff expenses for admin tools.

CREATE TABLE IF NOT EXISTS public.product_costs (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_name text,
  cost_price numeric NOT NULL,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_sessions (
  visitor_id text PRIMARY KEY,
  page text NOT NULL,
  stage text NOT NULL,
  cart_items integer NOT NULL DEFAULT 0,
  cart_value numeric NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_visits (
  id bigserial PRIMARY KEY,
  visitor_id text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_visits_day_idx ON public.site_visits (visited_at, visitor_id);

CREATE TABLE IF NOT EXISTS public.staff_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  staff_name text,
  staff_email text,
  amount numeric NOT NULL CHECK (amount >= 0),
  description text NOT NULL,
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'janesluxe') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_costs, public.live_sessions, public.site_visits, public.staff_expenses TO janesluxe';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.site_visits_id_seq TO janesluxe';
  END IF;
END $$;