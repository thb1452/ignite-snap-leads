
CREATE TABLE public.list_enrichment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.list_enrichment_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert waitlist" ON public.list_enrichment_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view waitlist" ON public.list_enrichment_waitlist
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
