-- Fix: Update waitlist RLS policies to use has_role() function for consistency
-- The original policies incorrectly checked user_profiles.role instead of using
-- the user_roles table and has_role() function used everywhere else

-- Drop the old policies
DROP POLICY IF EXISTS "Admins can view waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Admins can update waitlist" ON public.waitlist;

-- Create corrected SELECT policy using has_role()
CREATE POLICY "Admins can view waitlist"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create corrected UPDATE policy using has_role()
CREATE POLICY "Admins can update waitlist"
  ON public.waitlist
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
