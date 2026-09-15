-- Local candidate only. Installs empty capability storage; grants no real account permission.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL timezone='UTC';
DO $preflight$
DECLARE pin jsonb;fn record;observed jsonb;snapshot jsonb;item jsonb;table_name text;
BEGIN
 IF current_user<>'postgres' OR current_setting('transaction_isolation')<>'read committed' OR current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'source_capability_install_session';END IF;
 PERFORM pg_advisory_xact_lock(810207,71);
 LOCK TABLE snap_relaunch.customer_property_mappings,snap_relaunch.customer_source_acceptances,snap_relaunch.intake_batches,snap_relaunch.intake_events,snap_relaunch.owner_review_access,snap_relaunch.parcel_evidence,snap_relaunch.property_identities,snap_relaunch.source_crm_links,snap_relaunch.source_review_events,snap_relaunch.source_revocations,public.user_roles IN SHARE MODE;
 FOR pin IN SELECT value FROM jsonb_array_elements('[{"acl":"{postgres=X/postgres,authenticated=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"56f14dde1c3e095a4f99dcc6164efa3c","owner":"postgres","signature":"fn_lookup_source_consumer_v1(text,uuid)","volatile":"s"},{"acl":"{postgres=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres,authenticated=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"086b51437da48ba194a4dffec55bfa03","owner":"postgres","signature":"fn_owner_source_action_page_v1(text,text,jsonb,text,integer)","volatile":"s"},{"acl":"{postgres=X/postgres,authenticated=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"2e29c4ada4642f93aba90e95a40d1f2a","owner":"postgres","signature":"fn_owner_source_action_state_v1(text)","volatile":"s"},{"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"656bbe89910abf10ea08b61e2f72e087","owner":"postgres","signature":"has_role(uuid,app_role)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"77caa09a28049da1327d8c83beccd19e","owner":"postgres","signature":"snap_relaunch.owner_source_acceptance_status_v1(text,uuid)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"e9016de8c3903f83c4d678dd6bdea967","owner":"postgres","signature":"snap_relaunch.reject_intake_mutation()","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"3bf4ebb731035c8f60339135c64bc240","owner":"postgres","signature":"snap_relaunch.require_source_acceptance_v1(uuid,text)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"0fb3da3ad02b530c83d74f084788b223","owner":"postgres","signature":"snap_relaunch.require_source_actor_v1(text,boolean)","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"00dfb547fc52b2dcbe9b2dcd9f61a4d2","owner":"postgres","signature":"snap_relaunch.source_authorization_current_v1(text,uuid,boolean)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"a84838c27ad68e0eea425aa5f2de2147","owner":"postgres","signature":"snap_relaunch.source_hash_v1(jsonb)","volatile":"i"}]'::jsonb) LOOP
 SELECT p.proowner::regrole::text owner,md5(pg_get_functiondef(p.oid)) definition_md5,p.proacl::text acl,p.provolatile::text volatile,p.proconfig config INTO fn FROM pg_proc p WHERE p.oid=to_regprocedure(pin->>'signature');
 IF NOT FOUND OR fn.owner<>'postgres' OR fn.definition_md5 IS DISTINCT FROM pin->>'definition_md5' OR fn.acl IS DISTINCT FROM pin->>'acl' OR fn.volatile IS DISTINCT FROM pin->>'volatile' OR coalesce(to_jsonb(fn.config),'null'::jsonb) IS DISTINCT FROM pin->'config' THEN RAISE EXCEPTION 'source_capability_function_drift: %',pin->>'signature';END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner::regrole::text,'rls',c.relrowsecurity,'acl',c.relacl::text,
'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull) ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE role_oid::regrole::text END ORDER BY role_oid::regrole::text) FROM unnest(p.polroles) role_oid),'command',p.polcmd,'permissive',p.polpermissive,'qual',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)
) ORDER BY c.relname) INTO observed FROM pg_class c WHERE c.relnamespace='snap_relaunch'::regnamespace AND c.relname=ANY(ARRAY['intake_batches','intake_events','property_identities','parcel_evidence','owner_review_access','source_review_events','customer_property_mappings','customer_source_acceptances','source_revocations','source_crm_links']);
 IF observed IS DISTINCT FROM '[{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"actor_user_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"created_for_source","notnull":true,"type":"boolean"},{"name":"customer_property_id","notnull":true,"type":"uuid"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"note","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"source_evidence_sha256","notnull":true,"type":"text"},{"name":"source_property_id","notnull":true,"type":"uuid"},{"name":"target_snapshot_sha256","notnull":true,"type":"text"}],"name":"customer_property_mappings","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.customer_property_mappings FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"actor_user_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"consumer_org_id","notnull":true,"type":"uuid"},{"name":"consumer_user_id","notnull":true,"type":"uuid"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"mapped_items","notnull":true,"type":"jsonb"},{"name":"mapping_ids","notnull":true,"type":"uuid[]"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"purpose","notnull":true,"type":"text"},{"name":"record_keys","notnull":true,"type":"text[]"},{"name":"resolutions","notnull":true,"type":"jsonb"},{"name":"review_event_id","notnull":true,"type":"uuid"},{"name":"scope","notnull":true,"type":"text"},{"name":"selection_sha256","notnull":true,"type":"text"},{"name":"valid_until","notnull":true,"type":"timestamp with time zone"}],"name":"customer_source_acceptances","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.customer_source_acceptances FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"collected_at","notnull":true,"type":"timestamp with time zone"},{"name":"customer_accepted","notnull":true,"type":"boolean"},{"name":"customer_project_ref","notnull":true,"type":"text"},{"name":"delivery_id","notnull":true,"type":"uuid"},{"name":"event_count","notnull":true,"type":"integer"},{"name":"parcel_count","notnull":true,"type":"integer"},{"name":"payload_sha256","notnull":true,"type":"text"},{"name":"payload_text","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"processing_run_id","notnull":true,"type":"uuid"},{"name":"received_at","notnull":true,"type":"timestamp with time zone"},{"name":"record_type","notnull":true,"type":"text"},{"name":"review_state","notnull":true,"type":"text"},{"name":"source_project_ref","notnull":true,"type":"text"}],"name":"intake_batches","owner":"postgres","policies":[{"command":"r","name":"owner_review_batch_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.owner_review_access a\n  WHERE ((a.preparation_sha256 = intake_batches.preparation_sha256) AND (a.reviewer_user_id = ( SELECT auth.uid() AS uid)) AND a.enabled AND (a.revoked_at IS NULL))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER intake_batches_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.intake_batches FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"intake_batches_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"canonical_sha256","notnull":true,"type":"text"},{"name":"case_id","notnull":true,"type":"text"},{"name":"government_violation_id","notnull":true,"type":"text"},{"name":"original_sha256","notnull":true,"type":"text"},{"name":"original_text","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"published_violation_number","notnull":true,"type":"text"},{"name":"record_key","notnull":true,"type":"text"},{"name":"review_reasons","notnull":true,"type":"jsonb"},{"name":"source_parcel_reference","notnull":true,"type":"text"},{"name":"source_payload","notnull":true,"type":"jsonb"},{"name":"source_row","notnull":true,"type":"integer"}],"name":"intake_events","owner":"postgres","policies":[{"command":"r","name":"owner_review_event_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.owner_review_access a\n  WHERE ((a.preparation_sha256 = intake_events.preparation_sha256) AND (a.reviewer_user_id = ( SELECT auth.uid() AS uid)) AND a.enabled AND (a.revoked_at IS NULL))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER intake_events_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.intake_events FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"intake_events_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"enabled","notnull":true,"type":"boolean"},{"name":"granted_at","notnull":true,"type":"timestamp with time zone"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"reviewer_user_id","notnull":true,"type":"uuid"},{"name":"revoked_at","notnull":false,"type":"timestamp with time zone"}],"name":"owner_review_access","owner":"postgres","policies":[{"command":"r","name":"owner_review_access_self","permissive":true,"qual":"((reviewer_user_id = ( SELECT auth.uid() AS uid)) AND enabled AND (revoked_at IS NULL))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":null},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"city","notnull":true,"type":"text"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"evidence_text","notnull":true,"type":"text"},{"name":"latitude","notnull":true,"type":"double precision"},{"name":"longitude","notnull":true,"type":"double precision"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"property_id","notnull":true,"type":"uuid"},{"name":"recorded_at","notnull":true,"type":"timestamp with time zone"},{"name":"recorded_lot_acres","notnull":true,"type":"numeric"},{"name":"recorded_residential_units","notnull":true,"type":"integer"},{"name":"recorded_year_built","notnull":true,"type":"integer"},{"name":"source_address","notnull":true,"type":"text"},{"name":"source_item_id","notnull":true,"type":"text"},{"name":"source_parcel_reference","notnull":true,"type":"text"},{"name":"source_retrieved_at","notnull":true,"type":"timestamp with time zone"},{"name":"source_scope","notnull":true,"type":"text"},{"name":"state","notnull":true,"type":"text"},{"name":"zip","notnull":true,"type":"text"}],"name":"parcel_evidence","owner":"postgres","policies":[{"command":"r","name":"owner_review_evidence_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.owner_review_access a\n  WHERE ((a.preparation_sha256 = parcel_evidence.preparation_sha256) AND (a.reviewer_user_id = ( SELECT auth.uid() AS uid)) AND a.enabled AND (a.revoked_at IS NULL))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER parcel_evidence_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.parcel_evidence FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"parcel_evidence_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"identity_key","notnull":true,"type":"text"},{"name":"property_id","notnull":true,"type":"uuid"},{"name":"source_authority","notnull":true,"type":"text"},{"name":"source_parcel_reference","notnull":true,"type":"text"}],"name":"property_identities","owner":"postgres","policies":[{"command":"r","name":"owner_review_identity_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.parcel_evidence pe\n  WHERE ((pe.property_id = property_identities.property_id) AND (pe.source_parcel_reference = property_identities.source_parcel_reference))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER property_identities_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.property_identities FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"property_identities_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"acceptance_id","notnull":true,"type":"uuid"},{"name":"activity_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"consumer_user_id","notnull":true,"type":"uuid"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"customer_property_id","notnull":true,"type":"uuid"},{"name":"id","notnull":true,"type":"uuid"},{"name":"lead_id","notnull":true,"type":"uuid"},{"name":"org_id","notnull":true,"type":"uuid"},{"name":"source_property_id","notnull":true,"type":"uuid"}],"name":"source_crm_links","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.source_crm_links FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"command_sha256","notnull":true,"type":"text"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"note","notnull":true,"type":"text"},{"name":"outcome","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"record_keys","notnull":true,"type":"text[]"},{"name":"reviewer_user_id","notnull":true,"type":"uuid"},{"name":"selection_sha256","notnull":true,"type":"text"}],"name":"source_review_events","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.source_review_events FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"actor_user_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"kind","notnull":true,"type":"text"},{"name":"note","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"target_id","notnull":true,"type":"uuid"}],"name":"source_revocations","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.source_revocations FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]}]'::jsonb THEN RAISE EXCEPTION 'source_capability_catalog_drift';END IF;
 snapshot:='{}'::jsonb;
 FOR table_name IN SELECT unnest(ARRAY['customer_property_mappings','customer_source_acceptances','intake_batches','intake_events','owner_review_access','parcel_evidence','property_identities','source_crm_links','source_review_events','source_revocations','public.user_roles']) LOOP
 EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''sha'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),''''))) FROM %s t',CASE WHEN table_name LIKE 'public.%' THEN table_name ELSE 'snap_relaunch.'||table_name END) INTO item;
 snapshot:=snapshot||jsonb_build_object(table_name,item);
 END LOOP;
 PERFORM set_config('snap.source_capability_before',snapshot::text,true);
 PERFORM set_config('snap.source_capability_defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]')::text FROM pg_default_acl d),true);
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='snap_relaunch'::regnamespace AND c.relname=ANY(ARRAY['source_management_grants_v1','source_management_revocations_v1','source_management_acceptance_bindings_v1']))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='snap_relaunch' AND p.proname IN ('source_management_current_grant_v1','guard_source_management_insert_v1','bind_source_management_acceptance_v1','source_accepting_authority_current_v1')) OR (n.nspname='public' AND p.proname='fn_source_owner_capabilities_v1')) THEN RAISE EXCEPTION 'source_capability_target_exists';END IF;
END $preflight$;
-- BEGIN EXACT CORE
-- Capability engineering only. This migration creates NO account grant or source decision.
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF to_regclass('snap_relaunch.source_management_grants_v1') IS NOT NULL OR to_regclass('snap_relaunch.source_management_revocations_v1') IS NOT NULL
  OR to_regclass('snap_relaunch.source_management_acceptance_bindings_v1') IS NOT NULL
  OR to_regprocedure('public.fn_source_owner_capabilities_v1(text)') IS NOT NULL THEN RAISE EXCEPTION 'Source management capability already installed';END IF;
 IF md5(pg_get_functiondef('snap_relaunch.source_authorization_current_v1(text,uuid,boolean)'::regprocedure)) IS DISTINCT FROM '00dfb547fc52b2dcbe9b2dcd9f61a4d2'
  OR md5(pg_get_functiondef('snap_relaunch.require_source_actor_v1(text,boolean)'::regprocedure)) IS DISTINCT FROM '0fb3da3ad02b530c83d74f084788b223'
  OR md5(pg_get_functiondef('snap_relaunch.require_source_acceptance_v1(uuid,text)'::regprocedure)) IS DISTINCT FROM '3bf4ebb731035c8f60339135c64bc240'
  OR md5(pg_get_functiondef('snap_relaunch.owner_source_acceptance_status_v1(text,uuid)'::regprocedure)) IS DISTINCT FROM '77caa09a28049da1327d8c83beccd19e'
  OR md5(pg_get_functiondef('snap_relaunch.reject_intake_mutation()'::regprocedure)) IS DISTINCT FROM 'e9016de8c3903f83c4d678dd6bdea967'
 THEN RAISE EXCEPTION 'Source capability baseline changed';END IF;
END $guard$;
CREATE TABLE snap_relaunch.source_management_grants_v1 (
 id uuid PRIMARY KEY,
 preparation_sha256 text NOT NULL REFERENCES snap_relaunch.intake_batches(preparation_sha256),
 grantee_user_id uuid NOT NULL REFERENCES auth.users(id),
 capability text NOT NULL CHECK(capability='manage_source'),
 authorized_by_user_id uuid NOT NULL REFERENCES auth.users(id),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 CHECK(isfinite(created_at) AND isfinite(expires_at) AND expires_at>created_at AND expires_at<=created_at+interval '30 days')
);
CREATE INDEX source_management_grantee_scope_v1 ON snap_relaunch.source_management_grants_v1(preparation_sha256,grantee_user_id,expires_at);
CREATE TABLE snap_relaunch.source_management_revocations_v1 (
 id uuid PRIMARY KEY,
 grant_id uuid NOT NULL UNIQUE REFERENCES snap_relaunch.source_management_grants_v1(id),
 authorized_by_user_id uuid NOT NULL REFERENCES auth.users(id),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE snap_relaunch.source_management_grants_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_relaunch.source_management_revocations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.source_management_grants_v1,snap_relaunch.source_management_revocations_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER source_management_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_relaunch.source_management_grants_v1
 FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation();
CREATE TRIGGER source_management_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_relaunch.source_management_revocations_v1
 FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation();

-- This helper is intentionally VOLATILE: after an advisory-lock wait, its
-- separate SELECT observes the current grant/revocation snapshot. Callers keep
-- the existing source transaction lock until their transaction completes.
CREATE FUNCTION snap_relaunch.source_management_current_grant_v1(p_preparation text,p_user uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE grant_id uuid;BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Source capability requires READ COMMITTED isolation' USING ERRCODE='25001';END IF;
 IF p_preparation IS NULL OR p_preparation!~'^[0-9a-f]{64}$' OR p_user IS NULL THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(810207,71);
 SELECT g.id INTO grant_id FROM snap_relaunch.source_management_grants_v1 g
 WHERE g.preparation_sha256=p_preparation AND g.grantee_user_id=p_user AND g.capability='manage_source'
  AND g.created_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
  AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
    AND u.confirmed_at IS NOT NULL AND u.confirmed_at<=clock_timestamp() AND u.is_anonymous IS FALSE AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()))
  AND EXISTS(SELECT 1 FROM snap_relaunch.owner_review_access a WHERE a.preparation_sha256=p_preparation
    AND a.reviewer_user_id=p_user AND a.enabled AND a.revoked_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM snap_relaunch.source_management_revocations_v1 r WHERE r.grant_id=g.id)
 ORDER BY g.created_at DESC,g.id DESC LIMIT 1;
 RETURN grant_id;
END $$;

-- Private database administration only; no authenticated grant/revoke endpoint.
-- Same source lock orders source actions and new capability changes. New-table
-- INSERT relation locks do not conflict with these readers' ACCESS SHARE locks.
CREATE FUNCTION snap_relaunch.guard_source_management_insert_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prep text;BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Source capability requires READ COMMITTED isolation' USING ERRCODE='25001';END IF;
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Source capability requires reviewed database administration' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(810207,71);
 IF tg_table_name='source_management_grants_v1' THEN
  prep:=NEW.preparation_sha256;
  IF NEW.created_at>clock_timestamp() OR NEW.expires_at<=clock_timestamp()
   OR NOT snap_relaunch.source_authorization_current_v1(prep,NEW.grantee_user_id,false)
   OR NOT snap_relaunch.source_authorization_current_v1(prep,NEW.authorized_by_user_id,false)
   OR (SELECT count(*) FROM auth.users WHERE id=ANY(ARRAY[NEW.grantee_user_id,NEW.authorized_by_user_id])
     AND deleted_at IS NULL AND confirmed_at IS NOT NULL AND confirmed_at<=clock_timestamp() AND is_anonymous IS FALSE
     AND (banned_until IS NULL OR banned_until<=clock_timestamp()))<>(CASE WHEN NEW.grantee_user_id=NEW.authorized_by_user_id THEN 1 ELSE 2 END)
   OR snap_relaunch.source_management_current_grant_v1(prep,NEW.grantee_user_id) IS NOT NULL THEN
   RAISE EXCEPTION 'Source capability requires current scoped accounts and no active duplicate' USING ERRCODE='42501';END IF;
 ELSIF tg_table_name='source_management_revocations_v1' THEN
  SELECT preparation_sha256 INTO STRICT prep FROM snap_relaunch.source_management_grants_v1 WHERE id=NEW.grant_id;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.authorized_by_user_id AND deleted_at IS NULL
   AND confirmed_at IS NOT NULL AND confirmed_at<=clock_timestamp() AND is_anonymous IS FALSE AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
   OR NEW.created_at>clock_timestamp() THEN RAISE EXCEPTION 'Source capability revocation needs a current verified authorizer' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'Unexpected source capability table';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER source_management_insert_guard BEFORE INSERT ON snap_relaunch.source_management_grants_v1
 FOR EACH ROW EXECUTE FUNCTION snap_relaunch.guard_source_management_insert_v1();
CREATE TRIGGER source_management_insert_guard BEFORE INSERT ON snap_relaunch.source_management_revocations_v1
 FOR EACH ROW EXECUTE FUNCTION snap_relaunch.guard_source_management_insert_v1();

CREATE TABLE snap_relaunch.source_management_acceptance_bindings_v1 (
 acceptance_id uuid PRIMARY KEY REFERENCES snap_relaunch.customer_source_acceptances(id),
 grant_id uuid NOT NULL REFERENCES snap_relaunch.source_management_grants_v1(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE snap_relaunch.source_management_acceptance_bindings_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.source_management_acceptance_bindings_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER source_management_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_relaunch.source_management_acceptance_bindings_v1
 FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation();
CREATE FUNCTION snap_relaunch.bind_source_management_acceptance_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE grant_id uuid;BEGIN
 IF coalesce(public.has_role(NEW.actor_user_id,'admin'::public.app_role),false) THEN RETURN NEW;END IF;
 grant_id:=snap_relaunch.source_management_current_grant_v1(NEW.preparation_sha256,NEW.actor_user_id);
 IF grant_id IS NULL THEN RAISE EXCEPTION 'Current source capability required for this acceptance' USING ERRCODE='42501';END IF;
 INSERT INTO snap_relaunch.source_management_acceptance_bindings_v1(acceptance_id,grant_id) VALUES(NEW.id,grant_id);
 RETURN NEW;
END $$;
CREATE TRIGGER source_management_acceptance_binding AFTER INSERT ON snap_relaunch.customer_source_acceptances
 FOR EACH ROW EXECUTE FUNCTION snap_relaunch.bind_source_management_acceptance_v1();
CREATE FUNCTION snap_relaunch.source_accepting_authority_current_v1(p_acceptance uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;bound_grant uuid;BEGIN
 SELECT * INTO a FROM snap_relaunch.customer_source_acceptances WHERE id=p_acceptance;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT grant_id INTO bound_grant FROM snap_relaunch.source_management_acceptance_bindings_v1 WHERE acceptance_id=a.id;
 IF bound_grant IS NOT NULL THEN
  RETURN coalesce(snap_relaunch.source_management_current_grant_v1(a.preparation_sha256,a.actor_user_id)=bound_grant,false);
 END IF;
 -- An old or ordinary-admin acceptance must retain its original admin path.
 -- A new preparation grant cannot silently revive that different authority.
 RETURN coalesce(public.has_role(a.actor_user_id,'admin'::public.app_role),false);
END $$;
REVOKE ALL ON FUNCTION snap_relaunch.bind_source_management_acceptance_v1(),snap_relaunch.source_accepting_authority_current_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION snap_relaunch.source_authorization_current_v1(p_preparation text,p_user uuid,p_admin boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_preparation IS NOT NULL AND p_preparation ~ '^[0-9a-f]{64}$' AND p_user IS NOT NULL AND p_admin IS NOT NULL
  AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND is_anonymous IS FALSE
    AND (banned_until IS NULL OR banned_until<=now()) AND confirmed_at IS NOT NULL AND confirmed_at<=clock_timestamp())
  AND EXISTS(SELECT 1 FROM snap_relaunch.owner_review_access WHERE preparation_sha256=p_preparation
    AND reviewer_user_id=p_user AND enabled AND revoked_at IS NULL)
  AND (NOT p_admin OR coalesce(public.has_role(p_user,'admin'::public.app_role),false)
    OR snap_relaunch.source_management_current_grant_v1(p_preparation,p_user) IS NOT NULL)
$$;

CREATE FUNCTION public.fn_source_owner_capabilities_v1(p_preparation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
DECLARE actor uuid;grant_id uuid;grant_expiry timestamptz;is_admin boolean;BEGIN
 actor:=snap_relaunch.require_source_actor_v1(p_preparation,false);
 is_admin:=coalesce(public.has_role(actor,'admin'::public.app_role),false);
 grant_id:=snap_relaunch.source_management_current_grant_v1(p_preparation,actor);
 IF grant_id IS NOT NULL THEN SELECT expires_at INTO grant_expiry FROM snap_relaunch.source_management_grants_v1 WHERE id=grant_id;END IF;
 RETURN jsonb_build_object('version','source-owner-capabilities-v1','preparation_sha256',p_preparation,'actor_user_id',actor,
  'checked_at',clock_timestamp(),'can_review',true,'can_manage_source',is_admin OR grant_id IS NOT NULL,
  'management_authority',CASE WHEN is_admin THEN 'existing_admin' WHEN grant_id IS NOT NULL THEN 'preparation_grant' ELSE 'reviewer_only' END,
  'management_grant_id',grant_id,'management_expires_at',grant_expiry,'customer_access_held',NOT is_admin,
  'scope','Source management for this preparation only; customer execution and entitlement are checked separately.');
END $$;
REVOKE ALL ON FUNCTION snap_relaunch.source_management_current_grant_v1(text,uuid),snap_relaunch.guard_source_management_insert_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_source_owner_capabilities_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_source_owner_capabilities_v1(text) TO authenticated;

-- Public-schema defaults may grant a platform executor. Only this new self-scope
-- RPC is restricted; neither the provider role nor default privileges change.
DO $new_rpc_acl$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec_ojyxblegxpdgaqiscxpz') THEN
  REVOKE ALL ON FUNCTION public.fn_source_owner_capabilities_v1(text) FROM sandbox_exec_ojyxblegxpdgaqiscxpz;
 END IF;
END $new_rpc_acl$;

-- Preserve every consumer/account/entitlement gate; add exact accepting-grant validity.
CREATE OR REPLACE FUNCTION snap_relaunch.require_source_acceptance_v1(p_acceptance uuid, p_purpose text)
 RETURNS snap_relaunch.customer_source_acceptances
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN
  RAISE EXCEPTION 'Customer access remains held' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM snap_relaunch.customer_source_acceptances WHERE id=p_acceptance AND consumer_user_id=auth.uid() AND purpose=p_purpose;
 IF NOT FOUND OR a.valid_until<=clock_timestamp() OR EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='acceptance' AND r.target_id=a.id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND org_id=a.consumer_org_id)
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL AND confirmed_at IS NOT NULL
    AND NOT coalesce(is_anonymous,false) AND (banned_until IS NULL OR banned_until<=now()))
  OR EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='mapping' AND r.target_id=ANY(a.mapping_ids))
  OR EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m JOIN public.properties p ON p.id=m.customer_property_id
    WHERE m.id=ANY(a.mapping_ids) AND snap_relaunch.source_hash_v1(to_jsonb(p))<>m.target_snapshot_sha256)
  OR EXISTS(SELECT 1 FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=a.preparation_sha256
    AND r.outcome IN ('held','rejected') AND r.record_keys&&a.record_keys AND r.created_at>a.created_at)
  OR NOT snap_relaunch.source_accepting_authority_current_v1(a.id)
  OR NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,a.actor_user_id,true)
  OR NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,
    (SELECT reviewer_user_id FROM snap_relaunch.source_review_events WHERE id=a.review_event_id),false)
  OR a.review_event_id IS DISTINCT FROM (SELECT id FROM snap_relaunch.source_review_events WHERE preparation_sha256=a.preparation_sha256
    AND selection_sha256=a.selection_sha256 ORDER BY created_at DESC,id DESC LIMIT 1) THEN
  RAISE EXCEPTION 'Current source acceptance unavailable' USING ERRCODE='42501';END IF;
 IF snap_relaunch.source_hash_v1(snap_relaunch.source_manifest_v1(a.preparation_sha256,a.record_keys))<>a.selection_sha256 THEN
  RAISE EXCEPTION 'Accepted source evidence changed' USING ERRCODE='42501';END IF;
 RETURN a;
END $function$
;
CREATE OR REPLACE FUNCTION snap_relaunch.owner_source_acceptance_status_v1(p_preparation text, p_acceptance uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;reason text;BEGIN
 SELECT * INTO a FROM snap_relaunch.customer_source_acceptances WHERE id=p_acceptance AND preparation_sha256=p_preparation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source acceptance unavailable' USING ERRCODE='42501';END IF;
 IF a.valid_until<=clock_timestamp() THEN reason:='acceptance_expired';
 ELSIF EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='acceptance' AND target_id=a.id) THEN reason:='acceptance_revoked';
 ELSIF NOT coalesce(public.has_role(a.consumer_user_id,'admin'::public.app_role),false) THEN reason:='customer_access_held';
 ELSIF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=a.consumer_user_id AND deleted_at IS NULL AND confirmed_at IS NOT NULL
  AND NOT coalesce(is_anonymous,false) AND (banned_until IS NULL OR banned_until<=now())) THEN reason:='consumer_account_unavailable';
 ELSIF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=a.consumer_user_id AND org_id=a.consumer_org_id) THEN reason:='consumer_organization_changed';
 ELSIF EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=ANY(a.mapping_ids)) THEN reason:='mapping_revoked';
 ELSIF EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m JOIN public.properties p ON p.id=m.customer_property_id
  WHERE m.id=ANY(a.mapping_ids) AND snap_relaunch.source_hash_v1(to_jsonb(p))<>m.target_snapshot_sha256) THEN reason:='mapping_target_changed';
 ELSIF NOT snap_relaunch.source_accepting_authority_current_v1(a.id) THEN reason:='accepting_grant_unavailable';
 ELSIF NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,a.actor_user_id,true) THEN reason:='accepting_owner_unavailable';
 ELSIF NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,
  (SELECT reviewer_user_id FROM snap_relaunch.source_review_events WHERE id=a.review_event_id),false) THEN reason:='original_reviewer_unavailable';
 ELSIF a.review_event_id IS DISTINCT FROM (SELECT id FROM snap_relaunch.source_review_events WHERE preparation_sha256=a.preparation_sha256
  AND selection_sha256=a.selection_sha256 ORDER BY created_at DESC,id DESC LIMIT 1) THEN reason:='review_superseded';
 ELSIF EXISTS(SELECT 1 FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=a.preparation_sha256
  AND r.outcome IN ('held','rejected') AND r.record_keys&&a.record_keys AND r.created_at>a.created_at) THEN reason:='later_review_holds_records';
 ELSE
  BEGIN
   IF snap_relaunch.source_hash_v1(snap_relaunch.source_manifest_v1(a.preparation_sha256,a.record_keys))<>a.selection_sha256 THEN reason:='source_evidence_changed';END IF;
  EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' THEN reason:='source_evidence_changed';END;
 END IF;
 RETURN jsonb_build_object('current',reason IS NULL,'unavailable_reason',reason);
END $function$
;

-- END EXACT CORE
DO $postflight$
DECLARE pin jsonb;fn record;observed jsonb;snapshot jsonb;item jsonb;table_name text;row_count bigint;
BEGIN
 FOR pin IN SELECT value FROM jsonb_array_elements('[{"acl":"{postgres=X/postgres,authenticated=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"56f14dde1c3e095a4f99dcc6164efa3c","owner":"postgres","signature":"fn_lookup_source_consumer_v1(text,uuid)","volatile":"s"},{"acl":"{postgres=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres,authenticated=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"086b51437da48ba194a4dffec55bfa03","owner":"postgres","signature":"fn_owner_source_action_page_v1(text,text,jsonb,text,integer)","volatile":"s"},{"acl":"{postgres=X/postgres,authenticated=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"2e29c4ada4642f93aba90e95a40d1f2a","owner":"postgres","signature":"fn_owner_source_action_state_v1(text)","volatile":"s"},{"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_ojyxblegxpdgaqiscxpz=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"656bbe89910abf10ea08b61e2f72e087","owner":"postgres","signature":"has_role(uuid,app_role)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"e9016de8c3903f83c4d678dd6bdea967","owner":"postgres","signature":"snap_relaunch.reject_intake_mutation()","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"0fb3da3ad02b530c83d74f084788b223","owner":"postgres","signature":"snap_relaunch.require_source_actor_v1(text,boolean)","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"a84838c27ad68e0eea425aa5f2de2147","owner":"postgres","signature":"snap_relaunch.source_hash_v1(jsonb)","volatile":"i"},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","config":["search_path=pg_catalog","statement_timeout=10s"],"definition_md5":"5afc35ef57404ff20214ae49eccaa4eb","signature":"fn_source_owner_capabilities_v1(text)","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"df908375dff20d2cf63cc871e9537837","signature":"snap_relaunch.bind_source_management_acceptance_v1()","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"4cf9c1ca770915b703fb7d36cafc7dcf","signature":"snap_relaunch.guard_source_management_insert_v1()","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"569cc1e6d65cc9b594b9de68f02e1845","signature":"snap_relaunch.owner_source_acceptance_status_v1(text,uuid)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"6d54e7ad0f6be5d6b4313bffcd006426","signature":"snap_relaunch.require_source_acceptance_v1(uuid,text)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"741c0bb879ab20a7c940e7a950bebb2e","signature":"snap_relaunch.source_accepting_authority_current_v1(uuid)","volatile":"v"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"679a6415c309b942256e2618fe88fc12","signature":"snap_relaunch.source_authorization_current_v1(text,uuid,boolean)","volatile":"s"},{"acl":"{postgres=X/postgres}","config":["search_path=pg_catalog"],"definition_md5":"a9828bdca7a518b1c79880780c60ed2a","signature":"snap_relaunch.source_management_current_grant_v1(text,uuid)","volatile":"v"}]'::jsonb) LOOP
 SELECT p.proowner::regrole::text owner,md5(pg_get_functiondef(p.oid)) definition_md5,p.proacl::text acl,p.provolatile::text volatile,p.proconfig config INTO fn FROM pg_proc p WHERE p.oid=to_regprocedure(pin->>'signature');
 IF NOT FOUND OR fn.owner<>'postgres' OR fn.definition_md5 IS DISTINCT FROM pin->>'definition_md5' OR fn.acl IS DISTINCT FROM pin->>'acl' OR fn.volatile IS DISTINCT FROM pin->>'volatile' OR coalesce(to_jsonb(fn.config),'null'::jsonb) IS DISTINCT FROM pin->'config' THEN RAISE EXCEPTION 'source_capability_function_drift: %',pin->>'signature';END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner::regrole::text,'rls',c.relrowsecurity,'acl',c.relacl::text,
'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull) ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal AND t.tgname<>'source_management_acceptance_binding'),
'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE role_oid::regrole::text END ORDER BY role_oid::regrole::text) FROM unnest(p.polroles) role_oid),'command',p.polcmd,'permissive',p.polpermissive,'qual',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)
) ORDER BY c.relname) INTO observed FROM pg_class c WHERE c.relnamespace='snap_relaunch'::regnamespace AND c.relname=ANY(ARRAY['intake_batches','intake_events','property_identities','parcel_evidence','owner_review_access','source_review_events','customer_property_mappings','customer_source_acceptances','source_revocations','source_crm_links']);
 IF observed IS DISTINCT FROM '[{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"actor_user_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"created_for_source","notnull":true,"type":"boolean"},{"name":"customer_property_id","notnull":true,"type":"uuid"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"note","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"source_evidence_sha256","notnull":true,"type":"text"},{"name":"source_property_id","notnull":true,"type":"uuid"},{"name":"target_snapshot_sha256","notnull":true,"type":"text"}],"name":"customer_property_mappings","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.customer_property_mappings FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"actor_user_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"consumer_org_id","notnull":true,"type":"uuid"},{"name":"consumer_user_id","notnull":true,"type":"uuid"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"mapped_items","notnull":true,"type":"jsonb"},{"name":"mapping_ids","notnull":true,"type":"uuid[]"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"purpose","notnull":true,"type":"text"},{"name":"record_keys","notnull":true,"type":"text[]"},{"name":"resolutions","notnull":true,"type":"jsonb"},{"name":"review_event_id","notnull":true,"type":"uuid"},{"name":"scope","notnull":true,"type":"text"},{"name":"selection_sha256","notnull":true,"type":"text"},{"name":"valid_until","notnull":true,"type":"timestamp with time zone"}],"name":"customer_source_acceptances","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.customer_source_acceptances FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"collected_at","notnull":true,"type":"timestamp with time zone"},{"name":"customer_accepted","notnull":true,"type":"boolean"},{"name":"customer_project_ref","notnull":true,"type":"text"},{"name":"delivery_id","notnull":true,"type":"uuid"},{"name":"event_count","notnull":true,"type":"integer"},{"name":"parcel_count","notnull":true,"type":"integer"},{"name":"payload_sha256","notnull":true,"type":"text"},{"name":"payload_text","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"processing_run_id","notnull":true,"type":"uuid"},{"name":"received_at","notnull":true,"type":"timestamp with time zone"},{"name":"record_type","notnull":true,"type":"text"},{"name":"review_state","notnull":true,"type":"text"},{"name":"source_project_ref","notnull":true,"type":"text"}],"name":"intake_batches","owner":"postgres","policies":[{"command":"r","name":"owner_review_batch_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.owner_review_access a\n  WHERE ((a.preparation_sha256 = intake_batches.preparation_sha256) AND (a.reviewer_user_id = ( SELECT auth.uid() AS uid)) AND a.enabled AND (a.revoked_at IS NULL))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER intake_batches_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.intake_batches FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"intake_batches_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"canonical_sha256","notnull":true,"type":"text"},{"name":"case_id","notnull":true,"type":"text"},{"name":"government_violation_id","notnull":true,"type":"text"},{"name":"original_sha256","notnull":true,"type":"text"},{"name":"original_text","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"published_violation_number","notnull":true,"type":"text"},{"name":"record_key","notnull":true,"type":"text"},{"name":"review_reasons","notnull":true,"type":"jsonb"},{"name":"source_parcel_reference","notnull":true,"type":"text"},{"name":"source_payload","notnull":true,"type":"jsonb"},{"name":"source_row","notnull":true,"type":"integer"}],"name":"intake_events","owner":"postgres","policies":[{"command":"r","name":"owner_review_event_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.owner_review_access a\n  WHERE ((a.preparation_sha256 = intake_events.preparation_sha256) AND (a.reviewer_user_id = ( SELECT auth.uid() AS uid)) AND a.enabled AND (a.revoked_at IS NULL))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER intake_events_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.intake_events FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"intake_events_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"enabled","notnull":true,"type":"boolean"},{"name":"granted_at","notnull":true,"type":"timestamp with time zone"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"reviewer_user_id","notnull":true,"type":"uuid"},{"name":"revoked_at","notnull":false,"type":"timestamp with time zone"}],"name":"owner_review_access","owner":"postgres","policies":[{"command":"r","name":"owner_review_access_self","permissive":true,"qual":"((reviewer_user_id = ( SELECT auth.uid() AS uid)) AND enabled AND (revoked_at IS NULL))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":null},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"city","notnull":true,"type":"text"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"evidence_text","notnull":true,"type":"text"},{"name":"latitude","notnull":true,"type":"double precision"},{"name":"longitude","notnull":true,"type":"double precision"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"property_id","notnull":true,"type":"uuid"},{"name":"recorded_at","notnull":true,"type":"timestamp with time zone"},{"name":"recorded_lot_acres","notnull":true,"type":"numeric"},{"name":"recorded_residential_units","notnull":true,"type":"integer"},{"name":"recorded_year_built","notnull":true,"type":"integer"},{"name":"source_address","notnull":true,"type":"text"},{"name":"source_item_id","notnull":true,"type":"text"},{"name":"source_parcel_reference","notnull":true,"type":"text"},{"name":"source_retrieved_at","notnull":true,"type":"timestamp with time zone"},{"name":"source_scope","notnull":true,"type":"text"},{"name":"state","notnull":true,"type":"text"},{"name":"zip","notnull":true,"type":"text"}],"name":"parcel_evidence","owner":"postgres","policies":[{"command":"r","name":"owner_review_evidence_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.owner_review_access a\n  WHERE ((a.preparation_sha256 = parcel_evidence.preparation_sha256) AND (a.reviewer_user_id = ( SELECT auth.uid() AS uid)) AND a.enabled AND (a.revoked_at IS NULL))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER parcel_evidence_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.parcel_evidence FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"parcel_evidence_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"identity_key","notnull":true,"type":"text"},{"name":"property_id","notnull":true,"type":"uuid"},{"name":"source_authority","notnull":true,"type":"text"},{"name":"source_parcel_reference","notnull":true,"type":"text"}],"name":"property_identities","owner":"postgres","policies":[{"command":"r","name":"owner_review_identity_select","permissive":true,"qual":"(EXISTS ( SELECT 1\n   FROM snap_relaunch.parcel_evidence pe\n  WHERE ((pe.property_id = property_identities.property_id) AND (pe.source_parcel_reference = property_identities.source_parcel_reference))))","roles":["authenticated"],"with_check":null}],"rls":true,"triggers":[{"definition":"CREATE TRIGGER property_identities_immutable BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.property_identities FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"property_identities_immutable"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"acceptance_id","notnull":true,"type":"uuid"},{"name":"activity_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"consumer_user_id","notnull":true,"type":"uuid"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"customer_property_id","notnull":true,"type":"uuid"},{"name":"id","notnull":true,"type":"uuid"},{"name":"lead_id","notnull":true,"type":"uuid"},{"name":"org_id","notnull":true,"type":"uuid"},{"name":"source_property_id","notnull":true,"type":"uuid"}],"name":"source_crm_links","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.source_crm_links FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"command_sha256","notnull":true,"type":"text"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"note","notnull":true,"type":"text"},{"name":"outcome","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"record_keys","notnull":true,"type":"text[]"},{"name":"reviewer_user_id","notnull":true,"type":"uuid"},{"name":"selection_sha256","notnull":true,"type":"text"}],"name":"source_review_events","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.source_review_events FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]},{"acl":"{postgres=arwdDxtm/postgres}","columns":[{"name":"actor_user_id","notnull":true,"type":"uuid"},{"name":"command_sha256","notnull":true,"type":"text"},{"name":"created_at","notnull":true,"type":"timestamp with time zone"},{"name":"evidence_sha256","notnull":true,"type":"text"},{"name":"id","notnull":true,"type":"uuid"},{"name":"kind","notnull":true,"type":"text"},{"name":"note","notnull":true,"type":"text"},{"name":"preparation_sha256","notnull":true,"type":"text"},{"name":"target_id","notnull":true,"type":"uuid"}],"name":"source_revocations","owner":"postgres","policies":null,"rls":true,"triggers":[{"definition":"CREATE TRIGGER source_decision_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON snap_relaunch.source_revocations FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()","enabled":"O","name":"source_decision_append_only"}]}]'::jsonb THEN RAISE EXCEPTION 'source_capability_existing_catalog_mutated';END IF;
 snapshot:='{}'::jsonb;
 FOR table_name IN SELECT unnest(ARRAY['customer_property_mappings','customer_source_acceptances','intake_batches','intake_events','owner_review_access','parcel_evidence','property_identities','source_crm_links','source_review_events','source_revocations','public.user_roles']) LOOP
 EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''sha'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),''''))) FROM %s t',CASE WHEN table_name LIKE 'public.%' THEN table_name ELSE 'snap_relaunch.'||table_name END) INTO item;
 snapshot:=snapshot||jsonb_build_object(table_name,item);
 END LOOP;
 IF snapshot IS DISTINCT FROM current_setting('snap.source_capability_before')::jsonb OR (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]') FROM pg_default_acl d) IS DISTINCT FROM current_setting('snap.source_capability_defaults')::jsonb THEN RAISE EXCEPTION 'source_capability_existing_state_mutated';END IF;
 FOREACH table_name IN ARRAY ARRAY['source_management_grants_v1','source_management_revocations_v1','source_management_acceptance_bindings_v1'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('snap_relaunch.'||table_name) AND c.relowner='postgres'::regrole AND c.relrowsecurity AND c.relacl::text='{postgres=arwdDxtm/postgres}')
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('snap_relaunch.'||table_name)) THEN RAISE EXCEPTION 'source_capability_new_table_not_private';END IF;
 EXECUTE format('SELECT count(*) FROM snap_relaunch.%I',table_name) INTO row_count;IF row_count<>0 THEN RAISE EXCEPTION 'source_capability_install_created_business_authority';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='snap_relaunch.customer_source_acceptances'::regclass AND tgname='source_management_acceptance_binding' AND tgenabled='O' AND tgfoid='snap_relaunch.bind_source_management_acceptance_v1()'::regprocedure) THEN RAISE EXCEPTION 'source_capability_binding_trigger_missing';END IF;
END $postflight$;
COMMIT;
