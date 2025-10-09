-- Enable realtime for jobs and events tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.skiptrace_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- Consent tracking table for compliance
CREATE TABLE IF NOT EXISTS skiptrace_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE skiptrace_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consent log"
ON skiptrace_consent_log
FOR SELECT
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_consent_user ON skiptrace_consent_log(user_id, consented_at);