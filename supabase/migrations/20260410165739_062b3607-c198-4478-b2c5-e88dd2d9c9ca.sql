ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS phone_type text,
  ADD COLUMN IF NOT EXISTS trace_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS trace_source text;