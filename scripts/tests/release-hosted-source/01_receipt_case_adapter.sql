-- Additive receipt/case adapter for the approved isolated staging fixture only.
-- No original values, authority grants, reviews, acceptances or customer data are seeded.
-- No managed Auth/realtime changes, provider calls, legacy source release or export enablement.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
DO $guard$ BEGIN
 IF current_user<>'postgres' OR to_regclass('public.snap_hosted_fixture') IS NULL THEN
  RAISE EXCEPTION 'Reviewed synthetic staging baseline required'; END IF;
 IF (SELECT count(*) FROM public.snap_hosted_fixture)<>1 OR NOT EXISTS(
  SELECT 1 FROM public.snap_hosted_fixture WHERE kind='snap_hosted_synthetic' AND schema_version=1 AND state='ready')
  OR public.fn_billing_checkout_enabled_v1() IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Ready staging fixture with checkout held required'; END IF;
 IF to_regprocedure('public.fn_crm_record_outcome_v1(uuid,uuid,timestamp with time zone,text,text,text,timestamp with time zone,boolean)') IS NULL
  OR to_regprocedure('snap_security.can_access_workspace(uuid)') IS NULL
  OR position('PT409' in pg_get_functiondef('public.fn_crm_record_outcome_v1(uuid,uuid,timestamp with time zone,text,text,text,timestamp with time zone,boolean)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'Reviewed CRM and workspace baseline required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_is_source_property_v1(uuid)'::regprocedure
   AND proowner='postgres'::regrole AND md5(prosrc)='b7a6d773f93b1fe0f5009e8bf32ea87a' AND prosecdef AND provolatile='s'
   AND proconfig=ARRAY['search_path=pg_catalog']::text[] AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_source_lead_visible_v1(uuid,uuid)'::regprocedure
   AND proowner='postgres'::regrole AND md5(prosrc)='377ca5fba96ed3a69c3e2eb07326b717' AND prosecdef AND provolatile='s'
   AND proconfig=ARRAY['search_path=pg_catalog']::text[] AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
  OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.properties'::regclass AND polname='source_property_account_fence_v1'
   AND NOT polpermissive AND polcmd='*' AND polroles=ARRAY['authenticated'::regrole::oid]
   AND md5(pg_get_expr(polqual,polrelid))='d3cdabcb65341077a6cd392d47899645'
   AND md5(pg_get_expr(polwithcheck,polrelid))='d3cdabcb65341077a6cd392d47899645') THEN
  RAISE EXCEPTION 'Source fence baseline drift; review exact deployed definitions and ACLs';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN('fn_owner_receipt_case_snapshot_v1','fn_review_receipt_case_snapshot_v1','fn_accept_receipt_case_snapshot_v1',
   'fn_revoke_receipt_case_decision_v1','fn_my_receipt_case_acceptances_v1','fn_list_receipt_case_properties_v1','fn_handoff_receipt_case_to_crm_v1','fn_get_receipt_case_crm_detail_v1')) THEN
  RAISE EXCEPTION 'Receipt RPC name already exists; no overload or ACL widening permitted';END IF;
 IF EXISTS(SELECT 1 FROM snap_relaunch.source_crm_links) OR EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings)
  OR EXISTS(SELECT 1 FROM snap_relaunch.customer_source_acceptances) THEN
  RAISE EXCEPTION 'Legacy staging source fixtures must be empty; review separately'; END IF;
END $guard$;

CREATE SCHEMA snap_receipt;
REVOKE ALL ON SCHEMA snap_receipt FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA snap_receipt TO authenticated;
CREATE TABLE snap_receipt.snapshots(
 id uuid PRIMARY KEY, receipt_id uuid NOT NULL UNIQUE, source_job_id uuid NOT NULL, request_id uuid NOT NULL, archive_id uuid NOT NULL,
 agency_key text NOT NULL CHECK(agency_key='us:mi:madisonheights'),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
 archive_manifest_sha256 text NOT NULL CHECK(archive_manifest_sha256 ~ '^[0-9a-f]{64}$'),
 archive_verification_sha256 text NOT NULL CHECK(archive_verification_sha256 ~ '^[0-9a-f]{64}$'),
 selection_sha256 text NOT NULL CHECK(selection_sha256 ~ '^[0-9a-f]{64}$'),
 evidence_kind text NOT NULL CHECK(evidence_kind IN ('original_backed','synthetic')),
 report_date date NOT NULL, received_at timestamptz NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
 original_count integer NOT NULL CHECK(original_count BETWEEN 1 AND 2000),
 reviewed_count integer NOT NULL CHECK(reviewed_count BETWEEN 1 AND 1000),
 held_count integer NOT NULL CHECK(held_count>=0),
 parent_snapshot_id uuid REFERENCES snap_receipt.snapshots(id) ON DELETE RESTRICT,
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(original_count=reviewed_count+held_count),CHECK(period_start<=period_end AND period_end<=report_date)
);
CREATE TABLE snap_receipt.records(
 snapshot_id uuid NOT NULL REFERENCES snap_receipt.snapshots ON DELETE RESTRICT,
 record_key text NOT NULL CHECK(record_key ~ '^[0-9a-f]{64}$'),
 version_id text NOT NULL CHECK(version_id ~ '^[0-9a-f]{64}$'),
 source_property_key text NOT NULL CHECK(source_property_key ~ '^[0-9a-f]{64}$'),
 case_id text NOT NULL, address text NOT NULL, city text NOT NULL CHECK(city='Madison Heights'),state text NOT NULL CHECK(state='MI'),
 source_parcel_reference text NOT NULL, category text NOT NULL, source_status text NOT NULL,
 filed_date date NOT NULL,closed_date date,cleaned_description text NOT NULL,
 cleaned_sha256 text NOT NULL CHECK(cleaned_sha256 ~ '^[0-9a-f]{64}$'),cleaning_rule_version text NOT NULL,
 source_row_sha256 text NOT NULL CHECK(source_row_sha256 ~ '^[0-9a-f]{64}$'),source_rows jsonb NOT NULL,
 PRIMARY KEY(snapshot_id,record_key), UNIQUE(snapshot_id,version_id),UNIQUE(snapshot_id,source_rows),
 CHECK(closed_date IS NULL OR closed_date>=filed_date)
);
CREATE INDEX receipt_property_cases ON snap_receipt.records(snapshot_id,source_property_key);
CREATE TABLE snap_receipt.property_mappings(
 source_property_key text PRIMARY KEY CHECK(source_property_key ~ '^[0-9a-f]{64}$'),
 property_id uuid NOT NULL UNIQUE REFERENCES public.properties ON DELETE RESTRICT,
 first_snapshot_id uuid NOT NULL REFERENCES snap_receipt.snapshots ON DELETE RESTRICT,
 target_sha256 text NOT NULL CHECK(target_sha256 ~ '^[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE snap_receipt.authority_grants(
 id uuid PRIMARY KEY, snapshot_id uuid NOT NULL REFERENCES snap_receipt.snapshots ON DELETE RESTRICT,
 operator_id uuid NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
 instruction_sha256 text NOT NULL CHECK(instruction_sha256 ~ '^[0-9a-f]{64}$'),
 valid_until timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(valid_until>created_at)
);
CREATE TABLE snap_receipt.reviews(
 id uuid PRIMARY KEY, snapshot_id uuid NOT NULL REFERENCES snap_receipt.snapshots ON DELETE RESTRICT,
 grant_id uuid NOT NULL REFERENCES snap_receipt.authority_grants ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
 selection_sha256 text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('reviewed','held')),
 review_method text NOT NULL CHECK(review_method='agent_original_crosscheck'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),command_sha256 text NOT NULL,
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE snap_receipt.acceptances(
 id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES snap_receipt.snapshots ON DELETE RESTRICT,
 review_id uuid NOT NULL REFERENCES snap_receipt.reviews ON DELETE RESTRICT,grant_id uuid NOT NULL REFERENCES snap_receipt.authority_grants ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users ON DELETE RESTRICT,consumer_user_id uuid NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
 consumer_org_id uuid NOT NULL REFERENCES public.organizations ON DELETE RESTRICT,
 purpose text NOT NULL CHECK(purpose='crm'),selection_sha256 text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),valid_until timestamptz NOT NULL,
 command_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(valid_until>created_at)
);
CREATE INDEX receipt_customer_acceptances ON snap_receipt.acceptances(consumer_user_id,snapshot_id);
CREATE TABLE snap_receipt.revocations(
 id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES snap_receipt.snapshots ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('snapshot','grant','acceptance','mapping')),
 target_id text NOT NULL,evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),command_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(kind,target_id)
);
CREATE TABLE snap_receipt.crm_links(
 id uuid PRIMARY KEY,acceptance_id uuid NOT NULL REFERENCES snap_receipt.acceptances ON DELETE RESTRICT,
 source_property_key text NOT NULL REFERENCES snap_receipt.property_mappings ON DELETE RESTRICT,
 property_id uuid NOT NULL REFERENCES public.properties ON DELETE RESTRICT,
 consumer_user_id uuid NOT NULL REFERENCES auth.users ON DELETE RESTRICT,org_id uuid NOT NULL REFERENCES public.organizations ON DELETE RESTRICT,
 lead_id uuid NOT NULL REFERENCES public.leads ON DELETE RESTRICT,activity_id uuid NOT NULL UNIQUE REFERENCES public.lead_activities ON DELETE RESTRICT,
 command_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(acceptance_id,source_property_key)
);
CREATE INDEX receipt_lead_links ON snap_receipt.crm_links(lead_id,consumer_user_id);
CREATE FUNCTION snap_receipt.immutable_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Receipt source history is immutable' USING ERRCODE='55000'; END $$;
DO $tables$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['snapshots','records','property_mappings','authority_grants','reviews','acceptances','revocations','crm_links'] LOOP
  EXECUTE format('ALTER TABLE snap_receipt.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON snap_receipt.%I FROM PUBLIC,anon,authenticated,service_role',name);
  EXECUTE format('CREATE TRIGGER receipt_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_receipt.%I FOR EACH STATEMENT EXECUTE FUNCTION snap_receipt.immutable_history()',name);
 END LOOP;
END $tables$;
CREATE FUNCTION snap_receipt.hash_text(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(v,'UTF8')),'hex') $$;
CREATE FUNCTION snap_receipt.property_digest(p_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT snap_receipt.hash_text(jsonb_build_array(p.id,p.address,p.city,p.state,p.zip)::text) FROM public.properties p WHERE p.id=p_id $$;
CREATE FUNCTION snap_receipt.selection_digest(p_snapshot uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT snap_receipt.hash_text(string_agg(version_id,E'\n' ORDER BY record_key)) FROM snap_receipt.records WHERE snapshot_id=p_snapshot $$;
CREATE FUNCTION snap_receipt.require_actor() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.id=actor AND u.deleted_at IS NULL
  AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
  AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND snap_security.can_access_workspace(p.org_id)) THEN
  RAISE EXCEPTION 'Receipt source access unavailable' USING ERRCODE='42501';END IF;
 RETURN actor;
END $$;
CREATE FUNCTION snap_receipt.require_manager(p_snapshot uuid) RETURNS snap_receipt.authority_grants LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;g snap_receipt.authority_grants%ROWTYPE;BEGIN
 actor:=snap_receipt.require_actor();PERFORM pg_advisory_xact_lock(810208,1);actor:=snap_receipt.require_actor();
 SELECT * INTO g FROM snap_receipt.authority_grants x WHERE x.snapshot_id=p_snapshot AND x.operator_id=actor AND x.valid_until>clock_timestamp()
  AND NOT EXISTS(SELECT 1 FROM snap_receipt.revocations v WHERE v.kind='grant' AND v.target_id=x.id::text)
  ORDER BY x.created_at DESC,x.id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt source authority unavailable' USING ERRCODE='42501';END IF;RETURN g;
END $$;
CREATE FUNCTION snap_receipt.require_acceptance(p_acceptance uuid) RETURNS snap_receipt.acceptances LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;a snap_receipt.acceptances%ROWTYPE;BEGIN
 actor:=snap_receipt.require_actor();PERFORM pg_advisory_xact_lock_shared(810208,1);actor:=snap_receipt.require_actor();
 SELECT * INTO a FROM snap_receipt.acceptances WHERE id=p_acceptance;
 IF NOT FOUND OR a.consumer_user_id<>actor OR a.purpose<>'crm' OR a.valid_until<=clock_timestamp()
  OR NOT snap_security.can_access_workspace(a.consumer_org_id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=actor AND org_id=a.consumer_org_id)
  OR EXISTS(SELECT 1 FROM snap_receipt.revocations v WHERE (v.kind='acceptance' AND v.target_id=a.id::text)
   OR(v.kind='grant' AND v.target_id=a.grant_id::text) OR(v.kind='snapshot' AND v.target_id=a.snapshot_id::text))
  OR NOT EXISTS(SELECT 1 FROM snap_receipt.authority_grants g JOIN auth.users u ON u.id=g.operator_id
   JOIN public.profiles op ON op.user_id=u.id JOIN snap_security.workspace_owners ow ON ow.user_id=u.id AND ow.org_id=op.org_id
   WHERE g.id=a.grant_id AND g.snapshot_id=a.snapshot_id AND g.operator_id=a.actor_id AND g.valid_until>clock_timestamp()
   AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()))
  OR NOT EXISTS(SELECT 1 FROM snap_receipt.reviews r WHERE r.id=a.review_id AND r.snapshot_id=a.snapshot_id
   AND r.grant_id=a.grant_id AND r.outcome='reviewed' AND r.selection_sha256=a.selection_sha256
   AND r.sequence=(SELECT max(sequence) FROM snap_receipt.reviews WHERE snapshot_id=a.snapshot_id))
  OR NOT EXISTS(SELECT 1 FROM snap_receipt.snapshots s WHERE s.id=a.snapshot_id AND s.selection_sha256=a.selection_sha256
   AND s.reviewed_count=(SELECT count(*) FROM snap_receipt.records WHERE snapshot_id=s.id)
   AND s.selection_sha256=snap_receipt.selection_digest(s.id))
  OR EXISTS(SELECT 1 FROM snap_receipt.records r LEFT JOIN snap_receipt.property_mappings m USING(source_property_key)
   WHERE r.snapshot_id=a.snapshot_id AND (m.property_id IS NULL OR m.target_sha256 IS DISTINCT FROM snap_receipt.property_digest(m.property_id)
    OR EXISTS(SELECT 1 FROM snap_receipt.revocations v WHERE v.kind='mapping' AND v.target_id=r.source_property_key))) THEN
  RAISE EXCEPTION 'Receipt source acceptance unavailable' USING ERRCODE='42501';END IF;
 RETURN a;
END $$;

-- Direct reviewed SQL only. Not callable through the public HTTP schema or service role.
-- Imported facts are revalidated here; archive bytes and the actual review remain external evidence.
CREATE FUNCTION snap_receipt.register_snapshot(p_snapshot jsonb,p_records jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s snap_receipt.snapshots%ROWTYPE;r jsonb;desc_text text;rk text;vk text;pk text;pid uuid;old_pid uuid;n integer;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed SQL registration only' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(810208,1);
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR jsonb_typeof(p_records) IS DISTINCT FROM 'array'
  OR octet_length(p_snapshot::text)+octet_length(p_records::text)>4000000 OR jsonb_array_length(p_records) NOT BETWEEN 1 AND 1000
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_snapshot) k) IS DISTINCT FROM ARRAY[
   'agency_key','archive_id','archive_manifest_sha256','archive_verification_sha256','evidence_kind','held_count','id','original_count','original_sha256',
   'parent_snapshot_id','period_end','period_start','receipt_id','received_at','report_date','request_id','reviewed_count','selection_sha256','source_job_id']::text[] THEN
  RAISE EXCEPTION 'Invalid receipt snapshot envelope' USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM jsonb_populate_record(NULL::snap_receipt.snapshots,p_snapshot);
 IF s.id IS NULL OR s.receipt_id IS NULL OR s.source_job_id IS NULL OR s.request_id IS NULL OR s.archive_id IS NULL
  OR s.agency_key IS DISTINCT FROM 'us:mi:madisonheights' OR s.reviewed_count IS DISTINCT FROM jsonb_array_length(p_records)
  OR s.received_at IS NULL OR s.received_at>clock_timestamp()+interval '5 minutes'
  OR s.report_date IS NULL OR s.report_date>(s.received_at AT TIME ZONE 'UTC')::date+1
  OR s.period_start IS NULL OR s.period_end IS NULL OR s.period_start>s.period_end OR s.period_end>s.report_date
  OR s.original_count IS NULL OR s.held_count IS NULL OR s.original_count<>s.reviewed_count+s.held_count
  OR (s.parent_snapshot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM snap_receipt.snapshots old WHERE old.id=s.parent_snapshot_id
     AND old.agency_key=s.agency_key AND old.report_date<s.report_date AND old.evidence_kind=s.evidence_kind)) THEN
  RAISE EXCEPTION 'Receipt snapshot facts do not reconcile' USING ERRCODE='22023';END IF;
 -- Retry is an explicit conflict: registration is root-only and reconciliation reads
 -- the stored selection before any retry. No silent overwrite or unverified replay.
 s.registered_at:=clock_timestamp();INSERT INTO snap_receipt.snapshots SELECT (s).*;
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) IS DISTINCT FROM ARRAY[
   'address','case_id','category','city','cleaned_description','cleaned_sha256','cleaning_rule_version','closed_date','filed_date','record_key',
   'source_parcel_reference','source_property_key','source_row_sha256','source_rows','source_status','state','version_id']::text[]
   OR r->>'case_id' IS NULL OR r->>'case_id' !~ '^E[0-9]{2}-[0-9]{5}$'
   OR r->>'address' IS NULL OR r->>'address' !~ '^[0-9]+[A-Za-z]? [A-Za-z0-9 .#/-]{2,160}$'
   OR r->>'source_parcel_reference' IS NULL OR r->>'source_parcel_reference' !~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}-[0-9]{3}$'
   OR r->>'city' IS DISTINCT FROM 'Madison Heights' OR r->>'state' IS DISTINCT FROM 'MI'
   OR r->>'category' IS NULL OR NOT(r->>'category'=ANY(ARRAY['OTHER','LANDLORD LICENSE','IPMC','DEBRIS','WEEDS','UNLIC/INOPS','PARK UNAP. SURFACE','SIGNS','VEGETATION OVER SIDWALK','12 HR TRASH REMOVAL','TRASH','NO C/O','BRUSH AT CURB','ANIMAL','BUSINESS LICENSE','DANG/DEAD/DIS TREES','VACANT','FENCES','OUTDOOR STORAGE','RODENTS','NO PERMIT','GROUND FEEDING']))
   OR r->>'source_status' IS NULL OR NOT(r->>'source_status'=ANY(ARRAY['COMPLIED','VIOLATION','NO VIOLATION SEEN','CANCELLED','']))
   OR r->>'filed_date' IS NULL OR (r->>'filed_date')::date NOT BETWEEN s.period_start AND s.period_end
   OR (r->>'closed_date')::date<(r->>'filed_date')::date OR (r->>'closed_date')::date>s.report_date
   OR r->>'cleaning_rule_version' IS DISTINCT FROM 'record-privacy-v1:madison-heights-enforcement-list-v1'
   OR r->>'source_row_sha256' IS NULL OR r->>'source_row_sha256' !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(r->'source_rows') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'source_rows')<>2
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'source_rows') x WHERE jsonb_typeof(x)<>'number' OR x::text !~ '^[1-9][0-9]{0,5}$') THEN
   RAISE EXCEPTION 'Receipt case facts are incomplete or unreviewed' USING ERRCODE='22023';END IF;
  IF (r->'source_rows'->>0)::integer<4 OR ((r->'source_rows'->>0)::integer-4)%2<>0 OR (r->'source_rows'->>1)::integer<>(r->'source_rows'->>0)::integer+1
   OR (r->'source_rows'->>1)::integer>s.original_count*2+3 THEN
   RAISE EXCEPTION 'Receipt source row accounting failed' USING ERRCODE='22023';END IF;
  desc_text:='Agency enforcement case category: '||(r->>'category')||'. '||CASE WHEN r->>'source_status'=''
   THEN 'The agency did not supply a case status.' ELSE 'Agency status: '||(r->>'source_status')||'.' END;
  rk:=snap_receipt.hash_text('["'||s.agency_key||'","case","'||(r->>'case_id')||'"]');
  vk:=snap_receipt.hash_text(rk||s.original_sha256||(r->>'source_row_sha256')||(r->>'cleaning_rule_version'));
  pk:=snap_receipt.hash_text(s.agency_key||chr(31)||(r->>'source_parcel_reference')||chr(31)||upper(regexp_replace(btrim(r->>'address'),'\s+',' ','g')));
  IF r->>'record_key' IS DISTINCT FROM rk OR r->>'version_id' IS DISTINCT FROM vk OR r->>'source_property_key' IS DISTINCT FROM pk
   OR r->>'cleaned_description' IS DISTINCT FROM desc_text OR r->>'cleaned_sha256' IS DISTINCT FROM snap_receipt.hash_text(to_json(desc_text)::text)
   OR EXISTS(SELECT 1 FROM snap_receipt.records old JOIN snap_receipt.snapshots old_s ON old_s.id=old.snapshot_id
    WHERE (old.record_key=rk AND old.source_property_key<>pk) OR((old.record_key=rk OR old.source_property_key=pk) AND old_s.evidence_kind<>s.evidence_kind)) THEN
   RAISE EXCEPTION 'Receipt identity or cleaning proof mismatch' USING ERRCODE='22023';END IF;
  SELECT property_id INTO old_pid FROM snap_receipt.property_mappings WHERE source_property_key=pk;
  IF old_pid IS NOT NULL AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id=old_pid AND
    (upper(regexp_replace(btrim(p.address),'\s+',' ','g'))<>upper(regexp_replace(btrim(r->>'address'),'\s+',' ','g')) OR p.city<>r->>'city' OR p.state<>r->>'state')) THEN
   RAISE EXCEPTION 'Receipt property mapping conflict' USING ERRCODE='22023';END IF;
  INSERT INTO snap_receipt.records VALUES(s.id,rk,vk,pk,r->>'case_id',r->>'address',r->>'city',r->>'state',r->>'source_parcel_reference',
   r->>'category',r->>'source_status',(r->>'filed_date')::date,(r->>'closed_date')::date,desc_text,r->>'cleaned_sha256',r->>'cleaning_rule_version',r->>'source_row_sha256',r->'source_rows');
  IF old_pid IS NULL THEN
   INSERT INTO public.properties(address,city,state) VALUES(r->>'address',r->>'city',r->>'state') RETURNING id INTO pid;
   INSERT INTO snap_receipt.property_mappings VALUES(pk,pid,s.id,snap_receipt.property_digest(pid),clock_timestamp());
  END IF;
 END LOOP;
 IF s.selection_sha256 IS DISTINCT FROM snap_receipt.selection_digest(s.id) THEN RAISE EXCEPTION 'Receipt selection digest mismatch' USING ERRCODE='22023';END IF;
 RETURN s.id;
END $$;
CREATE FUNCTION snap_receipt.grant_authority(p_id uuid,p_snapshot uuid,p_operator uuid,p_instruction_sha256 text,p_valid_until timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
 IF current_user<>'postgres' OR p_valid_until IS NULL OR p_valid_until<=clock_timestamp() OR p_valid_until>clock_timestamp()+interval '30 days'
  OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id JOIN snap_security.workspace_owners w ON w.user_id=u.id AND w.org_id=p.org_id
   WHERE u.id=p_operator AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
   AND(u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'Verified scoped authority required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(810208,1);
 INSERT INTO snap_receipt.authority_grants(id,snapshot_id,operator_id,instruction_sha256,valid_until) VALUES(p_id,p_snapshot,p_operator,p_instruction_sha256,p_valid_until);
 RETURN p_id;
END $$;

CREATE FUNCTION public.fn_owner_receipt_case_snapshot_v1(p_snapshot_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g snap_receipt.authority_grants%ROWTYPE;s snap_receipt.snapshots%ROWTYPE;BEGIN
 g:=snap_receipt.require_manager(p_snapshot_id);SELECT * INTO STRICT s FROM snap_receipt.snapshots WHERE id=p_snapshot_id;
 RETURN jsonb_build_object('version','receipt-case-owner-scope-v1','snapshot_id',s.id,'grant_id',g.id,'selection_sha256',s.selection_sha256,
  'evidence_kind',s.evidence_kind,'report_date',s.report_date,'original_count',s.original_count,'reviewed_count',s.reviewed_count,'held_count',s.held_count,
  'property_count',(SELECT count(DISTINCT source_property_key) FROM snap_receipt.records WHERE snapshot_id=s.id),
  'archive_verification_sha256',s.archive_verification_sha256,'review_method','agent_original_crosscheck');
END $$;
CREATE FUNCTION public.fn_review_receipt_case_snapshot_v1(p_command_id uuid,p_snapshot_id uuid,p_expected_selection_sha256 text,p_outcome text,p_evidence_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g snap_receipt.authority_grants%ROWTYPE;s snap_receipt.snapshots%ROWTYPE;cmd text;prior snap_receipt.reviews%ROWTYPE;BEGIN
 g:=snap_receipt.require_manager(p_snapshot_id);SELECT * INTO STRICT s FROM snap_receipt.snapshots WHERE id=p_snapshot_id;
 IF p_command_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN('reviewed','held') OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
  OR p_expected_selection_sha256 IS DISTINCT FROM s.selection_sha256 OR s.selection_sha256 IS DISTINCT FROM snap_receipt.selection_digest(s.id)
  OR s.reviewed_count<>(SELECT count(*) FROM snap_receipt.records WHERE snapshot_id=s.id)
  OR EXISTS(SELECT 1 FROM snap_receipt.revocations WHERE kind='snapshot' AND target_id=s.id::text) THEN
  RAISE EXCEPTION 'Reviewed receipt selection unavailable' USING ERRCODE='22023';END IF;
 cmd:=snap_receipt.hash_text(jsonb_build_array(auth.uid(),g.id,s.id,s.selection_sha256,p_outcome,p_evidence_sha256)::text);
 SELECT * INTO prior FROM snap_receipt.reviews WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Receipt review command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('review_id',prior.id,'snapshot_id',s.id,'outcome',prior.outcome,'replayed',true);
 END IF;
 INSERT INTO snap_receipt.reviews(id,snapshot_id,grant_id,actor_id,selection_sha256,outcome,review_method,evidence_sha256,command_sha256)
 VALUES(p_command_id,s.id,g.id,auth.uid(),s.selection_sha256,p_outcome,'agent_original_crosscheck',p_evidence_sha256,cmd);
 RETURN jsonb_build_object('review_id',p_command_id,'snapshot_id',s.id,'outcome',p_outcome,'replayed',false);
END $$;
CREATE FUNCTION public.fn_accept_receipt_case_snapshot_v1(p_command_id uuid,p_review_id uuid,p_consumer_user_id uuid,p_purpose text,p_valid_until timestamptz,p_evidence_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r snap_receipt.reviews%ROWTYPE;g snap_receipt.authority_grants%ROWTYPE;org uuid;cmd text;prior snap_receipt.acceptances%ROWTYPE;BEGIN
 SELECT * INTO r FROM snap_receipt.reviews WHERE id=p_review_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt review unavailable' USING ERRCODE='42501';END IF;
 g:=snap_receipt.require_manager(r.snapshot_id);
 -- Re-read after the lock; a stale review or replacement authority cannot authorize an acceptance.
 SELECT * INTO STRICT r FROM snap_receipt.reviews WHERE id=p_review_id;
 IF p_command_id IS NULL OR p_purpose IS DISTINCT FROM 'crm' OR p_valid_until IS NULL
  OR p_valid_until<=clock_timestamp() OR p_valid_until>g.valid_until OR p_valid_until>clock_timestamp()+interval '30 days'
  OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' OR r.grant_id<>g.id OR r.actor_id<>auth.uid() OR r.outcome<>'reviewed'
  OR r.sequence<>(SELECT max(sequence) FROM snap_receipt.reviews WHERE snapshot_id=r.snapshot_id)
  OR EXISTS(SELECT 1 FROM snap_receipt.revocations v WHERE v.kind='snapshot' AND v.target_id=r.snapshot_id::text)
  OR r.selection_sha256 IS DISTINCT FROM snap_receipt.selection_digest(r.snapshot_id) THEN
  RAISE EXCEPTION 'Current reviewed receipt and authority required' USING ERRCODE='42501';END IF;
 SELECT p.org_id INTO org FROM public.profiles p JOIN auth.users u ON u.id=p.user_id
  JOIN snap_security.workspace_owners w ON w.user_id=p.user_id AND w.org_id=p.org_id
  WHERE u.id=p_consumer_user_id AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
   AND(u.banned_until IS NULL OR u.banned_until<=clock_timestamp());
 IF org IS NULL THEN RAISE EXCEPTION 'Verified private consumer required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM snap_receipt.records r2 LEFT JOIN snap_receipt.property_mappings m USING(source_property_key)
   WHERE r2.snapshot_id=r.snapshot_id AND (m.property_id IS NULL OR m.target_sha256 IS DISTINCT FROM snap_receipt.property_digest(m.property_id)
    OR EXISTS(SELECT 1 FROM snap_receipt.revocations v WHERE v.kind='mapping' AND v.target_id=r2.source_property_key))) THEN
  RAISE EXCEPTION 'Current receipt mappings required' USING ERRCODE='42501';END IF;

 cmd:=snap_receipt.hash_text(jsonb_build_array(auth.uid(),g.id,r.id,r.snapshot_id,r.selection_sha256,p_consumer_user_id,org,p_purpose,p_valid_until,p_evidence_sha256)::text);
 SELECT * INTO prior FROM snap_receipt.acceptances WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Receipt acceptance command conflicts' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM snap_receipt.revocations WHERE kind='acceptance' AND target_id=prior.id::text) THEN
   RAISE EXCEPTION 'Receipt acceptance unavailable' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('acceptance_id',prior.id,'snapshot_id',r.snapshot_id,'purpose','crm','replayed',true);
 END IF;
 INSERT INTO snap_receipt.acceptances(id,snapshot_id,review_id,grant_id,actor_id,consumer_user_id,consumer_org_id,purpose,selection_sha256,evidence_sha256,valid_until,command_sha256)
 VALUES(p_command_id,r.snapshot_id,r.id,g.id,auth.uid(),p_consumer_user_id,org,'crm',r.selection_sha256,p_evidence_sha256,p_valid_until,cmd);
 RETURN jsonb_build_object('acceptance_id',p_command_id,'snapshot_id',r.snapshot_id,'purpose','crm','replayed',false);
END $$;
CREATE FUNCTION public.fn_revoke_receipt_case_decision_v1(p_command_id uuid,p_snapshot_id uuid,p_kind text,p_target_id text,p_evidence_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g snap_receipt.authority_grants%ROWTYPE;cmd text;prior snap_receipt.revocations%ROWTYPE;valid boolean:=false;BEGIN
 g:=snap_receipt.require_manager(p_snapshot_id);
 IF p_command_id IS NULL OR p_kind IS NULL OR p_target_id IS NULL OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid receipt revocation' USING ERRCODE='22023';END IF;
 CASE p_kind
 WHEN 'snapshot' THEN valid:=p_target_id=p_snapshot_id::text;
 WHEN 'grant' THEN valid:=EXISTS(SELECT 1 FROM snap_receipt.authority_grants WHERE id::text=p_target_id AND snapshot_id=p_snapshot_id);
 WHEN 'acceptance' THEN valid:=EXISTS(SELECT 1 FROM snap_receipt.acceptances WHERE id::text=p_target_id AND snapshot_id=p_snapshot_id);
 WHEN 'mapping' THEN valid:=EXISTS(SELECT 1 FROM snap_receipt.records WHERE source_property_key=p_target_id AND snapshot_id=p_snapshot_id);
 ELSE valid:=false;END CASE;
 IF NOT valid THEN RAISE EXCEPTION 'Receipt revocation target unavailable' USING ERRCODE='42501';END IF;
 cmd:=snap_receipt.hash_text(jsonb_build_array(auth.uid(),p_snapshot_id,p_kind,p_target_id,p_evidence_sha256)::text);
 SELECT * INTO prior FROM snap_receipt.revocations WHERE id=p_command_id OR(kind=p_kind AND target_id=p_target_id) LIMIT 1;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Receipt revocation command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('revocation_id',prior.id,'replayed',true);
 END IF;
 INSERT INTO snap_receipt.revocations(id,snapshot_id,actor_id,kind,target_id,evidence_sha256,command_sha256)
 VALUES(p_command_id,p_snapshot_id,auth.uid(),p_kind,p_target_id,p_evidence_sha256,cmd);
 RETURN jsonb_build_object('revocation_id',p_command_id,'replayed',false);
END $$;

CREATE FUNCTION snap_receipt.is_receipt_property(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM snap_receipt.property_mappings WHERE property_id=p_id) $$;
CREATE FUNCTION snap_receipt.lead_owned(p_lead uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 BEGIN PERFORM snap_receipt.require_actor();EXCEPTION WHEN SQLSTATE '42501' THEN RETURN false;END;
 RETURN EXISTS(SELECT 1 FROM snap_receipt.crm_links x JOIN public.leads l ON l.id=x.lead_id JOIN public.profiles p ON p.user_id=auth.uid()
  WHERE x.lead_id=p_lead AND x.consumer_user_id=auth.uid() AND l.created_by=auth.uid() AND x.org_id=l.org_id AND p.org_id=l.org_id
   AND snap_security.can_access_workspace(l.org_id));
END $$;
CREATE FUNCTION snap_receipt.activity_visible(p_activity uuid,p_lead uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x snap_receipt.crm_links%ROWTYPE;BEGIN
 SELECT * INTO x FROM snap_receipt.crm_links WHERE activity_id=p_activity;
 IF NOT FOUND THEN RETURN true;END IF;
 IF x.lead_id<>p_lead OR NOT snap_receipt.lead_owned(p_lead) THEN RETURN false;END IF;
 BEGIN PERFORM snap_receipt.require_acceptance(x.acceptance_id);RETURN true;EXCEPTION WHEN SQLSTATE '42501' THEN RETURN false;END;
END $$;
-- Add receipt classification without turning a mapped source into an ordinary property.
CREATE OR REPLACE FUNCTION public.fn_is_source_property_v1(p_property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings WHERE customer_property_id=p_property_id AND created_for_source)
  OR snap_receipt.is_receipt_property(p_property_id) $$;
-- Retain the existing customer-private legacy lead behavior, with a new receipt branch.
CREATE OR REPLACE FUNCTION public.fn_source_lead_visible_v1(p_lead_id uuid,p_property_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF auth.uid() IS NULL THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM snap_receipt.crm_links WHERE lead_id=p_lead_id) THEN RETURN snap_receipt.lead_owned(p_lead_id);END IF;
 IF NOT EXISTS(SELECT 1 FROM snap_relaunch.source_crm_links WHERE lead_id=p_lead_id) THEN
  RETURN NOT public.fn_is_source_property_v1(coalesce(p_property_id,(SELECT property_id FROM public.leads WHERE id=p_lead_id)));END IF;
 RETURN EXISTS(SELECT 1 FROM snap_relaunch.source_crm_links s JOIN public.leads l ON l.id=s.lead_id JOIN public.profiles p ON p.user_id=auth.uid()
  WHERE s.lead_id=p_lead_id AND s.consumer_user_id=auth.uid() AND l.created_by=auth.uid() AND l.org_id=s.org_id AND p.org_id=s.org_id AND snap_security.can_access_workspace(s.org_id));
END $$;
ALTER POLICY source_property_account_fence_v1 ON public.properties
 USING(CASE WHEN snap_receipt.is_receipt_property(id) THEN false ELSE public.fn_source_property_visible_v1(id) END)
 WITH CHECK(CASE WHEN snap_receipt.is_receipt_property(id) THEN false ELSE public.fn_source_property_visible_v1(id) END);
-- Receipt addresses never enter generic property-table clients or caches.
-- Only the caller-scoped list/detail/handoff definers can read these properties.
CREATE POLICY receipt_case_activity_fence_v1 ON public.lead_activities AS RESTRICTIVE FOR ALL TO authenticated
 USING(snap_receipt.activity_visible(id,lead_id)) WITH CHECK(snap_receipt.activity_visible(id,lead_id));
CREATE FUNCTION snap_receipt.protect_customer_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF TG_TABLE_NAME='leads' AND EXISTS(SELECT 1 FROM snap_receipt.crm_links WHERE lead_id=OLD.id) THEN
  IF TG_OP='DELETE' OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
   RAISE EXCEPTION 'Receipt lead identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='lead_activities' AND EXISTS(SELECT 1 FROM snap_receipt.crm_links WHERE activity_id=OLD.id) THEN
  RAISE EXCEPTION 'Receipt source annotation is immutable' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER receipt_lead_identity BEFORE UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION snap_receipt.protect_customer_history();
CREATE TRIGGER receipt_annotation_identity BEFORE UPDATE OR DELETE ON public.lead_activities FOR EACH ROW EXECUTE FUNCTION snap_receipt.protect_customer_history();

CREATE FUNCTION public.fn_my_receipt_case_acceptances_v1() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;candidate record;a snap_receipt.acceptances%ROWTYPE;items jsonb:='[]';BEGIN
 actor:=snap_receipt.require_actor();
 IF (SELECT count(*) FROM snap_receipt.acceptances WHERE consumer_user_id=actor)>1000 THEN
  RAISE EXCEPTION 'Receipt list needs bounded pagination' USING ERRCODE='54000';END IF;
 FOR candidate IN SELECT id FROM snap_receipt.acceptances WHERE consumer_user_id=actor ORDER BY created_at DESC,id LIMIT 1001 LOOP
  BEGIN
   a:=snap_receipt.require_acceptance(candidate.id);
   items:=items||jsonb_build_array((SELECT jsonb_build_object('acceptance_id',a.id,'snapshot_id',s.id,'report_date',s.report_date,
    'reviewed_count',s.reviewed_count,'held_count',s.held_count,'original_count',s.original_count,'valid_until',a.valid_until,'evidence_kind',s.evidence_kind,
    'coverage','reviewed_subset','freshness','dated_snapshot','cadence','unverified') FROM snap_receipt.snapshots s WHERE s.id=a.snapshot_id));
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;END;
 END LOOP;
 IF jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'Receipt list needs bounded pagination' USING ERRCODE='54000';END IF;
 RETURN jsonb_build_object('version','receipt-case-acceptances-v1','acceptances',items);
END $$;
CREATE FUNCTION public.fn_list_receipt_case_properties_v1(p_acceptance_id uuid,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a snap_receipt.acceptances%ROWTYPE;items jsonb;n integer;BEGIN
 a:=snap_receipt.require_acceptance(p_acceptance_id);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000 THEN
  RAISE EXCEPTION 'Invalid receipt page' USING ERRCODE='22023';END IF;
 SELECT count(DISTINCT source_property_key) INTO n FROM snap_receipt.records WHERE snapshot_id=a.snapshot_id;
 SELECT coalesce(jsonb_agg(q.item ORDER BY q.source_property_key),'[]') INTO items FROM(
  SELECT r.source_property_key,jsonb_build_object('source_property_key',r.source_property_key,'property_id',m.property_id,'address',p.address,
   'city',p.city,'state',p.state,'existing_lead_id',(SELECT l.id FROM snap_receipt.crm_links x JOIN public.leads l ON l.id=x.lead_id
    WHERE x.acceptance_id=a.id AND x.source_property_key=r.source_property_key AND x.consumer_user_id=auth.uid()
     AND x.org_id=a.consumer_org_id AND l.created_by=auth.uid() AND l.org_id=x.org_id AND l.property_id=m.property_id),
   'case_count',count(*),'report_date',s.report_date) AS item
  FROM snap_receipt.records r JOIN snap_receipt.property_mappings m USING(source_property_key) JOIN public.properties p ON p.id=m.property_id
  JOIN snap_receipt.snapshots s ON s.id=r.snapshot_id WHERE r.snapshot_id=a.snapshot_id
  GROUP BY r.source_property_key,m.property_id,p.address,p.city,p.state,s.report_date ORDER BY r.source_property_key LIMIT p_limit OFFSET p_offset) q;
 RETURN jsonb_build_object('version','receipt-case-properties-v1','acceptance_id',a.id,'snapshot_id',a.snapshot_id,'total',n,'properties',items);
END $$;
CREATE FUNCTION public.fn_handoff_receipt_case_to_crm_v1(p_request_id uuid,p_acceptance_id uuid,p_source_property_key text,p_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a snap_receipt.acceptances%ROWTYPE;x snap_receipt.crm_links%ROWTYPE;l public.leads%ROWTYPE;
 pid uuid;activity uuid;cmd text;created boolean:=false;BEGIN
 PERFORM snap_receipt.require_actor();
 -- Global source lock precedes all source mutations, including grant/revoke and handoff.
 PERFORM pg_advisory_xact_lock(810208,1);a:=snap_receipt.require_acceptance(p_acceptance_id);
 IF p_request_id IS NULL OR p_source_property_key IS NULL OR p_source_property_key !~ '^[0-9a-f]{64}$'
  OR NOT EXISTS(SELECT 1 FROM snap_receipt.records WHERE snapshot_id=a.snapshot_id AND source_property_key=p_source_property_key)
  OR NOT EXISTS(SELECT 1 FROM public.pipeline_stages WHERE id=p_stage_id AND org_id=a.consumer_org_id) THEN
  RAISE EXCEPTION 'Receipt CRM selection unavailable' USING ERRCODE='42501';END IF;
 cmd:=snap_receipt.hash_text(jsonb_build_array(auth.uid(),a.consumer_org_id,a.id,a.command_sha256,p_source_property_key,p_stage_id)::text);
 SELECT * INTO x FROM snap_receipt.crm_links WHERE id=p_request_id OR(acceptance_id=a.id AND source_property_key=p_source_property_key) ORDER BY id=p_request_id DESC LIMIT 1;
 IF FOUND THEN
  IF x.command_sha256<>cmd THEN RAISE EXCEPTION 'Receipt CRM command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('lead_id',x.lead_id,'activity_id',x.activity_id,'source_link_id',x.id,'created',false,'replayed',true);
 END IF;
 SELECT property_id INTO STRICT pid FROM snap_receipt.property_mappings WHERE source_property_key=p_source_property_key;
 SELECT * INTO l FROM public.leads WHERE org_id=a.consumer_org_id AND property_id=pid FOR UPDATE;
 IF FOUND THEN
  IF l.created_by<>auth.uid() THEN RAISE EXCEPTION 'Receipt CRM owner mismatch' USING ERRCODE='42501';END IF;
 ELSE
  INSERT INTO public.leads(org_id,property_id,stage_id,created_by,assigned_to,source,title)
   SELECT a.consumer_org_id,pid,p_stage_id,auth.uid(),auth.uid(),'receipt_case_snapshot','Reviewed case lead' FROM public.properties p WHERE p.id=pid RETURNING * INTO l;
  created:=true;
 END IF;
 -- A new source revision appends this system annotation; it never updates the lead.
 -- Keep the shared source event discriminator and explicit receipt case kind.
 -- The caller-scoped private account export excludes system activities entirely.
 INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload)
 VALUES(l.id,a.consumer_org_id,auth.uid(),'system',jsonb_build_object('event','source_snapshot_linked','source_kind','receipt_case','snapshot_id',a.snapshot_id,
  'acceptance_id',a.id,'description','Reviewed dated case snapshot linked. No individual violation, current condition or contact action is inferred.')) RETURNING id INTO activity;
 INSERT INTO snap_receipt.crm_links(id,acceptance_id,source_property_key,property_id,consumer_user_id,org_id,lead_id,activity_id,command_sha256)
 VALUES(p_request_id,a.id,p_source_property_key,pid,auth.uid(),a.consumer_org_id,l.id,activity,cmd);
 RETURN jsonb_build_object('lead_id',l.id,'activity_id',activity,'source_link_id',p_request_id,'created',created,'replayed',false);
END $$;
CREATE FUNCTION public.fn_get_receipt_case_crm_detail_v1(p_lead_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x snap_receipt.crm_links%ROWTYPE;a snap_receipt.acceptances%ROWTYPE;s snap_receipt.snapshots%ROWTYPE;cases jsonb;BEGIN
 PERFORM snap_receipt.require_actor();
 IF NOT snap_receipt.lead_owned(p_lead_id) THEN RAISE EXCEPTION 'Receipt CRM detail unavailable' USING ERRCODE='42501';END IF;
 FOR x IN SELECT l.* FROM snap_receipt.crm_links l JOIN snap_receipt.acceptances ac ON ac.id=l.acceptance_id
  JOIN snap_receipt.snapshots ss ON ss.id=ac.snapshot_id WHERE l.lead_id=p_lead_id AND l.consumer_user_id=auth.uid()
  ORDER BY ss.report_date DESC,l.created_at DESC,l.id LOOP
  BEGIN a:=snap_receipt.require_acceptance(x.acceptance_id);EXCEPTION WHEN SQLSTATE '42501' THEN CONTINUE;END;
  SELECT * INTO STRICT s FROM snap_receipt.snapshots WHERE id=a.snapshot_id;
  SELECT jsonb_agg(jsonb_build_object('record_kind','case','record_key',r.record_key,'version_id',r.version_id,'case_id',r.case_id,
   'category',r.category,'status',r.source_status,'filed_date',r.filed_date,'closed_date',r.closed_date,'cleaned_description',r.cleaned_description,
   'cleaned_sha256',r.cleaned_sha256,'cleaning_rule_version',r.cleaning_rule_version,'citation',jsonb_build_object('agency_key',s.agency_key,
   'request_id',s.request_id,'receipt_id',s.receipt_id,'source_job_id',s.source_job_id,'archive_id',s.archive_id,'archive_manifest_sha256',s.archive_manifest_sha256,
   'original_sha256',s.original_sha256,'source_row_sha256',r.source_row_sha256,'source_rows',r.source_rows,'report_date',s.report_date)) ORDER BY r.record_key)
  INTO cases FROM snap_receipt.records r WHERE r.snapshot_id=s.id AND r.source_property_key=x.source_property_key;
  IF cases IS NULL THEN RAISE EXCEPTION 'Receipt CRM detail unavailable' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('version','receipt-case-crm-detail-v1','lead_id',p_lead_id,
   'property',(SELECT jsonb_build_object('id',p.id,'address',p.address,'city',p.city,'state',p.state) FROM public.properties p WHERE p.id=x.property_id),
   'snapshot',jsonb_build_object('snapshot_id',s.id,'acceptance_id',a.id,'valid_until',a.valid_until,'evidence_kind',s.evidence_kind,'report_date',s.report_date,'received_at',s.received_at,'original_count',s.original_count,
    'reviewed_count',s.reviewed_count,'held_count',s.held_count,'coverage','reviewed_subset','freshness','dated_snapshot','cadence','unverified'),
   'cases',cases,'limitations',jsonb_build_array('Case summaries are not individual violation findings or proof of current conditions.',
    'Dated, reviewed subset; omitted cases and later changes are not represented.','Refresh cadence has not been verified.'));
 END LOOP;
 RAISE EXCEPTION 'Receipt CRM detail unavailable' USING ERRCODE='42501';
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA snap_receipt FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA snap_receipt FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION snap_receipt.is_receipt_property(uuid),snap_receipt.activity_visible(uuid,uuid) TO authenticated;
DO $rpc_acl$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN('fn_owner_receipt_case_snapshot_v1','fn_review_receipt_case_snapshot_v1','fn_accept_receipt_case_snapshot_v1',
   'fn_revoke_receipt_case_decision_v1','fn_my_receipt_case_acceptances_v1','fn_list_receipt_case_properties_v1','fn_handoff_receipt_case_to_crm_v1','fn_get_receipt_case_crm_detail_v1') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $rpc_acl$;
NOTIFY pgrst,'reload schema';
COMMIT;
