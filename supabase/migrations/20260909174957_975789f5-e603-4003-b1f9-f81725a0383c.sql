SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER POLICY "Users can insert their own profile" ON public.profiles TO authenticated
WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Users can update their own profile" ON public.profiles TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Users can insert own profile" ON public.user_profiles TO authenticated
WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Users can update own profile" ON public.user_profiles TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
REVOKE ALL PRIVILEGES ON TABLE public.profiles,public.user_profiles FROM PUBLIC,anon;