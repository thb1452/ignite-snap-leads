SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER POLICY "Authenticated users can delete properties" ON public.properties TO authenticated USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Authenticated users can insert properties" ON public.properties TO authenticated WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Authenticated users can update investor brief" ON public.properties TO authenticated USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role))) WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY properties_select_auth ON public.properties TO authenticated USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Authenticated users can delete violations" ON public.violations TO authenticated USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Authenticated users can insert violations" ON public.violations TO authenticated WITH CHECK ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY violations_select_auth ON public.violations TO authenticated USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));