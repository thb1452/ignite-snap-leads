-- Drop broken policies that reference auth.users directly
DROP POLICY IF EXISTS foia_invites_select ON public.foia_invites;
DROP POLICY IF EXISTS foia_invites_update ON public.foia_invites;
DROP POLICY IF EXISTS foia_invites_insert ON public.foia_invites;

-- Create a helper function to get current user email without direct auth.users access
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Recreate policies using the security definer function
CREATE POLICY foia_invites_select ON public.foia_invites
  FOR SELECT TO authenticated
  USING (is_foia_admin() OR email = current_user_email());

CREATE POLICY foia_invites_insert ON public.foia_invites
  FOR INSERT TO authenticated
  WITH CHECK (is_foia_admin());

CREATE POLICY foia_invites_update ON public.foia_invites
  FOR UPDATE TO authenticated
  USING (is_foia_admin() OR email = current_user_email());

-- Add DELETE policy for admins
CREATE POLICY foia_invites_delete ON public.foia_invites
  FOR DELETE TO authenticated
  USING (is_foia_admin());