-- Drop existing restrictive SELECT policy and recreate as broader
DROP POLICY IF EXISTS "Admins can read system_logs" ON public.system_logs;

CREATE POLICY "Admins can read system_logs"
  ON public.system_logs
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
