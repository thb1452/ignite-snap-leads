-- Allow anonymous/unauthenticated read on violations for the landing page counter & feed
CREATE POLICY "anon_read_violations"
  ON public.violations
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous/unauthenticated read on properties for the landing page feed (address, city, state only accessed via join)
CREATE POLICY "anon_read_properties"
  ON public.properties
  FOR SELECT
  TO anon
  USING (true);