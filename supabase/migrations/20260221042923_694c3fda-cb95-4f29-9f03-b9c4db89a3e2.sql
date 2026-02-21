
-- Fix: Admin can see all user_roles (needed for Active Users count)
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix: Admin can see all upload_jobs (needed for Failed Uploads, Uploads 24h counts)
CREATE POLICY "Admins can view all upload jobs"
ON public.upload_jobs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix: Admin can see all geocoding_jobs (needed for Geocoding Status)
CREATE POLICY "Admins can view all geocoding jobs"
ON public.geocoding_jobs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
