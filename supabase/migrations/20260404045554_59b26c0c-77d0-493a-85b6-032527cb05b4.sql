-- Temporarily disable RLS on marketing_leads for testing
ALTER TABLE public.marketing_leads DISABLE ROW LEVEL SECURITY;

-- Ensure grants are in place
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_leads TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';