SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER POLICY foia_profiles_insert ON public.foia_profiles TO authenticated
WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY foia_profiles_update ON public.foia_profiles TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
REVOKE ALL PRIVILEGES ON TABLE public.foia_profiles FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.complete_foia_signup(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;