-- =====================================================
-- COMPREHENSIVE RLS HARDENING MIGRATION
-- =====================================================

-- 1. PROFILES TABLE: Ensure users can only see/modify their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 2. USER_PROFILES TABLE: Add INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

CREATE POLICY "Users can insert own profile" 
ON public.user_profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 3. ORGANIZATIONS: Add INSERT policy (only allow via system/trigger)
DROP POLICY IF EXISTS "System can insert organizations" ON public.organizations;

CREATE POLICY "System can insert organizations" 
ON public.organizations FOR INSERT 
WITH CHECK (false); -- Organizations created via triggers only

-- 4. USER_SUBSCRIPTIONS: Add write protection (service_role only)
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.user_subscriptions;

CREATE POLICY "Service role manages subscriptions" 
ON public.user_subscriptions FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 5. SUBSCRIPTION_USAGE: Protect from user manipulation
DROP POLICY IF EXISTS "Users can view own usage" ON public.subscription_usage;
DROP POLICY IF EXISTS "Service role manages usage" ON public.subscription_usage;

CREATE POLICY "Users can view own usage" 
ON public.subscription_usage FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service role manages usage" 
ON public.subscription_usage FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 6. EMAIL_ANALYTICS: Add UPDATE/DELETE protection
DROP POLICY IF EXISTS "Users view own analytics" ON public.email_analytics;
DROP POLICY IF EXISTS "Users insert own analytics" ON public.email_analytics;

CREATE POLICY "Users view own analytics" 
ON public.email_analytics FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own analytics" 
ON public.email_analytics FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- No UPDATE/DELETE for users - analytics are immutable

-- 7. SKIPTRACE_CONSENT_LOG: Add INSERT policy for compliance
DROP POLICY IF EXISTS "Users can insert own consent" ON public.skiptrace_consent_log;

CREATE POLICY "Users can insert own consent" 
ON public.skiptrace_consent_log FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 8. CREDIT_LEDGER: Ensure proper read-only access for users
DROP POLICY IF EXISTS "Users view own credit history" ON public.credit_ledger;

CREATE POLICY "Users view own credit history" 
ON public.credit_ledger FOR SELECT 
USING (auth.uid() = user_id);

-- 9. USER_INVITATIONS: Already has admin-only policies, just verify
-- (no changes needed - admin check is working)