
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Campaign leads table
CREATE TABLE public.campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text,
  snap_score integer,
  enforcement_type text,
  owner_name text,
  phone text,
  status text NOT NULL DEFAULT 'queued',
  assigned_to uuid,
  notes text,
  contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_leads_status ON public.campaign_leads(status);
CREATE INDEX idx_campaign_leads_assigned ON public.campaign_leads(assigned_to);
CREATE INDEX idx_campaign_leads_snap_score ON public.campaign_leads(snap_score DESC);
CREATE INDEX idx_campaign_leads_property ON public.campaign_leads(property_id);

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to campaign_leads"
  ON public.campaign_leads FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view assigned campaign_leads"
  ON public.campaign_leads FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "Users update assigned campaign_leads"
  ON public.campaign_leads FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE TRIGGER update_campaign_leads_updated_at
  BEFORE UPDATE ON public.campaign_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
