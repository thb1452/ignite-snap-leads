-- Fail before any application DDL on a populated or non-managed target.
DO $preflight$ BEGIN
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL
  OR to_regprocedure('auth.jwt()') IS NULL OR to_regclass('auth.identities') IS NULL THEN
  RAISE EXCEPTION 'Managed Supabase Auth is required'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'Blank Auth required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','snap_security','snap_relaunch','snap_billing') AND c.relkind IN ('r','p','v','m','S')) THEN
  RAISE EXCEPTION 'Blank application schemas required'; END IF;
 IF to_regnamespace('snap_security') IS NOT NULL OR to_regnamespace('snap_relaunch') IS NOT NULL
  OR to_regnamespace('snap_billing') IS NOT NULL THEN RAISE EXCEPTION 'Existing application namespace'; END IF;
END $preflight$;

CREATE TABLE public.snap_hosted_fixture (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 kind text NOT NULL CHECK(kind='snap_hosted_synthetic'),
 schema_version integer NOT NULL CHECK(schema_version=1),
 fixture_nonce uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL CHECK(state IN ('baseline_only','ready')),
 managed_auth_fingerprint text NOT NULL,
 realtime_fingerprint text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.snap_hosted_fixture ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.snap_hosted_fixture FROM PUBLIC,anon,authenticated,service_role;

-- Definitions only: never copy Auth users, identities, sessions or secrets.
INSERT INTO public.snap_hosted_fixture(kind,schema_version,state,managed_auth_fingerprint,realtime_fingerprint)
SELECT 'snap_hosted_synthetic',1,'baseline_only',
 (SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY kind,name)::text) FROM (
  SELECT 'function' kind,p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.prokind='f'
  UNION ALL SELECT 'column',a.attname,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='auth.users'::regclass AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'constraint',conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='auth.users'::regclass
 ) s),
 (SELECT md5(jsonb_build_object('publications',
  (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY pubname),'[]') FROM pg_publication p),
  'tables',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY pubname,schemaname,tablename),'[]') FROM pg_publication_tables t))::text));
