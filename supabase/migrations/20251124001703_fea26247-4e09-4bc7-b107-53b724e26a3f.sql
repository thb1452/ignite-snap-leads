-- Create jurisdictions table
CREATE TABLE IF NOT EXISTS public.jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  county TEXT,
  state TEXT NOT NULL,
  default_zip_range TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on jurisdictions
ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;

-- Policies for jurisdictions
CREATE POLICY "Users can view all jurisdictions"
  ON public.jurisdictions FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage jurisdictions"
  ON public.jurisdictions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add jurisdiction_id to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS jurisdiction_id UUID REFERENCES public.jurisdictions(id);

-- Add jurisdiction_id to upload_jobs
ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS jurisdiction_id UUID REFERENCES public.jurisdictions(id);

-- Add jurisdiction_id to upload_staging
ALTER TABLE public.upload_staging
  ADD COLUMN IF NOT EXISTS jurisdiction_id UUID REFERENCES public.jurisdictions(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_jurisdiction_id ON public.properties(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_jurisdiction_id ON public.upload_jobs(jurisdiction_id);

-- Insert default jurisdiction
INSERT INTO public.jurisdictions (name, city, county, state, default_zip_range)
VALUES ('Sierra Vista - Code Cases', 'Sierra Vista', 'Cochise', 'AZ', '85635-85650')
ON CONFLICT DO NOTHING;