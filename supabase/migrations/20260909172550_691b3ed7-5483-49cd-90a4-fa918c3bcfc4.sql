SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER POLICY targets_select ON public.targets TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
ALTER POLICY press_accounts_select ON public.press_accounts TO authenticated
USING ((SELECT public.has_role(auth.uid(),'admin'::public.app_role)));
REVOKE ALL PRIVILEGES ON TABLE public.targets, public.press_accounts FROM PUBLIC, anon;