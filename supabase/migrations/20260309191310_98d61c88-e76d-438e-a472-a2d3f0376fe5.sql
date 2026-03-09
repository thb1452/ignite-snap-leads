
-- System logs table for general monitoring
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'frontend',
  message text NOT NULL,
  metadata jsonb DEFAULT NULL,
  user_id uuid DEFAULT NULL
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system_logs" ON public.system_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can insert system_logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX idx_system_logs_type ON public.system_logs (type);

-- Webhook errors table
CREATE TABLE public.webhook_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  webhook_type text NOT NULL DEFAULT 'stripe',
  event_type text,
  event_id text,
  error_message text NOT NULL,
  payload jsonb DEFAULT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz DEFAULT NULL
);

ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage webhook_errors" ON public.webhook_errors
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role needs insert access for edge functions
CREATE POLICY "Service role can insert webhook_errors" ON public.webhook_errors
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE INDEX idx_webhook_errors_created_at ON public.webhook_errors (created_at DESC);
CREATE INDEX idx_webhook_errors_resolved ON public.webhook_errors (resolved);
