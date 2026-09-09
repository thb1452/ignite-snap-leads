SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER POLICY parcel_attributes_authenticated_select ON public.parcel_attributes TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY "Authenticated users can view distress events" ON public.distress_events TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY authenticated_read_cooldowns ON public.credential_target_cooldown TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY press_rotation_select ON public.press_rotation TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
REVOKE ALL PRIVILEGES ON TABLE public.parcel_attributes,public.distress_events,public.credential_target_cooldown,public.press_rotation FROM PUBLIC,anon;