-- Candidate only: execute the complete file in ONE transaction. No source rows or approvals are created.
DO $guard$ DECLARE signature text; BEGIN
 IF md5(pg_get_functiondef(to_regprocedure('public.fn_consume_usage_atomic(text,integer)'))) IS DISTINCT FROM 'f4ff6df4278e891049ef8815e1f7da61' THEN RAISE EXCEPTION 'Source transaction baseline drift: fn_consume_usage_atomic(text,integer)'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.fn_export_properties_batch(uuid[],boolean)'))) IS DISTINCT FROM '6b7a9444c5560b99da863cc6f5f7c705' THEN RAISE EXCEPTION 'Source transaction baseline drift: fn_export_properties_batch(uuid[],boolean)'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.fn_increment_trial_exports(uuid,integer)'))) IS DISTINCT FROM '2a549cdcab2d81d9435ac6b1ff688c07' THEN RAISE EXCEPTION 'Source transaction baseline drift: fn_increment_trial_exports(uuid,integer)'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.fn_reserve_export_v1(uuid,text,uuid[],boolean)'))) IS DISTINCT FROM '3916c08e35aa36a66f9a8de4c6560a92' THEN RAISE EXCEPTION 'Source transaction baseline drift: fn_reserve_export_v1(uuid,text,uuid[],boolean)'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.fn_unlock_property(uuid,uuid)'))) IS DISTINCT FROM '5839833e4d50802c6de9927f2a4923b2' THEN RAISE EXCEPTION 'Source transaction baseline drift: fn_unlock_property(uuid,uuid)'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.export_logs'::regclass AND conname='export_logs_reservation_shape_v1') IS DISTINCT FROM $shape$CHECK ((((reservation_key IS NULL) AND (reservation_version IS NULL) AND (request_sha256 IS NULL) AND (selection_sha256 IS NULL) AND (authorized_property_ids IS NULL) AND (receipt_payload IS NULL) AND (entitlement_receipt IS NULL)) OR ((reservation_key IS NOT NULL) AND (reservation_version IS NOT NULL) AND (request_sha256 IS NOT NULL) AND (selection_sha256 IS NOT NULL) AND (authorized_property_ids IS NOT NULL) AND (receipt_payload IS NOT NULL) AND (entitlement_receipt IS NOT NULL) AND (reservation_version = 'export-reservation-v1'::text) AND (request_sha256 ~ '^[0-9a-f]{64}$'::text) AND (selection_sha256 ~ '^[0-9a-f]{64}$'::text) AND ((cardinality(authorized_property_ids) >= 1) AND (cardinality(authorized_property_ids) <= 1000)) AND (jsonb_typeof(receipt_payload) = 'array'::text) AND (jsonb_array_length(receipt_payload) = row_count) AND (row_count = cardinality(authorized_property_ids)) AND (jsonb_typeof(entitlement_receipt) = 'object'::text))))$shape$ THEN RAISE EXCEPTION 'Export receipt shape drift'; END IF;
 FOREACH signature IN ARRAY ARRAY['public.fn_add_filtered_to_list(uuid,text,text,integer,integer,uuid,text,integer)','public.fn_dashboard_stats()','public.fn_data_health_report()','public.fn_distinct_city_counts()','public.fn_get_list_properties(uuid,integer,integer)','public.fn_get_unlock_count(uuid)','public.fn_job_status(uuid)','public.fn_jurisdiction_stats()','public.fn_map_markers(text,text,text,integer,integer,integer)','public.fn_opportunity_funnel()','public.fn_properties_untraced_in_list(uuid,integer)','public.fn_violation_counts_by_area(text,text)','public.fn_zip_pressure(text,text)'] LOOP
  IF to_regprocedure(signature) IS NULL OR (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure(signature)) OR has_function_privilege('anon',signature,'EXECUTE') THEN RAISE EXCEPTION 'Legacy read RPC containment required before source integration: %',signature; END IF;
 END LOOP;
 IF to_regclass('snap_relaunch.customer_source_acceptances') IS NOT NULL OR to_regprocedure('public.fn_reserve_source_export_v1(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Source transaction version already exists'; END IF;
END $guard$;
-- Candidate only. Execute the complete assembled migration in one transaction.
-- Private decisions/links preserve the original immutable intake and source IDs.
CREATE TABLE snap_relaunch.source_review_events (
 id uuid PRIMARY KEY,preparation_sha256 text NOT NULL REFERENCES snap_relaunch.intake_batches,
 reviewer_user_id uuid NOT NULL REFERENCES auth.users,record_keys text[] NOT NULL,
 selection_sha256 text NOT NULL CHECK(selection_sha256 ~ '^[0-9a-f]{64}$'),
 outcome text NOT NULL CHECK(outcome IN ('reviewed','held','rejected')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 note text NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),command_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX source_review_events_selection ON snap_relaunch.source_review_events(preparation_sha256,selection_sha256,created_at DESC,id);
CREATE TABLE snap_relaunch.customer_property_mappings (
 id uuid PRIMARY KEY,preparation_sha256 text NOT NULL REFERENCES snap_relaunch.intake_batches,
 source_property_id uuid NOT NULL REFERENCES snap_relaunch.property_identities,
 customer_property_id uuid NOT NULL REFERENCES public.properties ON DELETE RESTRICT,
 created_for_source boolean NOT NULL,actor_user_id uuid NOT NULL REFERENCES auth.users,
 source_evidence_sha256 text NOT NULL CHECK(source_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 target_snapshot_sha256 text NOT NULL CHECK(target_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),note text NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
 command_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX source_mapping_source_id ON snap_relaunch.customer_property_mappings(source_property_id,created_at DESC,id);
CREATE INDEX source_mapping_customer_id ON snap_relaunch.customer_property_mappings(customer_property_id);
CREATE TABLE snap_relaunch.customer_source_acceptances (
 id uuid PRIMARY KEY,preparation_sha256 text NOT NULL REFERENCES snap_relaunch.intake_batches,
 review_event_id uuid NOT NULL REFERENCES snap_relaunch.source_review_events,
 actor_user_id uuid NOT NULL REFERENCES auth.users,consumer_user_id uuid NOT NULL REFERENCES auth.users,
 consumer_org_id uuid NOT NULL REFERENCES public.organizations,
 purpose text NOT NULL CHECK(purpose IN ('customer_export','crm')),
 scope text NOT NULL CHECK(scope='dated_parcel_source_snapshot'),record_keys text[] NOT NULL,
 selection_sha256 text NOT NULL CHECK(selection_sha256 ~ '^[0-9a-f]{64}$'),
 mapping_ids uuid[] NOT NULL,mapped_items jsonb NOT NULL CHECK(jsonb_typeof(mapped_items)='array'),
 resolutions jsonb NOT NULL CHECK(jsonb_typeof(resolutions)='object'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 valid_until timestamptz NOT NULL,command_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(valid_until>created_at)
);
CREATE INDEX source_acceptances_consumer ON snap_relaunch.customer_source_acceptances(consumer_user_id,purpose,valid_until);
CREATE TABLE snap_relaunch.source_revocations (
 id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('mapping','acceptance')),target_id uuid NOT NULL,
 preparation_sha256 text NOT NULL REFERENCES snap_relaunch.intake_batches,
 actor_user_id uuid NOT NULL REFERENCES auth.users,evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 note text NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),command_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(kind,target_id)
);
CREATE TABLE snap_relaunch.source_crm_links (
 id uuid PRIMARY KEY,acceptance_id uuid NOT NULL REFERENCES snap_relaunch.customer_source_acceptances,
 source_property_id uuid NOT NULL REFERENCES snap_relaunch.property_identities,
 customer_property_id uuid NOT NULL REFERENCES public.properties ON DELETE RESTRICT,
 consumer_user_id uuid NOT NULL REFERENCES auth.users,org_id uuid NOT NULL REFERENCES public.organizations,
 lead_id uuid NOT NULL REFERENCES public.leads ON DELETE RESTRICT,
 activity_id uuid NOT NULL REFERENCES public.lead_activities ON DELETE RESTRICT,
 command_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(acceptance_id,source_property_id)
);
CREATE INDEX source_crm_links_lead ON snap_relaunch.source_crm_links(lead_id);
DO $private$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['source_review_events','customer_property_mappings','customer_source_acceptances','source_revocations','source_crm_links'] LOOP
  EXECUTE format('ALTER TABLE snap_relaunch.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON snap_relaunch.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER source_decision_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_relaunch.%I FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation()',t);
 END LOOP;
END $private$;

CREATE FUNCTION snap_relaunch.source_hash_v1(p_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex') $$;

CREATE FUNCTION snap_relaunch.source_authorization_current_v1(p_preparation text,p_user uuid,p_admin boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_preparation IS NOT NULL AND p_preparation ~ '^[0-9a-f]{64}$' AND p_user IS NOT NULL AND p_admin IS NOT NULL
  AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND NOT coalesce(is_anonymous,false)
    AND (banned_until IS NULL OR banned_until<=now()) AND confirmed_at IS NOT NULL)
  AND EXISTS(SELECT 1 FROM snap_relaunch.owner_review_access WHERE preparation_sha256=p_preparation
    AND reviewer_user_id=p_user AND enabled AND revoked_at IS NULL)
  AND (NOT p_admin OR coalesce(public.has_role(p_user,'admin'::public.app_role),false))
$$;

CREATE FUNCTION snap_relaunch.require_source_actor_v1(p_preparation text,p_admin boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); BEGIN
 IF NOT snap_relaunch.source_authorization_current_v1(p_preparation,u,p_admin) THEN
  RAISE EXCEPTION 'Source review access denied' USING ERRCODE='42501';
 END IF;
 RETURN u;
END $$;

CREATE FUNCTION snap_relaunch.source_manifest_v1(p_preparation text,p_keys text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb;n integer;BEGIN
 IF p_keys IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 2000 OR array_position(p_keys,NULL) IS NOT NULL
  OR cardinality(p_keys)<>(SELECT count(DISTINCT v) FROM unnest(p_keys) v) THEN
  RAISE EXCEPTION 'Invalid source selection' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('record_key',e.record_key,'source_row',e.source_row,
  'original_sha256',e.original_sha256,'canonical_sha256',e.canonical_sha256,
  'source_property_id',i.property_id,'source_parcel_reference',e.source_parcel_reference,
  'parcel_evidence_sha256',pe.evidence_sha256) ORDER BY e.source_row,e.record_key),count(*)::integer
 INTO result,n FROM snap_relaunch.intake_events e
 JOIN snap_relaunch.intake_batches b ON b.preparation_sha256=e.preparation_sha256
 JOIN snap_relaunch.property_identities i ON i.source_authority='city-of-syracuse-ny' AND i.source_parcel_reference=e.source_parcel_reference
 JOIN LATERAL(SELECT v.evidence_sha256 FROM snap_relaunch.parcel_evidence v WHERE v.property_id=i.property_id
  AND v.preparation_sha256=e.preparation_sha256 ORDER BY v.source_retrieved_at DESC,v.evidence_sha256 LIMIT 1) pe ON true
 WHERE e.preparation_sha256=p_preparation AND e.record_key=ANY(p_keys)
  AND b.record_type='code_violation' AND b.review_state='pending_review' AND NOT b.customer_accepted
  AND e.source_payload->>'code_source_url'='https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0'
  AND e.original_sha256=encode(sha256(convert_to(e.original_text,'UTF8')),'hex');
 IF n<>cardinality(p_keys) THEN RAISE EXCEPTION 'Incomplete or unsupported source selection' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.fn_preview_source_review_v1(p_preparation text,p_record_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb;BEGIN
 PERFORM snap_relaunch.require_source_actor_v1(p_preparation,false);
 items:=snap_relaunch.source_manifest_v1(p_preparation,p_record_keys);
 RETURN jsonb_build_object('version','source-action-preview-v1','preparation_sha256',p_preparation,
  'selection_sha256',snap_relaunch.source_hash_v1(items),'items',items,'customer_accepted',false);
END $$;

CREATE FUNCTION public.fn_record_source_review_v1(p_command_id uuid,p_preparation text,p_record_keys text[],
 p_expected_selection_sha256 text,p_outcome text,p_evidence_sha256 text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;items jsonb;cmd text;prior snap_relaunch.source_review_events%ROWTYPE;BEGIN
 actor:=snap_relaunch.require_source_actor_v1(p_preparation,false);
 PERFORM pg_advisory_xact_lock(810207,71);
 items:=snap_relaunch.source_manifest_v1(p_preparation,p_record_keys);
 IF p_expected_selection_sha256 IS DISTINCT FROM snap_relaunch.source_hash_v1(items) THEN
  RAISE EXCEPTION 'Review selection changed' USING ERRCODE='22023';END IF;
 cmd:=snap_relaunch.source_hash_v1(jsonb_build_array(actor,p_preparation,items,p_outcome,p_evidence_sha256,p_note));
 SELECT * INTO prior FROM snap_relaunch.source_review_events WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Review command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('review_id',prior.id,'outcome',prior.outcome,'replayed',true,'customer_accepted',false);
 END IF;
 INSERT INTO snap_relaunch.source_review_events(id,preparation_sha256,reviewer_user_id,record_keys,selection_sha256,outcome,evidence_sha256,note,command_sha256)
 VALUES(p_command_id,p_preparation,actor,ARRAY(SELECT value->>'record_key' FROM jsonb_array_elements(items)),p_expected_selection_sha256,p_outcome,p_evidence_sha256,p_note,cmd);
 RETURN jsonb_build_object('review_id',p_command_id,'outcome',p_outcome,'replayed',false,'customer_accepted',false);
END $$;

CREATE FUNCTION public.fn_bind_source_property_v1(p_command_id uuid,p_preparation text,p_source_property_id uuid,
 p_source_evidence_sha256 text,p_mode text,p_existing_property_id uuid,p_expected_target_sha256 text,
 p_evidence_sha256 text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;pe snap_relaunch.parcel_evidence%ROWTYPE;target public.properties%ROWTYPE;
 prior snap_relaunch.customer_property_mappings%ROWTYPE;cmd text;created boolean:=false;target_hash text;BEGIN
 actor:=snap_relaunch.require_source_actor_v1(p_preparation,true);
 PERFORM pg_advisory_xact_lock(810207,71);
 cmd:=snap_relaunch.source_hash_v1(jsonb_build_array(actor,p_preparation,p_source_property_id,p_source_evidence_sha256,p_mode,p_existing_property_id,p_expected_target_sha256,p_evidence_sha256,p_note));
 SELECT * INTO prior FROM snap_relaunch.customer_property_mappings WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Mapping command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('mapping_id',prior.id,'customer_property_id',prior.customer_property_id,'replayed',true);
 END IF;
 SELECT * INTO pe FROM snap_relaunch.parcel_evidence WHERE preparation_sha256=p_preparation AND property_id=p_source_property_id
  ORDER BY source_retrieved_at DESC,evidence_sha256 LIMIT 1;
 IF NOT FOUND OR pe.evidence_sha256 IS DISTINCT FROM p_source_evidence_sha256 THEN
  RAISE EXCEPTION 'Source identity evidence changed' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m WHERE m.source_property_id=p_source_property_id
   AND NOT EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='mapping' AND r.target_id=m.id)) THEN
  RAISE EXCEPTION 'Source property already has an active mapping' USING ERRCODE='22023';END IF;
 IF p_mode='create_source_identity' AND p_existing_property_id IS NULL AND p_expected_target_sha256 IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.properties WHERE id=p_source_property_id) THEN
   RAISE EXCEPTION 'Stable source ID already exists; explicit existing-property review required' USING ERRCODE='22023';END IF;
  -- A source property shell has no invented score, current distress or violation totals.
  INSERT INTO public.properties(id,address,city,state,zip,enforcement_type,total_violations,open_violations,
   avg_days_open,violation_types,repeat_offender,multi_department,escalated,distress_signals,opportunity_class)
  SELECT pe.property_id,p.source_address,p.city,p.state,p.zip,'code_violation',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  FROM snap_relaunch.intake_parcels p WHERE p.preparation_sha256=p_preparation AND p.source_parcel_reference=pe.source_parcel_reference
  RETURNING * INTO STRICT target;created:=true;
 ELSIF p_mode='reuse_existing' AND p_existing_property_id IS NOT NULL AND p_expected_target_sha256 IS NOT NULL THEN
  SELECT * INTO target FROM public.properties WHERE id=p_existing_property_id FOR UPDATE;
  IF NOT FOUND OR snap_relaunch.source_hash_v1(to_jsonb(target)) IS DISTINCT FROM p_expected_target_sha256 THEN
   RAISE EXCEPTION 'Existing property evidence changed' USING ERRCODE='22023';END IF;
  IF target.enforcement_type IS DISTINCT FROM 'code_violation' OR target.state IS DISTINCT FROM 'NY' THEN
   RAISE EXCEPTION 'Unsupported property mapping scope' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m WHERE m.customer_property_id=target.id AND m.source_property_id<>p_source_property_id) THEN
   RAISE EXCEPTION 'Customer property already links a different source parcel' USING ERRCODE='22023';END IF;
  created:=EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m WHERE m.customer_property_id=target.id AND m.created_for_source);
 ELSE RAISE EXCEPTION 'Explicit source property mapping mode required' USING ERRCODE='22023';END IF;
 target_hash:=snap_relaunch.source_hash_v1(to_jsonb(target));
 INSERT INTO snap_relaunch.customer_property_mappings(id,preparation_sha256,source_property_id,customer_property_id,
  created_for_source,actor_user_id,source_evidence_sha256,target_snapshot_sha256,evidence_sha256,note,command_sha256)
 VALUES(p_command_id,p_preparation,p_source_property_id,target.id,created,actor,p_source_evidence_sha256,target_hash,p_evidence_sha256,p_note,cmd);
 RETURN jsonb_build_object('mapping_id',p_command_id,'customer_property_id',target.id,'target_snapshot_sha256',target_hash,'replayed',false,'customer_accepted',false);
END $$;

CREATE FUNCTION public.fn_accept_source_selection_v1(p_command_id uuid,p_review_id uuid,p_consumer_user_id uuid,
 p_purpose text,p_mapping_ids uuid[],p_resolutions jsonb,p_evidence_sha256 text,p_valid_until timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;review snap_relaunch.source_review_events%ROWTYPE;items jsonb;mapped jsonb;it jsonb;
 reasons jsonb;resolution jsonb;reason text;cmd text;prior snap_relaunch.customer_source_acceptances%ROWTYPE;BEGIN
 SELECT * INTO review FROM snap_relaunch.source_review_events WHERE id=p_review_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source review unavailable' USING ERRCODE='42501';END IF;
 actor:=snap_relaunch.require_source_actor_v1(review.preparation_sha256,true);
 PERFORM pg_advisory_xact_lock(810207,71);
 cmd:=snap_relaunch.source_hash_v1(jsonb_build_array(actor,p_review_id,p_consumer_user_id,p_purpose,p_mapping_ids,p_resolutions,p_evidence_sha256,p_valid_until));
 SELECT * INTO prior FROM snap_relaunch.customer_source_acceptances WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Acceptance command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('acceptance_id',prior.id,'purpose',prior.purpose,'replayed',true);
 END IF;
 IF review.outcome<>'reviewed' OR review.id IS DISTINCT FROM (SELECT id FROM snap_relaunch.source_review_events
  WHERE preparation_sha256=review.preparation_sha256 AND selection_sha256=review.selection_sha256 ORDER BY created_at DESC,id DESC LIMIT 1) THEN
  RAISE EXCEPTION 'Current source review is not reviewed' USING ERRCODE='42501';END IF;
 IF NOT snap_relaunch.source_authorization_current_v1(review.preparation_sha256,review.reviewer_user_id,false) THEN
  RAISE EXCEPTION 'Original source reviewer authorization is unavailable' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.id=p_consumer_user_id
  AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false) AND u.confirmed_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
  RAISE EXCEPTION 'Exact consumer account unavailable' USING ERRCODE='42501';END IF;
 IF p_purpose NOT IN ('customer_export','crm') OR p_valid_until IS NULL OR p_valid_until<=clock_timestamp()
  OR p_valid_until>clock_timestamp()+interval '366 days' OR jsonb_typeof(p_resolutions) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Explicit bounded consumer decision required' USING ERRCODE='22023';END IF;
 items:=snap_relaunch.source_manifest_v1(review.preparation_sha256,review.record_keys);
 IF snap_relaunch.source_hash_v1(items)<>review.selection_sha256 THEN RAISE EXCEPTION 'Source evidence changed' USING ERRCODE='22023';END IF;
 IF p_mapping_ids IS NULL OR cardinality(p_mapping_ids) NOT BETWEEN 1 AND 1000 OR array_position(p_mapping_ids,NULL) IS NOT NULL
  OR cardinality(p_mapping_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_mapping_ids) id) THEN
  RAISE EXCEPTION 'Exact mapping set required' USING ERRCODE='22023';END IF;
 SELECT jsonb_agg(i.value||jsonb_build_object('mapping_id',m.id,'customer_property_id',m.customer_property_id,
  'mapping_revision',m.command_sha256) ORDER BY (i.value->>'source_row')::integer,i.value->>'record_key') INTO mapped
 FROM jsonb_array_elements(items) i JOIN snap_relaunch.customer_property_mappings m ON m.source_property_id=(i.value->>'source_property_id')::uuid
  AND m.id=ANY(p_mapping_ids) AND m.preparation_sha256=review.preparation_sha256
  AND m.source_evidence_sha256=i.value->>'parcel_evidence_sha256'
 WHERE NOT EXISTS(SELECT 1 FROM snap_relaunch.source_revocations r WHERE r.kind='mapping' AND r.target_id=m.id)
  AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id=m.customer_property_id
    AND snap_relaunch.source_hash_v1(to_jsonb(p))=m.target_snapshot_sha256);
 IF jsonb_array_length(mapped) IS DISTINCT FROM jsonb_array_length(items)
  OR cardinality(p_mapping_ids)<>(SELECT count(DISTINCT value->>'mapping_id') FROM jsonb_array_elements(mapped))
  OR cardinality(p_mapping_ids)<>(SELECT count(DISTINCT value->>'customer_property_id') FROM jsonb_array_elements(mapped)) THEN
  RAISE EXCEPTION 'Mapping set incomplete, revoked or ambiguous' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_resolutions))<>jsonb_array_length(items) THEN RAISE EXCEPTION 'Exact per-record resolutions required' USING ERRCODE='22023';END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(items) LOOP
  SELECT review_reasons INTO reasons FROM snap_relaunch.intake_events WHERE preparation_sha256=review.preparation_sha256 AND record_key=it->>'record_key';
  resolution:=p_resolutions->(it->>'record_key');
  IF jsonb_typeof(resolution) IS DISTINCT FROM 'array' OR jsonb_array_length(resolution)<>jsonb_array_length(reasons)
   OR (SELECT count(DISTINCT value->>'reason') FROM jsonb_array_elements(resolution))<>jsonb_array_length(reasons) THEN
   RAISE EXCEPTION 'Unresolved source review reasons' USING ERRCODE='22023';END IF;
  FOR reason IN SELECT jsonb_array_elements_text(reasons) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(resolution) x WHERE x->>'reason'=reason
    AND x->>'disposition' IN ('verified','retained_limitation','deferred_to_request_authorization')
    AND x->>'evidence_sha256' ~ '^[0-9a-f]{64}$' AND length(x->>'note') BETWEEN 10 AND 2000
    AND (reason NOT IN ('confidentiality_not_provided','distribution_review_pending','current_private_original_proof_not_bound','customer_property_mapping_missing') OR x->>'disposition'='verified')
    AND (x->>'disposition'<>'deferred_to_request_authorization' OR reason='customer_entitlement_not_connected')) THEN
    RAISE EXCEPTION 'Source review resolution is incomplete' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=review.preparation_sha256
  AND r.outcome IN ('held','rejected') AND r.record_keys&&review.record_keys AND r.created_at>review.created_at) THEN
  RAISE EXCEPTION 'A later review holds selected records' USING ERRCODE='42501';END IF;
 INSERT INTO snap_relaunch.customer_source_acceptances(id,preparation_sha256,review_event_id,actor_user_id,consumer_user_id,consumer_org_id,purpose,
  scope,record_keys,selection_sha256,mapping_ids,mapped_items,resolutions,evidence_sha256,valid_until,command_sha256)
 VALUES(p_command_id,review.preparation_sha256,p_review_id,actor,p_consumer_user_id,(SELECT org_id FROM public.profiles WHERE user_id=p_consumer_user_id),p_purpose,'dated_parcel_source_snapshot',review.record_keys,
  review.selection_sha256,p_mapping_ids,mapped,p_resolutions,p_evidence_sha256,p_valid_until,cmd);
 RETURN jsonb_build_object('acceptance_id',p_command_id,'purpose',p_purpose,'consumer_user_id',p_consumer_user_id,
  'event_count',jsonb_array_length(mapped),'property_count',cardinality(p_mapping_ids),'replayed',false);
END $$;

CREATE FUNCTION public.fn_revoke_source_decision_v1(p_command_id uuid,p_kind text,p_target_id uuid,p_evidence_sha256 text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prep text;actor uuid;cmd text;prior snap_relaunch.source_revocations%ROWTYPE;BEGIN
 IF p_kind='mapping' THEN SELECT preparation_sha256 INTO prep FROM snap_relaunch.customer_property_mappings WHERE id=p_target_id;
 ELSIF p_kind='acceptance' THEN SELECT preparation_sha256 INTO prep FROM snap_relaunch.customer_source_acceptances WHERE id=p_target_id;
 ELSE RAISE EXCEPTION 'Unknown revocation kind' USING ERRCODE='22023';END IF;
 actor:=snap_relaunch.require_source_actor_v1(prep,true);PERFORM pg_advisory_xact_lock(810207,71);
 cmd:=snap_relaunch.source_hash_v1(jsonb_build_array(actor,p_kind,p_target_id,p_evidence_sha256,p_note));
 SELECT * INTO prior FROM snap_relaunch.source_revocations WHERE id=p_command_id;
 IF FOUND THEN
  IF prior.command_sha256<>cmd THEN RAISE EXCEPTION 'Revocation command conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('revocation_id',prior.id,'replayed',true);
 END IF;
 INSERT INTO snap_relaunch.source_revocations(id,kind,target_id,preparation_sha256,actor_user_id,evidence_sha256,note,command_sha256)
 VALUES(p_command_id,p_kind,p_target_id,prep,actor,p_evidence_sha256,p_note,cmd);
 RETURN jsonb_build_object('revocation_id',p_command_id,'replayed',false);
END $$;

CREATE FUNCTION snap_relaunch.require_source_acceptance_v1(p_acceptance uuid,p_purpose text)
RETURNS snap_relaunch.customer_source_acceptances LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  OR NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,a.actor_user_id,true)
  OR NOT snap_relaunch.source_authorization_current_v1(a.preparation_sha256,
    (SELECT reviewer_user_id FROM snap_relaunch.source_review_events WHERE id=a.review_event_id),false)
  OR a.review_event_id IS DISTINCT FROM (SELECT id FROM snap_relaunch.source_review_events WHERE preparation_sha256=a.preparation_sha256
    AND selection_sha256=a.selection_sha256 ORDER BY created_at DESC,id DESC LIMIT 1) THEN
  RAISE EXCEPTION 'Current source acceptance unavailable' USING ERRCODE='42501';END IF;
 IF snap_relaunch.source_hash_v1(snap_relaunch.source_manifest_v1(a.preparation_sha256,a.record_keys))<>a.selection_sha256 THEN
  RAISE EXCEPTION 'Accepted source evidence changed' USING ERRCODE='42501';END IF;
 RETURN a;
END $$;

-- Private functions/tables stay unexposed. Only the narrow authenticated RPCs execute.
REVOKE ALL ON FUNCTION snap_relaunch.source_hash_v1(jsonb),snap_relaunch.source_authorization_current_v1(text,uuid,boolean),snap_relaunch.require_source_actor_v1(text,boolean),
 snap_relaunch.source_manifest_v1(text,text[]),snap_relaunch.require_source_acceptance_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_preview_source_review_v1(text,text[]),
 public.fn_record_source_review_v1(uuid,text,text[],text,text,text,text),
 public.fn_bind_source_property_v1(uuid,text,uuid,text,text,uuid,text,text,text),
 public.fn_accept_source_selection_v1(uuid,uuid,uuid,text,uuid[],jsonb,text,timestamptz),
 public.fn_revoke_source_decision_v1(uuid,text,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_preview_source_review_v1(text,text[]),
 public.fn_record_source_review_v1(uuid,text,text[],text,text,text,text),
 public.fn_bind_source_property_v1(uuid,text,uuid,text,text,uuid,text,text,text),
 public.fn_accept_source_selection_v1(uuid,uuid,uuid,text,uuid[],jsonb,text,timestamptz),
 public.fn_revoke_source_decision_v1(uuid,text,uuid,text,text) TO authenticated;

CREATE FUNCTION public.fn_is_source_property_v1(p_property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m WHERE m.customer_property_id=p_property_id AND m.created_for_source)
$$;
CREATE FUNCTION public.fn_source_property_visible_v1(p_property_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate record;a snap_relaunch.customer_source_acceptances%ROWTYPE;BEGIN
 IF auth.uid() IS NULL THEN RETURN false;END IF;
 IF NOT public.fn_is_source_property_v1(p_property_id) THEN RETURN true;END IF;
 FOR candidate IN SELECT DISTINCT ac.id,ac.purpose FROM snap_relaunch.customer_source_acceptances ac
  JOIN snap_relaunch.customer_property_mappings m ON m.id=ANY(ac.mapping_ids)
  WHERE ac.consumer_user_id=auth.uid() AND m.customer_property_id=p_property_id LOOP
  BEGIN
   a:=snap_relaunch.require_source_acceptance_v1(candidate.id,candidate.purpose);RETURN true;
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
 END LOOP;
 RETURN false;
END $$;
CREATE FUNCTION public.fn_source_lead_visible_v1(p_lead_id uuid,p_property_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE link snap_relaunch.source_crm_links%ROWTYPE;a snap_relaunch.customer_source_acceptances%ROWTYPE;BEGIN
 IF auth.uid() IS NULL THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM snap_relaunch.source_crm_links WHERE lead_id=p_lead_id) THEN
  RETURN NOT public.fn_is_source_property_v1(coalesce(p_property_id,(SELECT property_id FROM public.leads WHERE id=p_lead_id)));
 END IF;
 FOR link IN SELECT * FROM snap_relaunch.source_crm_links WHERE lead_id=p_lead_id AND consumer_user_id=auth.uid() LOOP
  BEGIN
   a:=snap_relaunch.require_source_acceptance_v1(link.acceptance_id,'crm');
   IF EXISTS(SELECT 1 FROM public.leads l JOIN public.profiles p ON p.user_id=auth.uid() WHERE l.id=link.lead_id
     AND l.created_by=auth.uid() AND l.org_id=link.org_id AND p.org_id=link.org_id) THEN RETURN true;END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
 END LOOP;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.fn_is_source_property_v1(uuid),public.fn_source_property_visible_v1(uuid),public.fn_source_lead_visible_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_is_source_property_v1(uuid),public.fn_source_property_visible_v1(uuid),public.fn_source_lead_visible_v1(uuid,uuid) TO authenticated,service_role;

CREATE POLICY source_property_account_fence_v1 ON public.properties AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.fn_source_property_visible_v1(id)) WITH CHECK(public.fn_source_property_visible_v1(id));
CREATE POLICY source_lead_account_fence_v1 ON public.leads AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.fn_source_lead_visible_v1(id,property_id)) WITH CHECK(public.fn_source_lead_visible_v1(id,property_id));
CREATE POLICY source_lead_activity_fence_v1 ON public.lead_activities AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.fn_source_lead_visible_v1(lead_id)) WITH CHECK(public.fn_source_lead_visible_v1(lead_id));

CREATE FUNCTION public.protect_source_property_and_lead_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='properties' AND public.fn_is_source_property_v1(OLD.id) THEN
  RAISE EXCEPTION 'Mapped source property evidence is immutable; append a reviewed mapping revision' USING ERRCODE='42501';
 ELSIF TG_TABLE_NAME='leads' AND EXISTS(SELECT 1 FROM snap_relaunch.source_crm_links WHERE lead_id=OLD.id) THEN
  IF TG_OP='DELETE' OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.org_id IS DISTINCT FROM OLD.org_id
   OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
   RAISE EXCEPTION 'Source lead identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='lead_activities' AND EXISTS(SELECT 1 FROM snap_relaunch.source_crm_links WHERE activity_id=OLD.id) THEN
  -- The linked annotation is part of the immutable acceptance receipt. Moving
  -- it to an ordinary shared-org lead would otherwise bypass the source fence.
  RAISE EXCEPTION 'Linked source activity is immutable; append a new activity' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE FUNCTION public.reject_source_legacy_violation_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF public.fn_is_source_property_v1(NEW.property_id) THEN
  RAISE EXCEPTION 'Source observations must retain their private event lineage; legacy violation insertion is unavailable' USING ERRCODE='42501';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER source_property_immutable_v1 BEFORE UPDATE OR DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.protect_source_property_and_lead_v1();
CREATE TRIGGER source_lead_identity_v1 BEFORE UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.protect_source_property_and_lead_v1();
CREATE TRIGGER source_activity_immutable_v1 BEFORE UPDATE OR DELETE ON public.lead_activities FOR EACH ROW EXECUTE FUNCTION public.protect_source_property_and_lead_v1();
CREATE TRIGGER source_legacy_violation_hold_v1 BEFORE INSERT OR UPDATE OF property_id ON public.violations FOR EACH ROW EXECUTE FUNCTION public.reject_source_legacy_violation_v1();
REVOKE ALL ON FUNCTION public.protect_source_property_and_lead_v1(),public.reject_source_legacy_violation_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_export_properties_batch(p_property_ids uuid[], p_enforce_code_violation_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'address', q.address,
        'city', q.city,
        'state', q.state,
        'zip', q.zip,
        'snap_insight', q.snap_insight,
        'snap_score', q.snap_score,
        'enforcement_type', q.enforcement_type,
        'violations', q.violations
      )
      ORDER BY q.snap_score DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      p.address,
      p.city,
      p.state,
      p.zip,
      p.snap_insight,
      p.snap_score,
      p.enforcement_type,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'violation_type', v.violation_type,
              'status', v.status,
              'opened_date', v.opened_date
            )
            ORDER BY v.opened_date
          )
          FROM violations v
          WHERE v.property_id = p.id
        ),
        '[]'::jsonb
      ) AS violations
    FROM properties p
    WHERE p.id = ANY (p_property_ids)
      AND NOT public.fn_is_source_property_v1(p.id)
      AND (NOT p_enforce_code_violation_only OR p.enforcement_type = 'code_violation')
  ) q;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_unlock_property(p_user_id uuid, p_property_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.user_subscriptions%ROWTYPE;
  v_has_subscription boolean;
  v_free_remaining integer;
  v_plan_max integer;
  v_new_exports integer;
  v_credit_balance integer;
  v_trial_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success',false,'error','unauthorized');
  END IF;
  -- A privileged RPC must not bypass the current restrictive customer RLS.
  IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN
    RETURN jsonb_build_object('success',false,'error','customer_access_held');
  END IF;
  IF p_property_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','property_unavailable');
  END IF;

  -- Serializes direct unlock attempts for this account, including duplicate
  -- properties and competing free credits. No mutable client balance is used.
  SELECT free_unlocks_remaining INTO v_free_remaining FROM public.profiles
  WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','account_unavailable');
  END IF;
  SELECT * INTO v_sub FROM public.user_subscriptions
  WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  v_has_subscription := FOUND;
  IF v_has_subscription THEN
    IF v_sub.status IN ('trial','trialing') THEN
      IF v_sub.trial_started_at IS NULL OR v_sub.trial_started_at > now() OR
         v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at <= now() THEN
        RETURN jsonb_build_object('success',false,'error','trial_expired');
      END IF;
    ELSIF v_sub.status IN ('active','past_due') THEN
      IF v_sub.current_period_start IS NULL OR v_sub.current_period_start > now() OR
         v_sub.current_period_end IS NULL OR v_sub.current_period_end <= now() THEN
        RETURN jsonb_build_object('success',false,'error','subscription_expired');
      END IF;
    ELSE
      RETURN jsonb_build_object('success',false,'error','subscription_expired');
    END IF;
  END IF;

  IF NOT public.fn_source_property_visible_v1(p_property_id) OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property_id) THEN
    RETURN jsonb_build_object('success',false,'error','property_unavailable');
  END IF;
  IF EXISTS(SELECT 1 FROM public.unlocked_properties WHERE user_id=auth.uid() AND property_id=p_property_id) THEN
    RETURN jsonb_build_object('success',true,'source','already_unlocked','message','Property already unlocked');
  END IF;

  IF v_has_subscription AND v_sub.status IN ('trial','trialing') THEN
    v_trial_result := public.fn_increment_trial_exports(auth.uid(),1);
    IF (v_trial_result->>'success')::boolean IS DISTINCT FROM true THEN
      RETURN v_trial_result;
    END IF;
    INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
    VALUES(auth.uid(),p_property_id,0,'subscription');
    RETURN jsonb_build_object('success',true,'source','trial_allowance',
      'subscription_remaining',v_trial_result->'remaining','free_remaining',v_free_remaining);
  END IF;

  IF v_has_subscription THEN
    SELECT max_monthly_exports INTO v_plan_max FROM public.subscription_plans WHERE id=v_sub.plan_id;
    IF v_plan_max IS NULL OR v_plan_max < -1 THEN
      RETURN jsonb_build_object('success',false,'error','subscription_quota_invalid');
    END IF;
    INSERT INTO public.subscription_usage(user_id,period_start,period_end)
    VALUES(auth.uid(),v_sub.current_period_start::date,v_sub.current_period_end::date)
    ON CONFLICT(user_id,period_start) DO NOTHING;
    UPDATE public.subscription_usage SET exports_count=exports_count+1,updated_at=now()
    WHERE user_id=auth.uid() AND period_start=v_sub.current_period_start::date
      AND exports_count>=0 AND (v_plan_max=-1 OR exports_count<v_plan_max)
    RETURNING exports_count INTO v_new_exports;
    IF FOUND THEN
      INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
      VALUES(auth.uid(),p_property_id,0,'subscription');
      RETURN jsonb_build_object('success',true,'source','subscription_allowance',
        'subscription_remaining',CASE WHEN v_plan_max=-1 THEN NULL ELSE v_plan_max-v_new_exports END,
        'free_remaining',v_free_remaining);
    END IF;
  END IF;

  UPDATE public.profiles SET free_unlocks_remaining=free_unlocks_remaining-1
  WHERE user_id=auth.uid() AND free_unlocks_remaining>0 RETURNING free_unlocks_remaining INTO v_free_remaining;
  IF FOUND THEN
    INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
    VALUES(auth.uid(),p_property_id,0,'free_credit');
    RETURN jsonb_build_object('success',true,'source','free_credit','free_remaining',v_free_remaining);
  END IF;

  SELECT COALESCE(balance,0) INTO v_credit_balance FROM public.v_user_credits WHERE user_id=auth.uid();
  IF COALESCE(v_credit_balance,0)>0 THEN
    INSERT INTO public.credit_ledger(user_id,delta,reason,meta)
    VALUES(auth.uid(),-1,'property_unlock',jsonb_build_object('job_id',p_property_id,'property_id',p_property_id,'version','wallet-v1'));
    INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
    VALUES(auth.uid(),p_property_id,1,'credit_pack');
    RETURN jsonb_build_object('success',true,'source','credit_pack','credits_remaining',v_credit_balance-1,'free_remaining',COALESCE(v_free_remaining,0));
  END IF;
  RETURN jsonb_build_object('success',false,'error','insufficient_balance',
    'free_remaining',COALESCE(v_free_remaining,0),'credits',COALESCE(v_credit_balance,0),
    'message','Property access could not be authorized with the current allowance.');
END;
$function$
;

ALTER TABLE public.export_logs DROP CONSTRAINT export_logs_reservation_shape_v1;
ALTER TABLE public.export_logs ADD CONSTRAINT export_logs_reservation_shape_v1 CHECK ((((reservation_key IS NULL) AND (reservation_version IS NULL) AND (request_sha256 IS NULL) AND (selection_sha256 IS NULL) AND (authorized_property_ids IS NULL) AND (receipt_payload IS NULL) AND (entitlement_receipt IS NULL)) OR ((reservation_key IS NOT NULL) AND (reservation_version IS NOT NULL) AND (request_sha256 IS NOT NULL) AND (selection_sha256 IS NOT NULL) AND (authorized_property_ids IS NOT NULL) AND (receipt_payload IS NOT NULL) AND (entitlement_receipt IS NOT NULL) AND (reservation_version IN ('export-reservation-v1'::text,'source-event-export-v1'::text)) AND (request_sha256 ~ '^[0-9a-f]{64}$'::text) AND (selection_sha256 ~ '^[0-9a-f]{64}$'::text) AND ((cardinality(authorized_property_ids) >= 1) AND (cardinality(authorized_property_ids) <= 1000)) AND (jsonb_typeof(receipt_payload) = 'array'::text) AND (jsonb_array_length(receipt_payload) = row_count) AND (row_count = cardinality(authorized_property_ids)) AND (jsonb_typeof(entitlement_receipt) = 'object'::text))));

-- This builds private dated event detail from immutable intake; it never inserts
-- historical observations into public.violations or invokes a provider.
CREATE FUNCTION snap_relaunch.source_detail_rows_v1(p_acceptance uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH events AS (
  SELECT m.customer_property_id,m.source_property_id,m.id mapping_id,pe.evidence_sha256,pe.evidence_text,
   p.address,p.city,p.state,p.zip,a.scope,a.id acceptance_id,a.review_event_id,a.command_sha256 acceptance_revision,
   a.resolutions,e.source_row,e.record_key,e.source_payload,e.original_text,e.original_sha256,e.canonical_sha256,
   e.review_reasons,e.preparation_sha256,b.delivery_id,b.processing_run_id
  FROM snap_relaunch.customer_source_acceptances a
  CROSS JOIN LATERAL jsonb_array_elements(a.mapped_items) item
  JOIN snap_relaunch.customer_property_mappings m ON m.id=(item->>'mapping_id')::uuid
  JOIN public.properties p ON p.id=m.customer_property_id
  JOIN snap_relaunch.intake_events e ON e.preparation_sha256=a.preparation_sha256 AND e.record_key=item->>'record_key'
  JOIN snap_relaunch.intake_batches b ON b.preparation_sha256=e.preparation_sha256
  JOIN snap_relaunch.parcel_evidence pe ON pe.property_id=m.source_property_id AND pe.evidence_sha256=m.source_evidence_sha256
  WHERE a.id=p_acceptance
 ), grouped AS (
  SELECT customer_property_id, jsonb_build_object(
   'property_id',customer_property_id,'source_property_id',source_property_id,'mapping_id',mapping_id,
   'address',address,'city',city,'state',state,'zip',zip,'enforcement_type','code_violation',
   'scope',scope,'acceptance_id',acceptance_id,'acceptance_revision',acceptance_revision,'review_event_id',review_event_id,
   'parcel_evidence_sha256',evidence_sha256,'parcel_evidence_original_text',evidence_text,
   'events',jsonb_agg(jsonb_build_object(
    'record_key',record_key,'source_row',source_row,'preparation_sha256',preparation_sha256,
    'delivery_id',delivery_id,'processing_run_id',processing_run_id,
    'original_sha256',original_sha256,'canonical_sha256',canonical_sha256,'source_original_text',original_text,
    'source_fields',source_payload,'original_review_reasons',review_reasons,
    'review_resolutions',resolutions->record_key,
    'case_opened_date',source_payload->>'opened_date','violation_opened_date',NULL,
    'case_opened_date_meaning','Agency open_date describes the case, not a separately verified violation opening.',
    'violation_date',source_payload->>'violation_date','violation_timestamp_utc',source_payload->>'violation_timestamp_utc',
    'status_as_collected',source_payload->>'source_status','collected_at',source_payload->>'code_collected_at'
   ) ORDER BY source_row,record_key)) payload
  FROM events GROUP BY customer_property_id,source_property_id,mapping_id,address,city,state,zip,scope,
   acceptance_id,acceptance_revision,review_event_id,evidence_sha256,evidence_text
 ) SELECT coalesce(jsonb_agg(payload ORDER BY customer_property_id),'[]'::jsonb) FROM grouped
$$;

CREATE FUNCTION public.fn_reserve_source_export_v1(p_request_id uuid,p_acceptance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;s public.user_subscriptions%ROWTYPE;
 prior public.export_logs%ROWTYPE;has_sub boolean;mode text;tier text;ids uuid[];rows jsonb;n integer;
 req_hash text;selection_hash text;result jsonb;entitlement jsonb;unlocks jsonb:='[]'::jsonb;pid uuid;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_acceptance_id IS NULL THEN
  RAISE EXCEPTION 'Authenticated export identity required' USING ERRCODE='42501';END IF;
 -- Same first lock as every wallet debit and the current legacy export path.
 PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Export account unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(810207,71);
 a:=snap_relaunch.require_source_acceptance_v1(p_acceptance_id,'customer_export');
 SELECT * INTO s FROM public.user_subscriptions WHERE user_id=auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 has_sub:=FOUND;
 IF has_sub THEN
  IF s.status IN ('trial','trialing') THEN
   mode:='trial';
   IF s.trial_started_at IS NULL OR s.trial_started_at>now() OR s.trial_ends_at IS NULL OR s.trial_ends_at<=now() THEN
    RAISE EXCEPTION 'Trial expired or unverified' USING ERRCODE='42501';END IF;
  ELSIF s.status='active' THEN
   mode:='subscription';
   IF s.current_period_start IS NULL OR s.current_period_start>now() OR s.current_period_end IS NULL OR s.current_period_end<=now() THEN
    RAISE EXCEPTION 'Subscription expired or unverified' USING ERRCODE='42501';END IF;
  ELSE RAISE EXCEPTION 'No current subscription authorization' USING ERRCODE='42501';END IF;
  SELECT data_tier INTO tier FROM public.subscription_plans WHERE id=s.plan_id;
  IF tier IS NULL OR tier NOT IN ('basic','premium') THEN RAISE EXCEPTION 'Subscription tier unverified' USING ERRCODE='42501';END IF;
 ELSE mode:='payg';END IF;
 req_hash:=snap_relaunch.source_hash_v1(jsonb_build_array('source-event-export-v1',a.id,a.command_sha256));
 selection_hash:=snap_relaunch.source_hash_v1(a.mapped_items);
 SELECT * INTO prior FROM public.export_logs WHERE user_id=auth.uid() AND reservation_key=p_request_id;
 IF FOUND THEN
  IF prior.reservation_version IS DISTINCT FROM 'source-event-export-v1' OR prior.request_sha256 IS DISTINCT FROM req_hash
   OR prior.selection_sha256 IS DISTINCT FROM selection_hash THEN
   RAISE EXCEPTION 'Export request identity conflicts with an existing receipt' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('status','replayed','request_id',p_request_id,'row_count',prior.row_count,
   'event_count',cardinality(a.record_keys),'property_ids',prior.authorized_property_ids,'rows',prior.receipt_payload,
   'entitlement',prior.entitlement_receipt);
 END IF;
 rows:=snap_relaunch.source_detail_rows_v1(a.id);n:=jsonb_array_length(rows);
 SELECT array_agg((value->>'property_id')::uuid ORDER BY value->>'property_id') INTO ids FROM jsonb_array_elements(rows);
 IF n NOT BETWEEN 1 AND 1000 OR n<>cardinality(a.mapping_ids) OR octet_length(rows::text)>6291456
  OR (SELECT sum(jsonb_array_length(value->'events')) FROM jsonb_array_elements(rows))<>cardinality(a.record_keys) THEN
  RAISE EXCEPTION 'Source detail export incomplete or oversized' USING ERRCODE='42501';END IF;
 IF mode='subscription' THEN
  result:=public.fn_consume_usage_atomic('exports',n);
  IF (result->>'allowed')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Export quota authorization failed' USING ERRCODE='P0001',DETAIL=result::text;END IF;
  entitlement:=jsonb_build_object('mode',mode,'usage',result);
  INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
   SELECT auth.uid(),id,0,'subscription' FROM unnest(ids) id ON CONFLICT(user_id,property_id) DO NOTHING;
 ELSIF mode='trial' THEN
  result:=public.fn_increment_trial_exports(auth.uid(),n);
  IF (result->>'success')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Trial export quota authorization failed' USING ERRCODE='P0001',DETAIL=result::text;END IF;
  entitlement:=jsonb_build_object('mode',mode,'usage',result);
  INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
   SELECT auth.uid(),id,0,'subscription' FROM unnest(ids) id ON CONFLICT(user_id,property_id) DO NOTHING;
 ELSE
  FOREACH pid IN ARRAY ids LOOP
   result:=public.fn_unlock_property(auth.uid(),pid);
   IF (result->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Export property authorization failed' USING ERRCODE='P0001',DETAIL=result::text;END IF;
   unlocks:=unlocks||jsonb_build_array(jsonb_build_object('property_id',pid,'receipt',result));
  END LOOP;
  entitlement:=jsonb_build_object('mode',mode,'unlocks',unlocks);
 END IF;
 entitlement:=entitlement||jsonb_build_object('acceptance_id',a.id,'acceptance_revision',a.command_sha256,
  'preparation_sha256',a.preparation_sha256,'selection_sha256',a.selection_sha256,'mapping_ids',a.mapping_ids,
  'event_count',cardinality(a.record_keys),'billing_unit','property','scope',a.scope);
 INSERT INTO public.export_logs(user_id,row_count,filters,reservation_key,reservation_version,request_sha256,
  selection_sha256,authorized_property_ids,receipt_payload,entitlement_receipt)
 VALUES(auth.uid(),n,jsonb_build_object('authorization','source-event-export-v1'),p_request_id,'source-event-export-v1',
  req_hash,selection_hash,ids,rows,entitlement);
 RETURN jsonb_build_object('status','reserved','request_id',p_request_id,'row_count',n,'event_count',cardinality(a.record_keys),
  'property_ids',ids,'rows',rows,'entitlement',entitlement);
END $$;

CREATE FUNCTION public.fn_handoff_source_to_crm_v1(p_request_id uuid,p_acceptance_id uuid,p_source_property_id uuid,p_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;link snap_relaunch.source_crm_links%ROWTYPE;
 lead public.leads%ROWTYPE;org uuid;pid uuid;activity uuid;cmd text;detail jsonb;created boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authenticated CRM identity required' USING ERRCODE='42501';END IF;
 SELECT org_id INTO org FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
 IF org IS NULL THEN RAISE EXCEPTION 'CRM account unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(810207,71);
 a:=snap_relaunch.require_source_acceptance_v1(p_acceptance_id,'crm');
 cmd:=snap_relaunch.source_hash_v1(jsonb_build_array(auth.uid(),org,a.id,a.command_sha256,p_source_property_id,p_stage_id));
 SELECT * INTO link FROM snap_relaunch.source_crm_links WHERE id=p_request_id;
 IF FOUND THEN
  IF link.command_sha256<>cmd THEN RAISE EXCEPTION 'CRM request identity conflicts' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('lead_id',link.lead_id,'activity_id',link.activity_id,'source_link_id',link.id,'replayed',true);
 END IF;
 SELECT * INTO link FROM snap_relaunch.source_crm_links WHERE acceptance_id=a.id AND source_property_id=p_source_property_id;
 IF FOUND THEN
  IF link.command_sha256<>cmd THEN RAISE EXCEPTION 'CRM source handoff already recorded with different input' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('lead_id',link.lead_id,'activity_id',link.activity_id,'source_link_id',link.id,'replayed',true);
 END IF;
 SELECT (value->>'customer_property_id')::uuid INTO pid FROM jsonb_array_elements(a.mapped_items)
  WHERE value->>'source_property_id'=p_source_property_id::text LIMIT 1;
 IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.pipeline_stages WHERE id=p_stage_id AND org_id=org) THEN
  RAISE EXCEPTION 'CRM mapping or stage unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO lead FROM public.leads WHERE org_id=org AND property_id=pid FOR UPDATE;
 IF FOUND THEN
  IF lead.created_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'CRM property cannot be linked to this account' USING ERRCODE='42501';END IF;
 ELSE
  INSERT INTO public.leads(org_id,property_id,stage_id,created_by,assigned_to,source)
   VALUES(org,pid,p_stage_id,auth.uid(),auth.uid(),'checked_source_review') RETURNING * INTO lead;
  created:=true;
 END IF;
 SELECT value INTO detail FROM jsonb_array_elements(snap_relaunch.source_detail_rows_v1(a.id))
  WHERE value->>'source_property_id'=p_source_property_id::text;
 IF detail IS NULL THEN RAISE EXCEPTION 'CRM source lineage unavailable' USING ERRCODE='42501';END IF;
 -- A system annotation records an approved historical snapshot. No new-filing
 -- notification, new public violation, enrichment, buyer message or SMS enrollment.
 INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload)
  VALUES(lead.id,org,auth.uid(),'system',jsonb_build_object('event','source_snapshot_linked',
   'acceptance_id',a.id,'source_property_id',p_source_property_id,'mapping_id',detail->'mapping_id',
   'preparation_sha256',a.preparation_sha256,'selection_sha256',a.selection_sha256,
   'record_keys',ARRAY(SELECT value->>'record_key' FROM jsonb_array_elements(detail->'events')),
   'description','Reviewed historical source snapshot linked; no new filing or contact action.')) RETURNING id INTO activity;
 INSERT INTO snap_relaunch.source_crm_links(id,acceptance_id,source_property_id,customer_property_id,consumer_user_id,org_id,
  lead_id,activity_id,command_sha256) VALUES(p_request_id,a.id,p_source_property_id,pid,auth.uid(),org,lead.id,activity,cmd);
 RETURN jsonb_build_object('lead_id',lead.id,'activity_id',activity,'source_link_id',p_request_id,'created',created,'replayed',false);
END $$;

CREATE FUNCTION public.fn_get_source_crm_detail_v1(p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE link snap_relaunch.source_crm_links%ROWTYPE;a snap_relaunch.customer_source_acceptances%ROWTYPE;result jsonb:='[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.leads l JOIN public.profiles p ON p.user_id=auth.uid()
  WHERE l.id=p_lead_id AND l.created_by=auth.uid() AND l.org_id=p.org_id) THEN
  RAISE EXCEPTION 'CRM source detail unavailable' USING ERRCODE='42501';END IF;
 FOR link IN SELECT * FROM snap_relaunch.source_crm_links WHERE lead_id=p_lead_id AND consumer_user_id=auth.uid() ORDER BY created_at,id LOOP
  BEGIN
   a:=snap_relaunch.require_source_acceptance_v1(link.acceptance_id,'crm');
   result:=result||coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(snap_relaunch.source_detail_rows_v1(a.id))
    WHERE value->>'source_property_id'=link.source_property_id::text),'[]'::jsonb);
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
 END LOOP;
 IF jsonb_array_length(result)=0 THEN RAISE EXCEPTION 'CRM source detail unavailable' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION snap_relaunch.source_detail_rows_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_reserve_source_export_v1(uuid,uuid),public.fn_handoff_source_to_crm_v1(uuid,uuid,uuid,uuid),
 public.fn_get_source_crm_detail_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_reserve_source_export_v1(uuid,uuid),public.fn_handoff_source_to_crm_v1(uuid,uuid,uuid,uuid),
 public.fn_get_source_crm_detail_v1(uuid) TO authenticated;


-- Additive private owner readback. No business data or approvals are created.
-- Apply after the exact reviewed source-transactions-v1 candidate, in one transaction.
DO $guard$ BEGIN
 IF to_regprocedure('snap_relaunch.source_authorization_current_v1(text,uuid,boolean)') IS NULL
  OR to_regclass('snap_relaunch.customer_source_acceptances') IS NULL THEN RAISE EXCEPTION 'Reviewed source transaction prerequisite missing';END IF;
 IF to_regprocedure('public.fn_owner_source_action_state_v1(text)') IS NOT NULL THEN RAISE EXCEPTION 'Owner source readback version already exists';END IF;
END $guard$;

CREATE INDEX source_mapping_preparation_v1 ON snap_relaunch.customer_property_mappings(preparation_sha256,created_at DESC,id);
CREATE INDEX source_acceptance_preparation_v1 ON snap_relaunch.customer_source_acceptances(preparation_sha256,created_at DESC,id);
CREATE INDEX source_revocation_preparation_v1 ON snap_relaunch.source_revocations(preparation_sha256,created_at DESC,id);

CREATE FUNCTION snap_relaunch.owner_source_acceptance_status_v1(p_preparation text,p_acceptance uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;

CREATE FUNCTION public.fn_owner_source_action_state_v1(p_preparation text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
DECLARE actor uuid;reviews jsonb;mappings jsonb;acceptances jsonb;revocations jsonb;links jsonb;counts jsonb;result jsonb;BEGIN
 actor:=snap_relaunch.require_source_actor_v1(p_preparation,true);
 SELECT jsonb_build_object(
  'reviews',(SELECT count(*) FROM snap_relaunch.source_review_events WHERE preparation_sha256=p_preparation),
  'mappings',(SELECT count(*) FROM snap_relaunch.customer_property_mappings WHERE preparation_sha256=p_preparation),
  'acceptances',(SELECT count(*) FROM snap_relaunch.customer_source_acceptances WHERE preparation_sha256=p_preparation),
  'revocations',(SELECT count(*) FROM snap_relaunch.source_revocations WHERE preparation_sha256=p_preparation),
  'crm_links',(SELECT count(*) FROM snap_relaunch.source_crm_links l JOIN snap_relaunch.customer_source_acceptances a ON a.id=l.acceptance_id WHERE a.preparation_sha256=p_preparation)) INTO counts;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO reviews FROM (
  SELECT r.id,r.record_keys,r.selection_sha256,r.reviewer_user_id,r.outcome,r.note,r.evidence_sha256,r.created_at,
   NOT EXISTS(SELECT 1 FROM snap_relaunch.source_review_events newer WHERE newer.preparation_sha256=r.preparation_sha256 AND newer.selection_sha256=r.selection_sha256 AND (newer.created_at,newer.id)>(r.created_at,r.id)) AS current
  FROM snap_relaunch.source_review_events r WHERE r.preparation_sha256=p_preparation ORDER BY r.created_at DESC,r.id DESC LIMIT 50) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO mappings FROM (
  SELECT m.id,m.source_property_id,m.customer_property_id,m.source_evidence_sha256,m.target_snapshot_sha256,m.created_for_source,m.created_at,
   ip.source_address,p.address target_address,
   EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=m.id) revoked,
   NOT EXISTS(SELECT 1 FROM snap_relaunch.source_revocations WHERE kind='mapping' AND target_id=m.id)
    AND snap_relaunch.source_hash_v1(to_jsonb(p))=m.target_snapshot_sha256
    AND m.source_evidence_sha256=(SELECT pe.evidence_sha256 FROM snap_relaunch.parcel_evidence pe
      WHERE pe.property_id=m.source_property_id AND pe.preparation_sha256=m.preparation_sha256 ORDER BY pe.source_retrieved_at DESC,pe.evidence_sha256 LIMIT 1) AS current
  FROM snap_relaunch.customer_property_mappings m JOIN public.properties p ON p.id=m.customer_property_id
  JOIN snap_relaunch.property_identities i ON i.property_id=m.source_property_id
  LEFT JOIN snap_relaunch.intake_parcels ip ON ip.preparation_sha256=m.preparation_sha256 AND ip.source_parcel_reference=i.source_parcel_reference
  WHERE m.preparation_sha256=p_preparation ORDER BY m.created_at DESC,m.id DESC LIMIT 50) x;
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.created_at DESC,x.id DESC),'[]') INTO acceptances FROM (
  SELECT a.id,a.created_at,jsonb_build_object('id',a.id,'review_event_id',a.review_event_id,'actor_user_id',a.actor_user_id,
   'consumer_user_id',a.consumer_user_id,'consumer_org_id',a.consumer_org_id,
   'consumer_label',coalesce(nullif(p.full_name,''),nullif(p.email,''),a.consumer_user_id::text),
   'purpose',a.purpose,'scope',a.scope,'record_keys',a.record_keys,'selection_sha256',a.selection_sha256,
   'mapping_ids',a.mapping_ids,'valid_until',a.valid_until,'created_at',a.created_at,'resolutions_available',true)
    ||snap_relaunch.owner_source_acceptance_status_v1(p_preparation,a.id) payload
  FROM snap_relaunch.customer_source_acceptances a LEFT JOIN public.profiles p ON p.user_id=a.consumer_user_id
  WHERE a.preparation_sha256=p_preparation ORDER BY a.created_at DESC,a.id DESC LIMIT 50) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') INTO revocations FROM (
  SELECT id,kind,target_id,actor_user_id,evidence_sha256,note,created_at FROM snap_relaunch.source_revocations
  WHERE preparation_sha256=p_preparation ORDER BY created_at DESC,id DESC LIMIT 50) x;
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.created_at DESC,x.id DESC),'[]') INTO links FROM (
  SELECT l.id,l.created_at,jsonb_build_object('id',l.id,'acceptance_id',l.acceptance_id,'source_property_id',l.source_property_id,
   'customer_property_id',l.customer_property_id,'consumer_user_id',l.consumer_user_id,'org_id',l.org_id,
   'lead_id',l.lead_id,'activity_id',l.activity_id,'created_at',l.created_at)
    ||snap_relaunch.owner_source_acceptance_status_v1(p_preparation,l.acceptance_id) payload
  FROM snap_relaunch.source_crm_links l JOIN snap_relaunch.customer_source_acceptances a ON a.id=l.acceptance_id
  WHERE a.preparation_sha256=p_preparation ORDER BY l.created_at DESC,l.id DESC LIMIT 50) x;
 result:=jsonb_build_object('version','owner-source-action-state-v1','preparation_sha256',p_preparation,'actor_user_id',actor,
  'checked_at',clock_timestamp(),'can_administer',true,'counts',counts,
  'complete',NOT EXISTS(SELECT 1 FROM jsonb_each_text(counts) WHERE value::bigint>50),
  'reviews',reviews,'mappings',mappings,'acceptances',acceptances,'revocations',revocations,'crm_links',links,
  'execution_authorization','Current describes source authorization only. Export allowance and account access are checked again by the execution RPC.');
 IF octet_length(result::text)>4194304 THEN RAISE EXCEPTION 'Owner action state requires a narrower reviewed view' USING ERRCODE='54000';END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.fn_preview_source_target_v1(p_preparation text,p_property_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
DECLARE p public.properties%ROWTYPE;BEGIN
 PERFORM snap_relaunch.require_source_actor_v1(p_preparation,true);
 SELECT t.* INTO p FROM public.properties t WHERE t.id=p_property_id
  AND (public.fn_source_property_visible_v1(t.id) OR EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings m WHERE m.customer_property_id=t.id AND m.preparation_sha256=p_preparation));
 IF NOT FOUND THEN RAISE EXCEPTION 'Exact property preview unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('version','owner-source-target-preview-v1','preparation_sha256',p_preparation,
  'property_id',p.id,'address',p.address,'city',p.city,'state',p.state,'zip',p.zip,'enforcement_type',p.enforcement_type,
  'target_sha256',snap_relaunch.source_hash_v1(to_jsonb(p)),'source_created',public.fn_is_source_property_v1(p.id),
  'already_mapped',EXISTS(SELECT 1 FROM snap_relaunch.customer_property_mappings WHERE customer_property_id=p.id),
  'supported_scope',p.enforcement_type IS NOT DISTINCT FROM 'code_violation' AND p.state IS NOT DISTINCT FROM 'NY');
END $$;

CREATE FUNCTION public.fn_lookup_source_consumer_v1(p_preparation text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
DECLARE p public.profiles%ROWTYPE;s public.user_subscriptions%ROWTYPE;stages jsonb;active boolean;mode text;current_sub boolean:=false;BEGIN
 PERFORM snap_relaunch.require_source_actor_v1(p_preparation,true);
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 IF NOT FOUND OR p.org_id IS NULL THEN RAISE EXCEPTION 'Exact consumer account unavailable' USING ERRCODE='42501';END IF;
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND confirmed_at IS NOT NULL AND NOT coalesce(is_anonymous,false)
  AND (banned_until IS NULL OR banned_until<=now())) INTO active;
 IF NOT active THEN RAISE EXCEPTION 'Exact consumer account unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.user_subscriptions WHERE user_id=p_user_id ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN mode:='payg';current_sub:=true;
 ELSIF s.status IN ('trial','trialing') THEN mode:='trial';current_sub:=s.trial_started_at<=now() AND s.trial_ends_at>now();
 ELSE mode:='subscription';current_sub:=s.status='active' AND s.current_period_start<=now() AND s.current_period_end>now();END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order,'color',color,'is_won',is_won,'is_lost',is_lost,'is_default',is_default) ORDER BY sort_order,id),'[]') INTO stages
  FROM public.pipeline_stages WHERE org_id=p.org_id;
 RETURN jsonb_build_object('version','owner-source-consumer-preview-v1','preparation_sha256',p_preparation,
  'user_id',p.user_id,'org_id',p.org_id,'label',coalesce(nullif(p.full_name,''),nullif(p.email,''),p.user_id::text),
  'email',p.email,'active_account',active,'customer_access_held',NOT coalesce(public.has_role(p.user_id,'admin'::public.app_role),false),
  'subscription',jsonb_build_object('mode',mode,'status',s.status,'current',coalesce(current_sub,false),'quota_checked',false),'stages',stages);
END $$;

CREATE FUNCTION public.fn_owner_source_acceptance_detail_v1(p_preparation text,p_acceptance_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;result jsonb;BEGIN
 PERFORM snap_relaunch.require_source_actor_v1(p_preparation,true);
 SELECT * INTO a FROM snap_relaunch.customer_source_acceptances WHERE id=p_acceptance_id AND preparation_sha256=p_preparation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source acceptance unavailable' USING ERRCODE='42501';END IF;
 result:=jsonb_build_object('version','owner-source-acceptance-detail-v1','preparation_sha256',p_preparation,
  'acceptance_id',a.id,'review_event_id',a.review_event_id,'consumer_user_id',a.consumer_user_id,'consumer_org_id',a.consumer_org_id,
  'purpose',a.purpose,'scope',a.scope,'record_keys',a.record_keys,'selection_sha256',a.selection_sha256,'mapping_ids',a.mapping_ids,
  'mapped_items',a.mapped_items,'resolutions',a.resolutions,'evidence_sha256',a.evidence_sha256,'valid_until',a.valid_until,
  'created_at',a.created_at)||snap_relaunch.owner_source_acceptance_status_v1(p_preparation,a.id);
 IF octet_length(result::text)>8388608 THEN RAISE EXCEPTION 'Owner acceptance detail exceeds the supported view size' USING ERRCODE='54000';END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION snap_relaunch.owner_source_acceptance_status_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_owner_source_action_state_v1(text),public.fn_preview_source_target_v1(text,uuid),
 public.fn_lookup_source_consumer_v1(text,uuid),public.fn_owner_source_acceptance_detail_v1(text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_owner_source_action_state_v1(text),public.fn_preview_source_target_v1(text,uuid),
 public.fn_lookup_source_consumer_v1(text,uuid),public.fn_owner_source_acceptance_detail_v1(text,uuid) TO authenticated;
