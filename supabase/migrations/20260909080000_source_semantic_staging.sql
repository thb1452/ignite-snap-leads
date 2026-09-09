-- Successor local candidate; not installed by this preparation.
-- Based on root-supplied native catalog 2026-09-09T12:53:21.341271+00:00.
-- Existing owner RLS, role attributes, table grants and original row payloads are preserved.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.upload_staging ADD COLUMN source_semantics jsonb;
COMMENT ON COLUMN public.upload_staging.source_semantics IS
  'Source-native review evidence, not customer acceptance or a common category. Originals remain in their pinned acquisition archive.';

CREATE TABLE public.upload_source_bindings (
  job_id uuid PRIMARY KEY REFERENCES public.upload_jobs(id),
  reviewer_user_id uuid NOT NULL,
  source_key text NOT NULL CHECK (source_key IN ('syracuse_code_violations_v2','chicago_22u3_xenr')),
  source_event_id text NOT NULL CHECK (length(source_event_id) BETWEEN 1 AND 200),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  collected_at timestamptz NOT NULL,
  review_state text NOT NULL DEFAULT 'pending_review' CHECK (review_state='pending_review'),
  customer_accepted boolean NOT NULL DEFAULT false CHECK (customer_accepted=false),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.upload_source_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_source_bindings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.upload_source_bindings TO service_role;

CREATE FUNCTION public.protect_bound_source_review_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='upload_source_bindings' THEN
    RAISE EXCEPTION 'Source bindings are fixed; prepare a separately reviewed job';
  END IF;
  IF OLD.source_semantics->>'source_key' IN ('syracuse_code_violations_v2','chicago_22u3_xenr') THEN
    RAISE EXCEPTION 'Source review staging is immutable; prepare a new observation or revision';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_bound_source_review_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER source_bindings_immutable BEFORE UPDATE OR DELETE ON public.upload_source_bindings
FOR EACH ROW EXECUTE FUNCTION public.protect_bound_source_review_v1();
CREATE TRIGGER source_review_rows_immutable BEFORE UPDATE OR DELETE ON public.upload_staging
FOR EACH ROW EXECUTE FUNCTION public.protect_bound_source_review_v1();

-- A native owner may INSERT ordinary staging rows. New evidence must remain
-- server-authored even under that existing policy, and on a future allowed UPDATE.
CREATE FUNCTION public.protect_source_semantics_writer_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.source_semantics IS NOT NULL THEN
        RAISE EXCEPTION 'Source semantics can only be authored by service_role' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.source_semantics IS DISTINCT FROM OLD.source_semantics THEN
      RAISE EXCEPTION 'Source semantics can only be changed by service_role' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_source_semantics_writer_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER source_review_evidence_writer BEFORE INSERT OR UPDATE ON public.upload_staging
FOR EACH ROW EXECUTE FUNCTION public.protect_source_semantics_writer_v1();

CREATE FUNCTION public.stage_bound_source_upload_v1(p_job_id uuid,p_original_text text,p_projection jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  binding public.upload_source_bindings%ROWTYPE;
  original jsonb; entry jsonb; raw jsonb; n integer:=0; expected integer; prior integer;
  owner_id uuid; namespace text; raw_key text;
  semantic jsonb; expected_semantic jsonb; expected_dates jsonb; expected_identifiers jsonb;
  date_spec jsonb; date_name text; date_raw jsonb; iso_value text; calendar_value text;
  chicago boolean; raw_type text; description text; original_status text; normalized_status text;
  case_value text; zip_value text; holds jsonb; location_value jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('source-review:'||p_job_id::text,0));
  SELECT * INTO STRICT binding FROM public.upload_source_bindings WHERE job_id=p_job_id;
  SELECT user_id INTO STRICT owner_id FROM public.upload_jobs WHERE id=p_job_id FOR UPDATE;
  IF owner_id IS DISTINCT FROM binding.reviewer_user_id THEN RAISE EXCEPTION 'Source review job owner changed'; END IF;
  IF p_original_text IS NULL OR octet_length(p_original_text) NOT BETWEEN 1 AND 8388608
     OR encode(sha256(convert_to(p_original_text,'UTF8')),'hex') IS DISTINCT FROM binding.input_sha256 THEN
    RAISE EXCEPTION 'Source file bytes do not match operator binding';
  END IF;
  original:=p_original_text::jsonb;
  IF jsonb_typeof(original) IS DISTINCT FROM 'array'
     OR p_projection->>'version' IS DISTINCT FROM 'municipal-source-semantics-v1'
     OR p_projection->>'job_id' IS DISTINCT FROM p_job_id::text
     OR p_projection->>'source_key' IS DISTINCT FROM binding.source_key
     OR p_projection->>'source_event_id' IS DISTINCT FROM binding.source_event_id
     OR p_projection->>'input_sha256' IS DISTINCT FROM binding.input_sha256
     OR (p_projection->>'collected_at')::timestamptz IS DISTINCT FROM binding.collected_at
     OR p_projection->'customer_accepted' IS DISTINCT FROM 'false'::jsonb
     OR p_projection->'usable_records' IS DISTINCT FROM 'false'::jsonb
     OR p_projection->>'review_state' IS DISTINCT FROM 'pending_review'
     OR jsonb_typeof(p_projection->'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Source review projection binding differs';
  END IF;
  expected:=jsonb_array_length(original);
  IF expected NOT BETWEEN 1 AND 2000 OR expected IS DISTINCT FROM (p_projection->>'source_rows')::integer
     OR expected IS DISTINCT FROM jsonb_array_length(p_projection->'rows')
     OR expected<>(SELECT count(DISTINCT value->>'source_record_id') FROM jsonb_array_elements(p_projection->'rows'))
     OR expected<>(SELECT count(DISTINCT value->'source_semantics'->'identifiers'->>'government_violation_id') FROM jsonb_array_elements(p_projection->'rows')) THEN
    RAISE EXCEPTION 'Source review row identities do not reconcile';
  END IF;
  namespace:=CASE binding.source_key WHEN 'chicago_22u3_xenr' THEN 'us-il-chicago-department-of-buildings/22u3-xenr' ELSE 'city-of-syracuse-ny/Code_Violations_V2' END;
  raw_key:=CASE binding.source_key WHEN 'chicago_22u3_xenr' THEN 'id' ELSE 'ObjectId' END;
  SELECT count(*) INTO prior FROM public.upload_staging WHERE job_id=p_job_id;
  IF prior NOT IN (0,expected) THEN RAISE EXCEPTION 'Prior staging count differs; no destructive repair'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_projection->'rows') LOOP
    n:=n+1;raw:=original->(n-1)->'raw_government_attributes';
    IF (original->(n-1) ? 'collection_id' AND original->(n-1)->>'collection_id' IS DISTINCT FROM binding.source_event_id)
       OR (original->(n-1) ? 'collected_at' AND (original->(n-1)->>'collected_at')::timestamptz IS DISTINCT FROM binding.collected_at) THEN
      RAISE EXCEPTION 'Collected row acquisition identity or observation time differs';
    END IF;
    IF (entry->>'source_row')::integer IS DISTINCT FROM n
       OR jsonb_typeof(raw) IS DISTINCT FROM 'object'
       OR entry->>'source_record_id' IS DISTINCT FROM raw->>raw_key
       OR entry->'source_semantics'->'raw_source' IS DISTINCT FROM raw
       OR entry->'source_semantics'->'original_input' IS DISTINCT FROM original->(n-1)
       OR entry->'source_semantics'->>'source_namespace' IS DISTINCT FROM namespace
       OR entry->'source_semantics'->>'source_key' IS DISTINCT FROM binding.source_key
       OR entry->'source_semantics'->>'source_event_id' IS DISTINCT FROM binding.source_event_id
       OR entry->'source_semantics'->'customer_accepted' IS DISTINCT FROM 'false'::jsonb
       OR entry->'source_semantics'->'usable_records' IS DISTINCT FROM 'false'::jsonb
       OR entry->'source_semantics'->>'review_state' IS DISTINCT FROM 'pending_review'
       OR entry->'opened_date' IS DISTINCT FROM 'null'::jsonb
       OR entry->'last_updated' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Original source row or pending semantics differ';
    END IF;
    IF entry->>'violation' IS DISTINCT FROM namespace||'::'||(raw->>(CASE WHEN binding.source_key='chicago_22u3_xenr' THEN 'violation_code' ELSE 'violation' END))
       OR entry->>'raw_description' IS DISTINCT FROM raw->>(CASE WHEN binding.source_key='chicago_22u3_xenr' THEN 'violation_description' ELSE 'violation' END)
       OR entry->>'status' IS DISTINCT FROM raw->>(CASE WHEN binding.source_key='chicago_22u3_xenr' THEN 'violation_status' ELSE 'status_type_name' END)
       OR entry->>'address' IS DISTINCT FROM raw->>(CASE WHEN binding.source_key='chicago_22u3_xenr' THEN 'address' ELSE 'complaint_address' END)
       OR entry->'source_semantics'->'violation_type'->'common_category' IS DISTINCT FROM 'null'::jsonb
       OR entry->'source_semantics'->'insight_eligibility'->'current_enforcement_score' IS DISTINCT FROM 'false'::jsonb THEN
      RAISE EXCEPTION 'Source-native fields were normalized into unsupported meanings';
    END IF;
    IF binding.source_key='syracuse_code_violations_v2' AND
       (entry->>'case_id' IS DISTINCT FROM raw->>'complaint_number' OR entry->>'zip' IS DISTINCT FROM raw->>'complaint_zip') THEN
      RAISE EXCEPTION 'Syracuse case or postal ZIP differs from source';
    END IF;
    IF binding.source_key='chicago_22u3_xenr' AND
       (entry->'case_id' IS DISTINCT FROM 'null'::jsonb OR entry->'zip' IS DISTINCT FROM 'null'::jsonb) THEN
      RAISE EXCEPTION 'Chicago case or postal ZIP must not be manufactured';
    END IF;
    -- Recompute all displayed meanings from the exact pinned original. Keeping raw JSON
    -- beside an unchecked projection is insufficient: this also rejects invented IDs/dates.
    chicago:=binding.source_key='chicago_22u3_xenr';
    semantic:=entry->'source_semantics';
    raw_type:=raw->>(CASE WHEN chicago THEN 'violation_code' ELSE 'violation' END);
    description:=raw->>(CASE WHEN chicago THEN 'violation_description' ELSE 'violation' END);
    original_status:=raw->>(CASE WHEN chicago THEN 'violation_status' ELSE 'status_type_name' END);
    normalized_status:=CASE WHEN chicago THEN CASE original_status WHEN 'OPEN' THEN 'open' WHEN 'COMPLIED' THEN 'complied' WHEN 'NO ENTRY' THEN 'no_entry' END
      ELSE CASE original_status WHEN 'Open' THEN 'open' WHEN 'Closed' THEN 'closed' WHEN 'Void' THEN 'void' END END;
    case_value:=CASE WHEN chicago THEN NULL ELSE raw->>'complaint_number' END;
    zip_value:=CASE WHEN chicago THEN NULL ELSE raw->>'complaint_zip' END;
    expected_identifiers:=jsonb_build_object('source_record_id',raw->>raw_key,
      'government_violation_id',raw->>(CASE WHEN chicago THEN 'id' ELSE 'violation_id' END),
      'published_violation_number',CASE WHEN chicago THEN NULL ELSE raw->>'violation_number' END,
      'case_id',case_value,'case_identifier_available',NOT chicago,
      'inspection_number',CASE WHEN chicago THEN raw->>'inspection_number' ELSE NULL END,
      'property_reference',raw->>(CASE WHEN chicago THEN 'property_group' ELSE 'SBL' END),
      'property_reference_kind',CASE WHEN chicago THEN 'source_address_group' ELSE 'source_parcel_sbl' END);
    expected_dates:='{"citation":null,"case_opened":null,"violation_opened":null,"status_changed":null,"source_modified":null,"compliance_due":null}'::jsonb;
    FOR date_name,date_spec IN SELECT key,value FROM jsonb_each(CASE WHEN chicago THEN
      '{"citation":["violation_date","citation_date"],"status_changed":["violation_status_date","source_violation_status_date"],"source_modified":["violation_last_modified_date","source_record_modified_date"]}'::jsonb
      ELSE '{"citation":["violation_date","citation_date"],"case_opened":["open_date","case_opening_date"],"status_changed":["status_date","source_violation_status_date"],"compliance_due":["comply_by_date","compliance_due_date"]}'::jsonb END) LOOP
      date_raw:=coalesce(raw->(date_spec->>0),'null'::jsonb); iso_value:=NULL;calendar_value:=NULL;
      IF date_raw<>'null'::jsonb THEN
        IF chicago THEN
          IF jsonb_typeof(date_raw)<>'string' OR
             (date_raw#>>'{}'<>'' AND
              (date_raw#>>'{}' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$' OR
               to_char((date_raw#>>'{}')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS')<>left(date_raw#>>'{}',19))) THEN
            RAISE EXCEPTION 'Source civil date type or precision differs';
          END IF;
          calendar_value:=CASE WHEN date_raw#>>'{}'='' THEN NULL ELSE left(date_raw#>>'{}',10) END;
        ELSE
          IF jsonb_typeof(date_raw)<>'number' OR (date_raw#>>'{}')::numeric<>trunc((date_raw#>>'{}')::numeric) THEN
            RAISE EXCEPTION 'Source epoch date type differs';
          END IF;
          iso_value:=to_char(to_timestamp((date_raw#>>'{}')::numeric/1000) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
          calendar_value:=left(iso_value,10);
        END IF;
      END IF;
      expected_dates:=jsonb_set(expected_dates,ARRAY[date_name],jsonb_build_object('meaning',date_spec->>1,'raw',date_raw,
        'iso_utc',iso_value,'calendar_date',calendar_value,'precision',CASE WHEN chicago THEN 'offset_free_calendar_timestamp' ELSE 'millisecond' END,
        'timezone',CASE WHEN chicago THEN NULL ELSE 'UTC' END));
    END LOOP;
    holds:='["customer_acceptance_missing","customer_property_mapping_missing","distribution_review_pending","current_condition_unverified","residential_scope_unverified","common_category_mapping_unreviewed","violation_opening_date_unavailable"]'::jsonb;
    IF normalized_status IS NULL THEN holds:=holds||'"source_status_unmapped"'::jsonb; END IF;
    IF chicago THEN holds:=holds||'["case_identifier_not_supplied","tax_parcel_identity_unverified"]'::jsonb;
    ELSIF case_value IS NULL OR case_value='' THEN holds:=holds||'"case_identifier_missing_in_row"'::jsonb; END IF;
    location_value:=jsonb_build_object('address',raw->>(CASE WHEN chicago THEN 'address' ELSE 'complaint_address' END),
      'city',CASE WHEN chicago THEN 'Chicago' ELSE 'Syracuse' END,'state',CASE WHEN chicago THEN 'IL' ELSE 'NY' END,'zip',zip_value,'unit',NULL);
    expected_semantic:=jsonb_build_object('version','municipal-source-semantics-v1','source_key',binding.source_key,
      'source_namespace',namespace,'source_event_id',binding.source_event_id,
      'source_url',CASE WHEN chicago THEN 'https://data.cityofchicago.org/resource/22u3-xenr.json' ELSE 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0' END,
      'collected_at',p_projection->>'collected_at','source_row',n,'record_grain','source_violation','identifiers',expected_identifiers,
      'violation_type',jsonb_build_object('namespace',namespace,'original_value',raw_type,'value_kind',CASE WHEN chicago THEN 'source_code' ELSE 'source_description' END,
        'namespaced_value',namespace||'::'||raw_type,'source_description',description,'common_category',NULL),
      'text',jsonb_build_object('description',description,'inspector_comments',CASE WHEN chicago THEN raw->>'violation_inspector_comments' ELSE NULL END,
        'ordinance',CASE WHEN chicago THEN raw->>'violation_ordinance' ELSE NULL END,'violation_location',CASE WHEN chicago THEN raw->>'violation_location' ELSE NULL END),
      'status',jsonb_build_object('original',original_status,'normalized',normalized_status,'meaning','source_violation_status_at_collection',
        'inspection_status',CASE WHEN chicago THEN raw->>'inspection_status' ELSE NULL END,'current_condition_proven',false),
      'dates',expected_dates,'location',location_value,'raw_source',raw,'original_input',original->(n-1),
      'review_state','pending_review','customer_accepted',false,'usable_records',false,
      'insight_eligibility','{"source_snapshot_description":true,"current_enforcement_score":false,"violation_days_open":false,"shared_category_comparison":false,"residential_distress":false}'::jsonb,'holds',holds);
    IF semantic IS DISTINCT FROM expected_semantic OR entry->>'city' IS DISTINCT FROM location_value->>'city'
       OR entry->>'state' IS DISTINCT FROM location_value->>'state' THEN
      RAISE EXCEPTION 'Derived source semantic fields differ from pinned raw input';
    END IF;
    IF prior>0 THEN
      IF NOT EXISTS (SELECT 1 FROM public.upload_staging s WHERE s.job_id=p_job_id AND s.row_num=n
        AND s.source_semantics=entry->'source_semantics'
        AND s.address IS NOT DISTINCT FROM entry->>'address' AND s.city IS NOT DISTINCT FROM entry->>'city'
        AND s.state IS NOT DISTINCT FROM entry->>'state' AND s.zip IS NOT DISTINCT FROM entry->>'zip'
        AND s.case_id IS NOT DISTINCT FROM entry->>'case_id' AND s.violation IS NOT DISTINCT FROM entry->>'violation'
        AND s.status IS NOT DISTINCT FROM entry->>'status' AND s.raw_description IS NOT DISTINCT FROM entry->>'raw_description'
        AND s.opened_date IS NULL AND s.last_updated IS NULL AND s.property_id IS NULL) THEN
        RAISE EXCEPTION 'Existing source review bytes differ';
      END IF;
    ELSE
      INSERT INTO public.upload_staging(job_id,row_num,address,city,state,zip,case_id,violation,status,
        opened_date,last_updated,raw_description,processed,property_id,error,source_semantics)
      VALUES(p_job_id,n,entry->>'address',entry->>'city',entry->>'state',entry->>'zip',entry->>'case_id',
        entry->>'violation',entry->>'status',NULL,NULL,entry->>'raw_description',false,NULL,
        'source_review_pending',entry->'source_semantics');
    END IF;
  END LOOP;
  UPDATE public.upload_jobs SET status='COMPLETE',total_rows=expected,processed_rows=expected,
    properties_created=0,properties_matched=0,violations_created=0,violations_updated=0,
    warnings='["Source-native review staged only; no customer import, acceptance, insight or geocoding."]'::jsonb,
    error_message=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_job_id;
  RETURN jsonb_build_object('status',CASE WHEN prior>0 THEN 'review_replayed' ELSE 'review_staged' END,
    'source_rows',expected,'customer_accepted',false,'usable_records',false);
END $$;
REVOKE ALL ON FUNCTION public.stage_bound_source_upload_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_bound_source_upload_v1(uuid,text,jsonb) TO service_role;
-- Normalize only these newly created objects, including native platform defaults.
-- Do not alter default ACLs, role attributes or any pre-existing object grants.
DO $new_source_object_acls$
DECLARE grant_row record; object_row record; role_sql text;
BEGIN
  FOR grant_row IN
    SELECT DISTINCT a.grantee,c.relowner AS owner
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='public.upload_source_bindings'::regclass AND a.grantee<>c.relowner
  LOOP
    role_sql:=CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
    EXECUTE 'REVOKE ALL ON TABLE public.upload_source_bindings FROM '||role_sql;
  END LOOP;
  FOR object_row IN SELECT p.oid,p.proowner,p.proacl FROM pg_proc p
    WHERE p.oid IN ('public.protect_bound_source_review_v1()'::regprocedure,
      'public.protect_source_semantics_writer_v1()'::regprocedure,
      'public.stage_bound_source_upload_v1(uuid,text,jsonb)'::regprocedure)
  LOOP
    FOR grant_row IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(object_row.proacl,acldefault('f',object_row.proowner))) a
      WHERE a.grantee<>object_row.proowner
    LOOP
      role_sql:=CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
      EXECUTE 'REVOKE ALL ON FUNCTION '||object_row.oid::regprocedure::text||' FROM '||role_sql;
    END LOOP;
  END LOOP;
END $new_source_object_acls$;
GRANT SELECT ON public.upload_source_bindings TO service_role;
GRANT EXECUTE ON FUNCTION public.stage_bound_source_upload_v1(uuid,text,jsonb) TO service_role;
COMMIT;
