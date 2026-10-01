-- Synthetic hosted fixture only. No production function replacement is authorized.
-- Clients can check their own roles; trusted SQL definer dependencies retain
-- the ability to inspect another account without trusting caller-supplied JWT roles.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF to_regclass('public.snap_hosted_fixture') IS NULL THEN
  RAISE EXCEPTION 'Synthetic hosted staging marker required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.snap_hosted_fixture
  WHERE singleton AND kind='snap_hosted_synthetic' AND schema_version=1 AND state='ready') THEN
  RAISE EXCEPTION 'Ready synthetic hosted staging marker required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.has_role(uuid,public.app_role)')
  AND p.prosecdef AND p.proargnames=ARRAY['u','r']::text[]
  AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
  AND p.prosrc=$baseline$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $baseline$) THEN
  RAISE EXCEPTION 'Expected synthetic role-check baseline changed'; END IF;
 IF to_regprocedure('snap_security.has_own_role_fixture_v1(uuid,public.app_role)') IS NOT NULL THEN
  RAISE EXCEPTION 'Self-scoped fixture helper already exists'; END IF;
END $guard$;

CREATE FUNCTION snap_security.has_own_role_fixture_v1(u uuid,r public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN auth.uid() IS NOT NULL AND u=auth.uid() THEN
  EXISTS(SELECT 1 FROM public.user_roles role_row WHERE role_row.user_id=u AND role_row.role=r)
 ELSE false END
$$;
REVOKE ALL ON FUNCTION snap_security.has_own_role_fixture_v1(uuid,public.app_role)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION snap_security.has_own_role_fixture_v1(uuid,public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(u uuid,r public.app_role)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 -- SECURITY INVOKER observes the actual SQL caller. Inside an already-authorized
 -- postgres-owned SECURITY DEFINER function, current_user is its trusted owner.
 -- Direct authenticated RPCs do not gain that identity from JWT metadata.
 IF current_user IN ('postgres','service_role') THEN
  RETURN EXISTS(SELECT 1 FROM public.user_roles role_row WHERE role_row.user_id=u AND role_row.role=r);
 END IF;
 RETURN snap_security.has_own_role_fixture_v1(u,r);
END;
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated;

DO $verify$ BEGIN
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.has_role(uuid,public.app_role)'::regprocedure)
  OR NOT has_function_privilege('authenticated','public.has_role(uuid,public.app_role)','EXECUTE')
  OR has_function_privilege('anon','public.has_role(uuid,public.app_role)','EXECUTE')
  OR has_function_privilege('service_role','public.has_role(uuid,public.app_role)','EXECUTE')
  OR has_function_privilege('anon','snap_security.has_own_role_fixture_v1(uuid,public.app_role)','EXECUTE')
  OR has_function_privilege('service_role','snap_security.has_own_role_fixture_v1(uuid,public.app_role)','EXECUTE') THEN
  RAISE EXCEPTION 'Role-check fixture privileges changed unexpectedly'; END IF;
END $verify$;
NOTIFY pgrst,'reload schema';
COMMIT;
