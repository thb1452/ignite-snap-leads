
CREATE POLICY "Authenticated users can view queued campaign_leads"
  ON public.campaign_leads FOR SELECT
  TO authenticated
  USING (status = 'queued');
