-- Grant REST API access to marketing_leads for anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_leads TO authenticated;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';