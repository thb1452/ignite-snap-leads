
CREATE TABLE public.marketing_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  name TEXT,
  company TEXT,
  phone TEXT,
  market TEXT,
  source TEXT,
  status TEXT DEFAULT 'not_contacted',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  contacted_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  revenue DECIMAL(10,2),
  campaign_id TEXT,
  persona TEXT,
  last_engagement TIMESTAMP WITH TIME ZONE,
  engagement_score INTEGER,
  next_follow_up TIMESTAMP WITH TIME ZONE,
  tags TEXT[],
  custom_fields JSONB
);

-- Indexes for performance
CREATE INDEX idx_marketing_leads_email ON public.marketing_leads(email);
CREATE INDEX idx_marketing_leads_status ON public.marketing_leads(status);
CREATE INDEX idx_marketing_leads_created_at ON public.marketing_leads(created_at);

-- Enable RLS
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage marketing_leads"
  ON public.marketing_leads
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
