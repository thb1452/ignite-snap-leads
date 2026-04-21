-- Add property enrichment columns
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS beds INTEGER,
  ADD COLUMN IF NOT EXISTS baths NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS sqft INTEGER,
  ADD COLUMN IF NOT EXISTS year_built INTEGER,
  ADD COLUMN IF NOT EXISTS lot_size_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS enrichment_source TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Sanity constraints
ALTER TABLE public.properties
  ADD CONSTRAINT properties_beds_check CHECK (beds IS NULL OR (beds >= 0 AND beds <= 50)),
  ADD CONSTRAINT properties_baths_check CHECK (baths IS NULL OR (baths >= 0 AND baths <= 50)),
  ADD CONSTRAINT properties_sqft_check CHECK (sqft IS NULL OR (sqft >= 0 AND sqft <= 1000000)),
  ADD CONSTRAINT properties_year_built_check CHECK (year_built IS NULL OR (year_built >= 1700 AND year_built <= EXTRACT(YEAR FROM now())::int + 1)),
  ADD CONSTRAINT properties_lot_size_check CHECK (lot_size_sqft IS NULL OR (lot_size_sqft >= 0 AND lot_size_sqft <= 100000000));

-- Index for filtering on enrichment status (helps admin dashboards)
CREATE INDEX IF NOT EXISTS idx_properties_enriched_at ON public.properties(enriched_at) WHERE enriched_at IS NOT NULL;

-- Job tracking table for bulk enrichment uploads
CREATE TABLE IF NOT EXISTS public.property_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  unmatched_rows INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  unmatched_csv_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.property_enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage enrichment jobs"
  ON public.property_enrichment_jobs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_enrichment_jobs_user ON public.property_enrichment_jobs(user_id, created_at DESC);
CREATE INDEX idx_enrichment_jobs_status ON public.property_enrichment_jobs(status) WHERE status IN ('pending', 'processing');