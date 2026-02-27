-- Fix recursive RLS policies on foia_profiles and related FOIA tables.
--
-- Root cause: the original "foia_profiles_select" policy contained an EXISTS
-- subquery that SELECTs from foia_profiles itself:
--
--   USING (
--     auth.uid() = id
--     OR EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
--   );
--
-- When PostgreSQL evaluates the RLS policy for a SELECT on foia_profiles, it
-- runs the subquery — which triggers the same policy again, creating infinite
-- recursion.  This manifests as a query that hangs until the client-side
-- 12-second timeout fires ("Profile lookup timed out").
--
-- Fix: introduce a SECURITY DEFINER helper function.  SECURITY DEFINER
-- functions execute as the function owner (postgres) and therefore bypass RLS,
-- breaking the recursive cycle.  All policies that previously embedded an
-- inline subquery against foia_profiles are updated to call this function.

-- ── 1. Helper: check if the current user is a FOIA admin ──────────────────
CREATE OR REPLACE FUNCTION public.is_foia_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.foia_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_foia_admin() TO authenticated;

-- ── 2. foia_profiles — drop and recreate all policies ────────────────────
-- Drop both naming conventions (the original migration and any variant).
DROP POLICY IF EXISTS "foia_profiles_select"           ON public.foia_profiles;
DROP POLICY IF EXISTS "foia_profiles_insert"           ON public.foia_profiles;
DROP POLICY IF EXISTS "foia_profiles_update"           ON public.foia_profiles;
DROP POLICY IF EXISTS "Users can view own foia_profile"  ON public.foia_profiles;
DROP POLICY IF EXISTS "Admins can view all foia_profiles" ON public.foia_profiles;
DROP POLICY IF EXISTS "Admins can update foia_profiles"   ON public.foia_profiles;
DROP POLICY IF EXISTS "Users can update own foia_profile" ON public.foia_profiles;

CREATE POLICY "foia_profiles_select" ON public.foia_profiles
  FOR SELECT USING (auth.uid() = id OR is_foia_admin());

CREATE POLICY "foia_profiles_insert" ON public.foia_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "foia_profiles_update" ON public.foia_profiles
  FOR UPDATE USING (auth.uid() = id OR is_foia_admin());

-- ── 3. targets ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "targets_insert" ON public.targets;
DROP POLICY IF EXISTS "targets_update" ON public.targets;

CREATE POLICY "targets_insert" ON public.targets
  FOR INSERT WITH CHECK (is_foia_admin());

CREATE POLICY "targets_update" ON public.targets
  FOR UPDATE USING (is_foia_admin());

-- ── 4. press_accounts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "press_accounts_insert" ON public.press_accounts;
DROP POLICY IF EXISTS "press_accounts_update" ON public.press_accounts;
DROP POLICY IF EXISTS "press_accounts_delete" ON public.press_accounts;
DROP POLICY IF EXISTS "Admins can manage foia_invites"   ON public.press_accounts;

CREATE POLICY "press_accounts_insert" ON public.press_accounts
  FOR INSERT WITH CHECK (is_foia_admin());

CREATE POLICY "press_accounts_update" ON public.press_accounts
  FOR UPDATE USING (is_foia_admin());

CREATE POLICY "press_accounts_delete" ON public.press_accounts
  FOR DELETE USING (is_foia_admin());

-- ── 5. foia_assignments ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "foia_assignments_select" ON public.foia_assignments;
DROP POLICY IF EXISTS "foia_assignments_insert" ON public.foia_assignments;
DROP POLICY IF EXISTS "foia_assignments_delete" ON public.foia_assignments;

CREATE POLICY "foia_assignments_select" ON public.foia_assignments
  FOR SELECT USING (va_id = auth.uid() OR is_foia_admin());

CREATE POLICY "foia_assignments_insert" ON public.foia_assignments
  FOR INSERT WITH CHECK (is_foia_admin());

CREATE POLICY "foia_assignments_delete" ON public.foia_assignments
  FOR DELETE USING (is_foia_admin());

-- ── 6. press_rotation ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "press_rotation_insert" ON public.press_rotation;
DROP POLICY IF EXISTS "press_rotation_update" ON public.press_rotation;
DROP POLICY IF EXISTS "press_rotation_delete" ON public.press_rotation;

CREATE POLICY "press_rotation_insert" ON public.press_rotation
  FOR INSERT WITH CHECK (is_foia_admin());

CREATE POLICY "press_rotation_update" ON public.press_rotation
  FOR UPDATE USING (is_foia_admin());

CREATE POLICY "press_rotation_delete" ON public.press_rotation
  FOR DELETE USING (is_foia_admin());

-- ── 7. foia_requests ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "foia_requests_select" ON public.foia_requests;
DROP POLICY IF EXISTS "foia_requests_update" ON public.foia_requests;

CREATE POLICY "foia_requests_select" ON public.foia_requests
  FOR SELECT USING (va_id = auth.uid() OR is_foia_admin());

CREATE POLICY "foia_requests_update" ON public.foia_requests
  FOR UPDATE USING (va_id = auth.uid() OR is_foia_admin());

-- ── 8. foia_invites ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "foia_invites_select" ON public.foia_invites;
DROP POLICY IF EXISTS "foia_invites_insert" ON public.foia_invites;
DROP POLICY IF EXISTS "foia_invites_update" ON public.foia_invites;
DROP POLICY IF EXISTS "Admins can manage foia_invites" ON public.foia_invites;

CREATE POLICY "foia_invites_select" ON public.foia_invites
  FOR SELECT USING (
    is_foia_admin()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "foia_invites_insert" ON public.foia_invites
  FOR INSERT WITH CHECK (is_foia_admin());

CREATE POLICY "foia_invites_update" ON public.foia_invites
  FOR UPDATE USING (
    is_foia_admin()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
