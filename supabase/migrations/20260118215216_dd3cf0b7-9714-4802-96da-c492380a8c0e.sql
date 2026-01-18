-- =========================================================
-- SECURITY & RELIABILITY FIXES - Part 2: RLS Policies
-- =========================================================

-- 2. Enable RLS on events table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop and recreate events policies
DROP POLICY IF EXISTS "owner can read job events" ON public.events;

CREATE POLICY "Users can view their own events"
ON public.events FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own events"
ON public.events FOR INSERT
WITH CHECK (user_id = auth.uid());

-- 3. Fix violations INSERT/DELETE policies (too permissive)
DROP POLICY IF EXISTS "Users can delete violations" ON public.violations;
DROP POLICY IF EXISTS "Users can insert violations" ON public.violations;

CREATE POLICY "Authenticated users can insert violations"
ON public.violations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete violations"
ON public.violations FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Fix properties DELETE policy (was USING (true))
DROP POLICY IF EXISTS "Users can delete properties" ON public.properties;
CREATE POLICY "Authenticated users can delete properties"
ON public.properties FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Fix properties INSERT policy (was WITH CHECK (true))
DROP POLICY IF EXISTS "Users can insert properties" ON public.properties;
CREATE POLICY "Authenticated users can insert properties"
ON public.properties FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix geocoding_jobs UPDATE policy (user_id is TEXT, needs cast)
DROP POLICY IF EXISTS "Service role can update geocoding jobs" ON public.geocoding_jobs;
CREATE POLICY "Users can update their geocoding jobs"
ON public.geocoding_jobs FOR UPDATE
USING (user_id = auth.uid()::text);

-- Fix email_analytics INSERT policy
DROP POLICY IF EXISTS "Service role can insert email analytics" ON public.email_analytics;
CREATE POLICY "Users can insert their email analytics"
ON public.email_analytics FOR INSERT
WITH CHECK (user_id = auth.uid());