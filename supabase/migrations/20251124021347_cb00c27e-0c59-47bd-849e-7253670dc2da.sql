-- Create geocoding jobs table
CREATE TABLE IF NOT EXISTS public.geocoding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, running, completed, failed
  total_properties INT NOT NULL DEFAULT 0,
  geocoded_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.geocoding_jobs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own geocoding jobs"
  ON public.geocoding_jobs FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own geocoding jobs"
  ON public.geocoding_jobs FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Service role can update geocoding jobs"
  ON public.geocoding_jobs FOR UPDATE
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.geocoding_jobs;