-- Sage v1 — Buyer's list infrastructure (backend-only)

CREATE TABLE IF NOT EXISTS public.cash_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL,
  raw_names text[] NOT NULL,
  buyer_type text NOT NULL CHECK (buyer_type IN ('llc','trust','individual','institutional','unknown')),
  total_purchases int NOT NULL DEFAULT 0,
  total_spend_usd numeric(14,2) NOT NULL DEFAULT 0,
  avg_price_usd numeric(12,2),
  first_buy_date date,
  last_buy_date date,
  primary_county_fips text NOT NULL DEFAULT '18097',
  active_zips text[],
  inbiz_resolution_status text DEFAULT 'pending' CHECK (inbiz_resolution_status IN
    ('pending','resolved','not_found','custodian_skip','manual_review','error')),
  inbiz_resolved_at timestamptz,
  registered_agent text,
  member_managers jsonb DEFAULT '[]'::jsonb,
  principal_address text,
  skip_traced_at timestamptz,
  phones jsonb DEFAULT '[]'::jsonb,
  emails jsonb DEFAULT '[]'::jsonb,
  buyer_score numeric(5,2),
  buyer_tier text CHECK (buyer_tier IN ('a','b','c','cold')),
  is_out_of_state boolean DEFAULT false,
  is_institutional boolean DEFAULT false,
  manual_review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, primary_county_fips)
);

CREATE INDEX IF NOT EXISTS cash_buyers_tier_lastbuy_idx
  ON public.cash_buyers(buyer_tier, last_buy_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS cash_buyers_purchases_idx
  ON public.cash_buyers(total_purchases DESC);
CREATE INDEX IF NOT EXISTS cash_buyers_pending_idx
  ON public.cash_buyers(inbiz_resolution_status)
  WHERE inbiz_resolution_status = 'pending';
CREATE INDEX IF NOT EXISTS cash_buyers_zips_idx
  ON public.cash_buyers USING gin(active_zips);

CREATE TABLE IF NOT EXISTS public.buyer_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.cash_buyers(id) ON DELETE CASCADE,
  parcel_id text,
  property_address text NOT NULL,
  zip text,
  county_fips text NOT NULL DEFAULT '18097',
  sale_date date NOT NULL,
  sale_price numeric(12,2),
  deed_type text,
  raw_grantee_name text NOT NULL,
  source text DEFAULT 'marion_county_recorder',
  source_record_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyer_purchases_buyer_date_idx
  ON public.buyer_purchases(buyer_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS buyer_purchases_zip_date_idx
  ON public.buyer_purchases(zip, sale_date DESC);
CREATE INDEX IF NOT EXISTS buyer_purchases_parcel_idx
  ON public.buyer_purchases(parcel_id);

GRANT ALL ON public.cash_buyers TO service_role;
GRANT ALL ON public.buyer_purchases TO service_role;

ALTER TABLE public.cash_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backend_only_deny_anon" ON public.cash_buyers;
DROP POLICY IF EXISTS "backend_only_deny_authenticated" ON public.cash_buyers;
DROP POLICY IF EXISTS "backend_only_deny_anon" ON public.buyer_purchases;
DROP POLICY IF EXISTS "backend_only_deny_authenticated" ON public.buyer_purchases;

CREATE POLICY "backend_only_deny_anon" ON public.cash_buyers
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "backend_only_deny_authenticated" ON public.cash_buyers
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "backend_only_deny_anon" ON public.buyer_purchases
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "backend_only_deny_authenticated" ON public.buyer_purchases
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP TRIGGER IF EXISTS update_cash_buyers_updated_at ON public.cash_buyers;
CREATE TRIGGER update_cash_buyers_updated_at
  BEFORE UPDATE ON public.cash_buyers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.cash_buyers IS 'Sage v1: backend-only. Service role + direct Postgres only. Frontend access denied via RLS.';
COMMENT ON TABLE public.buyer_purchases IS 'Sage v1: backend-only. Service role + direct Postgres only. Frontend access denied via RLS.';

NOTIFY pgrst, 'reload schema';