
CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  error_message text NOT NULL,
  error_stack text,
  component_stack text,
  url text,
  user_agent text,
  severity text NOT NULL DEFAULT 'error',
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  metadata jsonb
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view/manage all error logs
CREATE POLICY "Admins can manage error_logs"
  ON public.error_logs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Any authenticated user can insert (log their own errors)
CREATE POLICY "Anyone can insert error_logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for admin dashboard queries
CREATE INDEX idx_error_logs_created_at ON public.error_logs (created_at DESC);
CREATE INDEX idx_error_logs_resolved ON public.error_logs (resolved, created_at DESC);
