CREATE TABLE public.mcp_proxy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  operation text,
  caller_ip text,
  status_code integer,
  success boolean,
  error text,
  duration_ms integer,
  request_bytes integer
);

CREATE INDEX idx_mcp_proxy_log_ts ON public.mcp_proxy_log (ts DESC);
CREATE INDEX idx_mcp_proxy_log_op_ts ON public.mcp_proxy_log (operation, ts DESC);

ALTER TABLE public.mcp_proxy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view mcp proxy logs"
ON public.mcp_proxy_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));