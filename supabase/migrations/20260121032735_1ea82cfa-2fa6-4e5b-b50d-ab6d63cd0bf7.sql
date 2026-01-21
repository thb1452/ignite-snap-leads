-- =====================================================
-- RESTRICT CORE BUSINESS DATA TO AUTHENTICATED USERS
-- =====================================================

-- 1. PROPERTIES: Restrict to authenticated users only
DROP POLICY IF EXISTS "properties_select_auth" ON public.properties;

CREATE POLICY "properties_select_auth" 
ON public.properties FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 2. CLEAN_LEADS: Restrict to authenticated users only
DROP POLICY IF EXISTS "Users can view clean_leads" ON public.clean_leads;

CREATE POLICY "Authenticated users can view clean_leads" 
ON public.clean_leads FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. VIOLATIONS: Restrict to authenticated users only
DROP POLICY IF EXISTS "violations_select_auth" ON public.violations;

CREATE POLICY "violations_select_auth" 
ON public.violations FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 4. FOIA_TEMPLATES: Restrict to authenticated users only
DROP POLICY IF EXISTS "Everyone can view templates" ON public.foia_templates;

CREATE POLICY "Authenticated users can view templates" 
ON public.foia_templates FOR SELECT 
USING (auth.uid() IS NOT NULL);