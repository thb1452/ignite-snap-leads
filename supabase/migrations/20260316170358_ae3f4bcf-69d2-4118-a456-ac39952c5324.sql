-- Export logs table for admin dashboard tracking
CREATE TABLE IF NOT EXISTS public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state_filter TEXT,
  city_filter TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  filters JSONB DEFAULT '{}'::jsonb
);

-- Index for fast user lookups and time-based queries
CREATE INDEX idx_export_logs_user_id ON public.export_logs(user_id);
CREATE INDEX idx_export_logs_created_at ON public.export_logs(created_at DESC);

-- RLS: users can insert their own logs, admins can read all
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own export logs"
  ON public.export_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own export logs"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all export logs"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );