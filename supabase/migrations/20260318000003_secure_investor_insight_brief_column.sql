-- Column-level security for investor_insight_brief
--
-- PostgreSQL RLS is row-level only — it cannot scope policies to specific columns.
-- The existing UPDATE policy ("Authenticated users can update properties") allows
-- authenticated users to update any column with USING (true) WITH CHECK (true).
--
-- To restrict *who* can write the investor_insight_brief column, we use column-level
-- GRANT privileges. This ensures:
--   1. The 'anon' role CANNOT update investor_insight_brief (public API without login)
--   2. The 'authenticated' role CAN update investor_insight_brief (logged-in users caching briefs)
--   3. The 'service_role' retains full access (edge functions writing via service key)

-- Revoke UPDATE on investor_insight_brief from the anon role
-- (anon should never be able to write AI briefs)
REVOKE UPDATE (investor_insight_brief) ON public.properties FROM anon;

-- Explicitly grant UPDATE on investor_insight_brief to authenticated role
-- (needed for client-side cache writes via PropertyDetailPanel)
GRANT UPDATE (investor_insight_brief) ON public.properties TO authenticated;

-- Add a comment documenting the security model
COMMENT ON COLUMN public.properties.investor_insight_brief IS
  'Cached AI investor brief JSON. Column-level GRANT: anon=DENIED, authenticated=UPDATE, service_role=FULL. RLS UPDATE policy: "Authenticated users can update properties" (USING true, WITH CHECK true).';
