CREATE TABLE public.owner_dashboard_access (
  email text PRIMARY KEY CHECK (email = lower(email)),
  enabled boolean NOT NULL DEFAULT true,
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.owner_dashboard_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.owner_dashboard_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.owner_dashboard_access TO service_role;
COMMENT ON TABLE public.owner_dashboard_access IS 'Owner-approved verified email access for the read-only operations endpoint; managed only by database administrators.';
