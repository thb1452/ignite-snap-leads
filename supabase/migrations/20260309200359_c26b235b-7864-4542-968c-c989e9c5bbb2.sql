-- Create a security-definer function so admin users can reliably fetch system logs
CREATE OR REPLACE FUNCTION public.get_system_logs_24h()
RETURNS SETOF system_logs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM system_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
    AND has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 500;
$$;

-- Also create one for error_logs
CREATE OR REPLACE FUNCTION public.get_error_logs_recent()
RETURNS SETOF error_logs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM error_logs
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 100;
$$;

-- And webhook_errors
CREATE OR REPLACE FUNCTION public.get_webhook_errors_recent()
RETURNS SETOF webhook_errors
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM webhook_errors
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 100;
$$;