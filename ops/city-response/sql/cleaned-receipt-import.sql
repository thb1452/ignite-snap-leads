-- Private extension of Snap's existing source workflow. No public property or
-- legacy violation writes, no provider calls, no sending, no original changes.
-- Configuration is installed separately after the isolated tests and real-file proof.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

CREATE TABLE snap_relaunch.receipt_processing_policy_v1 (
 policy_id text PRIMARY KEY CHECK(policy_id='existing-code-receipts-20260923-v1'),
 owner_user_id uuid NOT NULL REFERENCES auth.users(id),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[0-9a-f]{64}$'),
 mode text NOT NULL CHECK(mode IN ('held','proof','automatic')),
 proof_receipt_id uuid NOT NULL,
 instruction_ref text NOT NULL,
 allowed_adapter text NOT NULL CHECK(allowed_adapter='madison-heights-enforcement-list-v1'),
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE snap_relaunch.receipt_imports_v1 (
 receipt_id uuid NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 policy_id text NOT NULL REFERENCES snap_relaunch.receipt_processing_policy_v1,
 owner_user_id uuid NOT NULL REFERENCES auth.users,
 request_id uuid NOT NULL,
 source_job_id uuid NOT NULL,
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
 received_at timestamptz NOT NULL,
 original_row_count integer NOT NULL CHECK(original_row_count BETWEEN 1 AND 2000),
 passing_row_count integer NOT NULL CHECK(passing_row_count BETWEEN 1 AND 2000),
 result jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(receipt_id,payload_sha256)
);
CREATE TABLE snap_relaunch.cleaned_receipt_records_v1 (
 version_id text PRIMARY KEY CHECK(version_id ~ '^[0-9a-f]{64}$'),
 record_key text NOT NULL CHECK(record_key ~ '^[0-9a-f]{64}$'),
 policy_id text NOT NULL REFERENCES snap_relaunch.receipt_processing_policy_v1,
 owner_user_id uuid NOT NULL REFERENCES auth.users,
 agency_key text NOT NULL,
 case_id text NOT NULL,
 record_kind text NOT NULL CHECK(record_kind='case'),
 source_property_key text NOT NULL CHECK(source_property_key ~ '^[0-9a-f]{64}$'),
 customer_property_id uuid REFERENCES public.properties(id),
 address text NOT NULL, city text NOT NULL, state text NOT NULL,
 source_parcel_reference text NOT NULL,
 category text NOT NULL, source_status text NOT NULL,
 filed_date date NOT NULL, closed_date date,
 cleaned_description text NOT NULL,
 cleaned_sha256 text NOT NULL CHECK(cleaned_sha256 ~ '^[0-9a-f]{64}$'),
 cleaning_rule_version text NOT NULL,
 source_row_sha256 text NOT NULL CHECK(source_row_sha256 ~ '^[0-9a-f]{64}$'),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
 source_rows jsonb NOT NULL,
 receipt_id uuid NOT NULL, source_job_id uuid NOT NULL, request_id uuid NOT NULL,
 archive_id uuid NOT NULL, archive_manifest_sha256 text NOT NULL,
 report_date date NOT NULL,
 insight jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_user_id,agency_key,case_id,original_sha256,source_row_sha256,cleaning_rule_version)
);
CREATE INDEX cleaned_receipt_property_history_v1 ON snap_relaunch.cleaned_receipt_records_v1(owner_user_id,source_property_key,report_date DESC);
CREATE INDEX cleaned_receipt_record_history_v1 ON snap_relaunch.cleaned_receipt_records_v1(owner_user_id,record_key,report_date DESC);

ALTER TABLE snap_relaunch.receipt_processing_policy_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_relaunch.receipt_imports_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_relaunch.cleaned_receipt_records_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.receipt_processing_policy_v1,snap_relaunch.receipt_imports_v1,snap_relaunch.cleaned_receipt_records_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION snap_relaunch.reject_receipt_history_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Received-source history is immutable'; END
$fn$;
REVOKE ALL ON FUNCTION snap_relaunch.reject_receipt_history_mutation_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER receipt_imports_immutable_v1 BEFORE UPDATE OR DELETE ON snap_relaunch.receipt_imports_v1
 FOR EACH ROW EXECUTE FUNCTION snap_relaunch.reject_receipt_history_mutation_v1();
CREATE TRIGGER cleaned_records_immutable_v1 BEFORE UPDATE OR DELETE ON snap_relaunch.cleaned_receipt_records_v1
 FOR EACH ROW EXECUTE FUNCTION snap_relaunch.reject_receipt_history_mutation_v1();

-- The narrow worker credential is checked inside the RPC. The public/anon key
-- alone confers no import authority. No role or caller-supplied user ID bypasses it.
CREATE FUNCTION public.fn_import_cleaned_receipt_v1(p_payload_text text,p_payload_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
 p snap_relaunch.receipt_processing_policy_v1%ROWTYPE;
 j jsonb; r jsonb; result jsonb; old_result jsonb; items jsonb='[]'::jsonb;
 h jsonb; secret text; rid uuid; req uuid; job uuid; archive uuid;
 expected_description text; expected_key text; version_key text; property_key text;
 customer_id uuid; matches integer; imported integer=0; held integer=0; replayed integer=0;
 reject_reason text; requested_start date; requested_end date; report_day date;
 original_hash text; candidate_count integer; input_count integer;
 insight jsonb; source_citation jsonb; property_candidates jsonb;
BEGIN
 IF p_payload_text IS NULL OR octet_length(p_payload_text)>4000000
  OR p_payload_sha256 IS NULL OR encode(sha256(convert_to(p_payload_text,'UTF8')),'hex') IS DISTINCT FROM p_payload_sha256 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid cleaned import envelope';
 END IF;
 h:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 secret:=h->>'x-snap-receipt-token';
 IF secret IS NULL OR length(secret)<>64 OR secret !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Private receipt import not authorized';
 END IF;
 j:=p_payload_text::jsonb;
 SELECT * INTO p FROM snap_relaunch.receipt_processing_policy_v1 WHERE policy_id=j->>'policy_id' FOR SHARE;
 IF NOT FOUND OR NOT p.enabled OR p.mode='held'
  OR encode(sha256(convert_to(secret,'UTF8')),'hex') IS DISTINCT FROM p.token_sha256
  OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.owner_user_id AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<statement_timestamp())) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Private receipt import not authorized';
 END IF;
 secret:=NULL; h:=NULL;
 IF jsonb_typeof(j) IS DISTINCT FROM 'object' OR
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(j) k) IS DISTINCT FROM
  ARRAY['adapter_version','agency_key','archive_id','archive_manifest_sha256','archive_verified','input_count','original_sha256','passing_count','period_end','period_start','policy_id','receipt_id','received_at','records','report_date','request_id','source_job_id','version']::text[]
  OR j->>'version' IS DISTINCT FROM 'cleaned-receipt-import-v1'
  OR j->>'adapter_version' IS DISTINCT FROM p.allowed_adapter
  OR j->>'agency_key' IS DISTINCT FROM 'us:mi:madisonheights'
  OR j->'archive_verified' IS DISTINCT FROM 'true'::jsonb
  OR j->>'archive_manifest_sha256' IS NULL OR j->>'archive_manifest_sha256' !~ '^[0-9a-f]{64}$'
  OR j->>'original_sha256' IS NULL OR j->>'original_sha256' !~ '^[0-9a-f]{64}$'
  OR jsonb_typeof(j->'records') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Cleaned import contract mismatch';
 END IF;
 rid:=(j->>'receipt_id')::uuid; req:=(j->>'request_id')::uuid; job:=(j->>'source_job_id')::uuid; archive:=(j->>'archive_id')::uuid;
 IF rid IS NULL OR req IS NULL OR job IS NULL OR archive IS NULL OR (p.mode='proof' AND rid<>p.proof_receipt_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Receipt is outside processing policy';
 END IF;
 requested_start:=(j->>'period_start')::date; requested_end:=(j->>'period_end')::date; report_day:=(j->>'report_date')::date;
 input_count:=(j->>'input_count')::integer; candidate_count:=(j->>'passing_count')::integer; original_hash:=j->>'original_sha256';
 IF requested_start IS NULL OR requested_end IS NULL OR report_day IS NULL OR requested_start>requested_end
  OR input_count IS NULL OR input_count NOT BETWEEN 1 AND 2000 OR candidate_count IS NULL OR candidate_count NOT BETWEEN 1 AND input_count
  OR jsonb_array_length(j->'records')<>candidate_count OR j->>'received_at' IS NULL
  OR (j->>'received_at')::timestamptz>statement_timestamp()+interval '5 minutes'
  OR report_day>((j->>'received_at')::timestamptz AT TIME ZONE 'UTC')::date+1
  OR (SELECT count(DISTINCT x->>'record_key') FROM jsonb_array_elements(j->'records') x)<>candidate_count THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Cleaned import counts or dates do not reconcile';
 END IF;
 -- One lock per agency serializes two workers and new deliveries of the same
 -- cases. An uncertain commit is recovered by this immutable receipt identity.
 PERFORM pg_advisory_xact_lock(hashtextextended('cleaned-receipt-v1:'||(j->>'agency_key'),0));
 SELECT i.result INTO old_result FROM snap_relaunch.receipt_imports_v1 i WHERE i.receipt_id=rid AND i.payload_sha256=p_payload_sha256;
 IF FOUND THEN RETURN old_result||jsonb_build_object('status','replayed'); END IF;
 IF EXISTS(SELECT 1 FROM snap_relaunch.receipt_imports_v1 i WHERE i.receipt_id=rid) THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Receipt import differs from its saved version';
 END IF;
 SELECT coalesce(jsonb_agg(s),'[]'::jsonb) INTO property_candidates FROM
  (SELECT pr.id,pr.address FROM public.properties pr WHERE pr.state='MI' AND lower(pr.city)='madison heights' LIMIT 10001) s;
 IF jsonb_array_length(property_candidates)>10000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='Source property matching needs review'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(j->'records') LOOP
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) IS DISTINCT FROM
    ARRAY['accuracy_status','address','case_id','category','city','cleaned_description','closed_date','evidence','filed_date','parcel_id','privacy','record_key','record_kind','review_reasons','source_status','state']::text[]
   OR r->>'record_kind' IS DISTINCT FROM 'case' OR r->>'city' IS DISTINCT FROM 'Madison Heights' OR r->>'state' IS DISTINCT FROM 'MI'
   OR r->>'accuracy_status' IS DISTINCT FROM 'passed' OR r->'review_reasons' IS DISTINCT FROM '[]'::jsonb
   OR r->>'case_id' IS NULL OR r->>'case_id' !~ '^E[0-9]{2}-[0-9]{5}$'
   OR r->>'parcel_id' IS NULL OR r->>'parcel_id' !~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}-[0-9]{3}$'
   OR r->>'address' IS NULL OR r->>'address' !~ '^[0-9]+[A-Za-z]? [A-Za-z0-9 .#/-]{2,160}$'
   OR r->>'category' IS NULL OR NOT (r->>'category'=ANY(ARRAY['OTHER','LANDLORD LICENSE','IPMC','DEBRIS','WEEDS','UNLIC/INOPS','PARK UNAP. SURFACE','SIGNS','VEGETATION OVER SIDWALK','12 HR TRASH REMOVAL','TRASH','NO C/O','BRUSH AT CURB','ANIMAL','BUSINESS LICENSE','DANG/DEAD/DIS TREES','VACANT','FENCES','OUTDOOR STORAGE','RODENTS','NO PERMIT','GROUND FEEDING']))
   OR r->>'source_status' IS NULL OR NOT (r->>'source_status'=ANY(ARRAY['COMPLIED','VIOLATION','NO VIOLATION SEEN','CANCELLED','']))
   OR r->>'filed_date' IS NULL OR (r->>'filed_date')::date NOT BETWEEN requested_start AND requested_end
   OR (r->>'filed_date')::date>report_day
   OR (r->>'closed_date')::date<(r->>'filed_date')::date OR (r->>'closed_date')::date>report_day THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Cleaned record facts are incomplete or unreviewed';
  END IF;
  expected_description:='Agency enforcement case category: '||(r->>'category')||'. '||
   CASE WHEN r->>'source_status'='' THEN 'The agency did not supply a case status.' ELSE 'Agency status: '||(r->>'source_status')||'.' END;
  expected_key:=encode(sha256(convert_to('["'||(j->>'agency_key')||'","case","'||(r->>'case_id')||'"]','UTF8')),'hex');
  IF r->>'record_key' IS DISTINCT FROM expected_key OR r->>'cleaned_description' IS DISTINCT FROM expected_description
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r->'privacy') k) IS DISTINCT FROM
      ARRAY['cleaned_description','cleaned_hash','original_hash','reasons','rule_version','rules','status']::text[]
   OR r->'privacy'->>'cleaned_description' IS DISTINCT FROM expected_description
   OR r->'privacy'->'rules' IS DISTINCT FROM '["closed_category_allowlist","closed_status_allowlist","no_narrative_in_source_schema","exclude_parcel_from_description"]'::jsonb
   OR r->'privacy'->>'status' IS DISTINCT FROM 'passed'
   OR r->'privacy'->>'rule_version' IS DISTINCT FROM 'record-privacy-v1:madison-heights-enforcement-list-v1'
   OR r->'privacy'->>'original_hash' IS DISTINCT FROM encode(sha256(convert_to('null','UTF8')),'hex')
   OR r->'privacy'->>'cleaned_hash' IS DISTINCT FROM encode(sha256(convert_to(to_json(expected_description)::text,'UTF8')),'hex')
   OR r->'privacy'->'reasons' IS DISTINCT FROM '[]'::jsonb
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r->'evidence') k) IS DISTINCT FROM
      ARRAY['adapter_version','agency_key','original_sha256','receipt_id','request_id','source_row_hash','source_rows']::text[]
   OR r->'evidence'->>'agency_key' IS DISTINCT FROM j->>'agency_key'
   OR r->'evidence'->>'original_sha256' IS DISTINCT FROM original_hash
   OR r->'evidence'->>'receipt_id' IS DISTINCT FROM rid::text OR r->'evidence'->>'request_id' IS DISTINCT FROM req::text
   OR r->'evidence'->>'adapter_version' IS DISTINCT FROM p.allowed_adapter
   OR r->'evidence'->>'source_row_hash' IS NULL OR r->'evidence'->>'source_row_hash' !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(r->'evidence'->'source_rows') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'evidence'->'source_rows')<>2
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'evidence'->'source_rows') x WHERE x !~ '^[1-9][0-9]{0,5}$') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Privacy or source evidence does not match cleaned record';
  END IF;
  IF (r->'evidence'->'source_rows'->>0)::integer<4 OR (r->'evidence'->'source_rows'->>1)::integer<>(r->'evidence'->'source_rows'->>0)::integer+1
   OR (r->'evidence'->'source_rows'->>1)::integer>input_count*2+3 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Source row accounting is inconsistent';
  END IF;
  reject_reason:=NULL;
  SELECT count(*),min(pr.id::text)::uuid INTO matches,customer_id FROM jsonb_to_recordset(property_candidates) AS pr(id uuid,address text)
   WHERE upper(regexp_replace(btrim(pr.address),'\s+',' ','g'))=upper(regexp_replace(btrim(r->>'address'),'\s+',' ','g'));
  IF matches>1 THEN reject_reason:='ambiguous_property_match'; END IF;
  property_key:=encode(sha256(convert_to((j->>'agency_key')||chr(31)||(r->>'parcel_id')||chr(31)||upper(regexp_replace(btrim(r->>'address'),'\s+',' ','g')),'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM snap_relaunch.cleaned_receipt_records_v1 c WHERE c.record_key=expected_key
    AND (c.source_property_key<>property_key OR c.owner_user_id<>p.owner_user_id)) THEN reject_reason:='conflicting_case_property'; END IF;
  IF reject_reason IS NOT NULL THEN
   held:=held+1; items:=items||jsonb_build_array(jsonb_build_object('record_key',expected_key,'status','needs_review','reason',reject_reason)); CONTINUE;
  END IF;
  version_key:=encode(sha256(convert_to(expected_key||original_hash||(r->'evidence'->>'source_row_hash')||(r->'privacy'->>'rule_version'),'UTF8')),'hex');
  source_citation:=jsonb_build_object('agency_key',j->>'agency_key','request_id',req,'receipt_id',rid,'source_job_id',job,
    'original_sha256',original_hash,'source_row_sha256',r->'evidence'->>'source_row_hash','source_rows',r->'evidence'->'source_rows',
    'report_date',report_day,'case_id',r->>'case_id','record_kind','case');
  insight:=jsonb_build_object('version','cleaned-private-case-insight-v1','generation_method','source_fact_summary',
   'documented_facts',jsonb_build_array(jsonb_build_object('text',expected_description,'source',source_citation)),
   'possible_investor_implications',jsonb_build_array(jsonb_build_object('text',
     CASE WHEN r->>'source_status'='COMPLIED' THEN 'The agency marks this case complied. Verify current conditions before treating it as active enforcement.'
      WHEN r->>'source_status'='NO VIOLATION SEEN' THEN 'The agency records no violation seen for this case. This entry alone is not evidence of a property defect.'
      WHEN r->>'source_status'='CANCELLED' THEN 'The agency marks this case cancelled. The record does not establish a current enforcement issue.'
      ELSE 'The case may warrant checking current municipal records and the property condition. This case summary does not establish an individual violation or current condition.' END,
     'basis','interpretation_not_documented_condition','source',source_citation)),
   'limitations',jsonb_build_array('Case summary only; no individual violation description was supplied.','No inference about owner intent, occupancy, market value or current property condition.'),
   'cleaned_evidence_only',true,'provider_calls',0);
  IF EXISTS(SELECT 1 FROM snap_relaunch.cleaned_receipt_records_v1 c WHERE c.version_id=version_key) THEN replayed:=replayed+1;
  ELSE
   INSERT INTO snap_relaunch.cleaned_receipt_records_v1(version_id,record_key,policy_id,owner_user_id,agency_key,case_id,record_kind,source_property_key,
     customer_property_id,address,city,state,source_parcel_reference,category,source_status,filed_date,closed_date,cleaned_description,cleaned_sha256,
     cleaning_rule_version,source_row_sha256,original_sha256,source_rows,receipt_id,source_job_id,request_id,archive_id,archive_manifest_sha256,report_date,insight)
   VALUES(version_key,expected_key,p.policy_id,p.owner_user_id,j->>'agency_key',r->>'case_id','case',property_key,customer_id,r->>'address','Madison Heights','MI',
     r->>'parcel_id',r->>'category',r->>'source_status',(r->>'filed_date')::date,(r->>'closed_date')::date,expected_description,r->'privacy'->>'cleaned_hash',
     r->'privacy'->>'rule_version',r->'evidence'->>'source_row_hash',original_hash,r->'evidence'->'source_rows',rid,job,req,archive,j->>'archive_manifest_sha256',report_day,insight);
   imported:=imported+1;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object('record_key',expected_key,'version_id',version_key,'status','insight_ready',
    'property_match',CASE WHEN customer_id IS NULL THEN 'new_private_source_property' ELSE 'existing_exact_property' END));
 END LOOP;
 result:=jsonb_build_object('version','cleaned-receipt-import-v1','status','imported','receipt_id',rid,'payload_sha256',p_payload_sha256,
  'input_count',input_count,'passing_count',candidate_count,'imported',imported,'reused',replayed,'held',held,'items',items,'provider_calls',0);
 INSERT INTO snap_relaunch.receipt_imports_v1(receipt_id,payload_sha256,policy_id,owner_user_id,request_id,source_job_id,original_sha256,received_at,original_row_count,passing_row_count,result)
 VALUES(rid,p_payload_sha256,p.policy_id,p.owner_user_id,req,job,original_hash,(j->>'received_at')::timestamptz,input_count,candidate_count,result);
 RETURN result;
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_import_cleaned_receipt_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_import_cleaned_receipt_v1(text,text) TO anon;

CREATE FUNCTION public.fn_private_cleaned_records_v1(p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE actor uuid:=auth.uid(); result jsonb;
BEGIN
 IF actor IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
  OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
    AND NOT coalesce(u.is_anonymous,false) AND (u.banned_until IS NULL OR u.banned_until<statement_timestamp())) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Private source review unavailable';
 END IF;
 SELECT coalesce(jsonb_agg(q.item ORDER BY q.imported_at DESC,q.version_id),'[]'::jsonb) INTO result FROM (
  SELECT c.imported_at,c.version_id,jsonb_build_object('record_key',c.record_key,'version_id',c.version_id,'record_kind',c.record_kind,'case_id',c.case_id,
   'address',c.address,'city',c.city,'state',c.state,'filed_date',c.filed_date,'closed_date',c.closed_date,'status',c.source_status,
   'cleaned_description',c.cleaned_description,'cleaning_rule_version',c.cleaning_rule_version,'cleaned_sha256',c.cleaned_sha256,
   'receipt_id',c.receipt_id,'source_job_id',c.source_job_id,'insight',c.insight,'state_label','insight_ready') item
  FROM snap_relaunch.cleaned_receipt_records_v1 c JOIN snap_relaunch.receipt_processing_policy_v1 p ON p.policy_id=c.policy_id
  WHERE c.owner_user_id=actor AND p.owner_user_id=actor AND p.enabled
  ORDER BY c.imported_at DESC,c.version_id LIMIT p_limit OFFSET p_offset
 )q;
 RETURN jsonb_build_object('version','private-cleaned-records-v1','records',result,
   'total',(SELECT count(*) FROM snap_relaunch.cleaned_receipt_records_v1 c JOIN snap_relaunch.receipt_processing_policy_v1 p ON p.policy_id=c.policy_id WHERE c.owner_user_id=actor AND p.owner_user_id=actor AND p.enabled));
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_private_cleaned_records_v1(integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_private_cleaned_records_v1(integer,integer) TO authenticated;
COMMIT;
