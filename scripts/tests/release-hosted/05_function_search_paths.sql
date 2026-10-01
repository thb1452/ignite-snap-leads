-- Additive synthetic-staging maintenance only. Do not replay 00/04 or candidates.
-- Changes exactly two search_path settings; no bodies, grants, rows or holds.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF to_regclass('public.snap_hosted_fixture') IS NULL THEN
  RAISE EXCEPTION 'Synthetic hosted staging marker required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.snap_hosted_fixture
  WHERE singleton AND kind='snap_hosted_synthetic' AND schema_version=1 AND state='ready') THEN
  RAISE EXCEPTION 'Ready synthetic hosted staging marker required'; END IF;
 IF to_regprocedure('public.tg_set_updated_at()') IS NULL
  OR to_regprocedure('snap_relaunch.require_source_acceptance_v1(uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'Expected fixture functions are missing'; END IF;
END $guard$;

CREATE TEMP TABLE snap_search_path_before ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'proconfig' AS unchanged_definition
 FROM pg_proc p WHERE p.oid IN ('public.tg_set_updated_at()'::regprocedure,
  'snap_relaunch.require_source_acceptance_v1(uuid,text)'::regprocedure);

ALTER FUNCTION public.tg_set_updated_at() SET search_path=pg_catalog;
ALTER FUNCTION snap_relaunch.require_source_acceptance_v1(uuid,text) SET search_path=pg_catalog;

DO $verify$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.snap_search_path_before b JOIN pg_proc p ON p.oid=b.oid
  WHERE (to_jsonb(p)-'proconfig') IS DISTINCT FROM b.unchanged_definition
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]) THEN
  RAISE EXCEPTION 'Function maintenance changed more than the fixed search path'; END IF;
 IF (SELECT count(*) FROM pg_temp.snap_search_path_before)<>2 THEN
  RAISE EXCEPTION 'Expected exactly two function updates'; END IF;
END $verify$;
COMMIT;
