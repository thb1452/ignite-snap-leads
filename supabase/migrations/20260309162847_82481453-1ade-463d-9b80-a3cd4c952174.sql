
CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  page_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_activity_log_user_id ON public.user_activity_log (user_id);
CREATE INDEX idx_user_activity_log_created_at ON public.user_activity_log (created_at DESC);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own activity"
  ON public.user_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all activity"
  ON public.user_activity_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
