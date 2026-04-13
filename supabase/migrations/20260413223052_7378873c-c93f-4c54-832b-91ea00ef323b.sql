CREATE TABLE IF NOT EXISTS public.pipeline_progress (
  run_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  state TEXT,
  county TEXT,
  city TEXT,
  last_offset INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.pipeline_progress
  FOR ALL TO service_role USING (true) WITH CHECK (true);