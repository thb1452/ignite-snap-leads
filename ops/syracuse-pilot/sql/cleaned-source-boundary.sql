-- CUSTOMER database. Additive, private, atomic; original intake stays immutable.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION snap_relaunch.canonical_clean_json_v1(j jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE jsonb_typeof(j)
 WHEN 'object' THEN '{'||coalesce((SELECT string_agg(to_jsonb(key)::text||':'||snap_relaunch.canonical_clean_json_v1(value),',' ORDER BY key COLLATE "C") FROM jsonb_each(j)),'')||'}'
 WHEN 'array' THEN '['||coalesce((SELECT string_agg(snap_relaunch.canonical_clean_json_v1(value),',' ORDER BY ord) FROM jsonb_array_elements(j) WITH ORDINALITY e(value,ord)),'')||']'
 ELSE j::text END
$$;
REVOKE ALL ON FUNCTION snap_relaunch.canonical_clean_json_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE snap_relaunch.cleaned_source_events_v1 (
 preparation_sha256 text NOT NULL,
 record_key text NOT NULL,
 revision_sha256 text NOT NULL CHECK(revision_sha256 ~ '^[0-9a-f]{64}$'),
 cleaned_sha256 text NOT NULL CHECK(cleaned_sha256 ~ '^[0-9a-f]{64}$'),
 payload jsonb NOT NULL,
 PRIMARY KEY(preparation_sha256,record_key),
 FOREIGN KEY(preparation_sha256,record_key) REFERENCES snap_relaunch.intake_events(preparation_sha256,record_key)
);
CREATE TABLE snap_relaunch.source_intake_receipts_v1 (
 preparation_sha256 text PRIMARY KEY REFERENCES snap_relaunch.intake_batches,
 envelope_sha256 text NOT NULL CHECK(envelope_sha256 ~ '^[0-9a-f]{64}$'),
 receipt jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE snap_relaunch.cleaned_source_events_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_relaunch.source_intake_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.cleaned_source_events_v1,snap_relaunch.source_intake_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cleaned_source_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_relaunch.cleaned_source_events_v1
FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation();
CREATE TRIGGER source_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON snap_relaunch.source_intake_receipts_v1
FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_intake_mutation();

CREATE FUNCTION snap_relaunch.stage_clean_syracuse_v1(p_envelope_text text,p_envelope_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE j jsonb; intake jsonb; prep text; prior snap_relaunch.source_intake_receipts_v1%ROWTYPE;
 r jsonb; ev snap_relaunch.intake_events%ROWTYPE; original jsonb; a jsonb; pe jsonb; item jsonb; clean jsonb;
 result jsonb; n integer; parcels integer; seen text[]:='{}'; fact jsonb;
BEGIN
 IF p_envelope_text IS NULL OR octet_length(p_envelope_text)>1048576 OR
  encode(sha256(convert_to(p_envelope_text,'UTF8')),'hex') IS DISTINCT FROM p_envelope_sha256 THEN
  RAISE EXCEPTION 'Invalid handoff hash or size' USING ERRCODE='22023';END IF;
 j:=p_envelope_text::jsonb;prep:=j->>'preparation_sha256';
 IF j->>'version' IS DISTINCT FROM 'syracuse-private-handoff-v1' OR j#>>'{cleaning,version}' IS DISTINCT FROM 'syracuse-clean-events-v1'
  OR j#>'{cleaning,customer_accepted}' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'Unsupported handoff' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(prep,0));
 SELECT * INTO prior FROM snap_relaunch.source_intake_receipts_v1 WHERE preparation_sha256=prep;
 IF FOUND THEN
  IF prior.envelope_sha256<>p_envelope_sha256 THEN RAISE EXCEPTION 'Handoff replay conflict' USING ERRCODE='22023';END IF;
  RETURN prior.receipt||jsonb_build_object('status','replayed');
 END IF;
 result:=snap_relaunch.stage_intake_v1(j->>'payload_text',j->>'payload_sha256');
 intake:=(j->>'payload_text')::jsonb;
 IF intake->>'preparation_sha256' IS DISTINCT FROM prep
  OR j->>'delivery_id' IS DISTINCT FROM ((intake->>'preparation_text')::jsonb->>'delivery_id')
  OR j->>'processing_run_id' IS DISTINCT FROM ((intake->>'preparation_text')::jsonb->>'processing_run_id')
  OR jsonb_array_length(j#>'{cleaning,records}') IS DISTINCT FROM (result->>'events')::integer
  OR jsonb_array_length(j->'identities') IS DISTINCT FROM (result->>'parcels')::integer
  OR (j#>>'{cleaning,counts,cleaned}')::integer IS DISTINCT FROM (result->>'events')::integer
  OR (j#>>'{cleaning,source_rows}')::integer IS DISTINCT FROM
   ((j#>>'{cleaning,counts,cleaned}')::integer+(j#>>'{cleaning,counts,held}')::integer+
    (j#>>'{cleaning,counts,duplicates}')::integer+(j#>>'{cleaning,counts,outside_selection}')::integer) THEN
  RAISE EXCEPTION 'Handoff reconciliation failed' USING ERRCODE='22023';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(j->'identities') LOOP
  pe:=(item->>'evidence_text')::jsonb;a:=pe#>'{source_feature,attributes}';
  IF encode(sha256(convert_to(item->>'evidence_text','UTF8')),'hex') IS DISTINCT FROM item->>'evidence_sha256'
   OR pe->>'property_id' IS DISTINCT FROM item->>'property_id'
   OR pe->>'identity_key' IS DISTINCT FROM item->>'identity_key'
   OR pe->>'preparation_sha256' IS DISTINCT FROM prep
   OR pe->>'source_authority' IS DISTINCT FROM 'city-of-syracuse-ny'
   OR a->>'SBL' IS DISTINCT FROM item->>'source_parcel_reference'
   OR NOT EXISTS(SELECT 1 FROM snap_relaunch.parcel_evidence old
     WHERE old.property_id=(item->>'property_id')::uuid
      AND (old.evidence_text::jsonb)->'source_feature'=pe->'source_feature'
      AND old.source_retrieved_at=(pe->>'source_retrieved_at')::timestamptz)
   OR NOT EXISTS(SELECT 1 FROM snap_relaunch.intake_parcels ip WHERE ip.preparation_sha256=prep
     AND ip.source_parcel_reference=a->>'SBL' AND upper(trim(ip.source_address))=upper(trim(a->>'FullAddres'))
     AND ip.zip=a->>'Zip') THEN
   RAISE EXCEPTION 'Existing parcel evidence does not match' USING ERRCODE='22023';END IF;
  -- The existing identity is required; this importer never invents or merges one.
  INSERT INTO snap_relaunch.parcel_evidence(property_id,source_parcel_reference,preparation_sha256,evidence_sha256,evidence_text,
   source_scope,source_item_id,source_retrieved_at,source_address,city,state,zip,latitude,longitude,
   recorded_residential_units,recorded_year_built,recorded_lot_acres)
  VALUES((item->>'property_id')::uuid,item->>'source_parcel_reference',prep,item->>'evidence_sha256',item->>'evidence_text',
   pe->>'source_scope',pe->>'source_item_id',(pe->>'source_retrieved_at')::timestamptz,a->>'FullAddres',pe->>'city',pe->>'state',a->>'Zip',
   (a->>'LATITUDE')::float8,(a->>'LONGITUDE')::float8,(a->>'n_ResUnits')::integer,(a->>'yr_built')::integer,(a->>'ACRES')::numeric);
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(j#>'{cleaning,records}') LOOP
  IF r->>'record_key'=ANY(seen) THEN RAISE EXCEPTION 'Duplicate cleaned event' USING ERRCODE='22023';END IF;
  seen:=array_append(seen,r->>'record_key');
  SELECT * INTO STRICT ev FROM snap_relaunch.intake_events WHERE preparation_sha256=prep AND record_key=r->>'record_key';
  original:=ev.original_text::jsonb;a:=original->'raw_government_attributes';
  IF coalesce(a->>'violation','') NOT IN (
   'SPCC - Section 27-116 (E) - Vacant Property Registry ',
   '2025 PMCNYS - Section 109.1.3 - Structure Unfit for Human Occupancy',
   'SPCC-Sec. 27-133 Registration','SPCC - Section 27-73 (a) - Exterior Surfaces',
   '2025 PMCNYS - Section 304.7 - Roofs and Drainage',
   '2025 PMCNYS - Section 304.13 - Window, Skylight and Door Frames',
   '2025 PMCNYS - Section 301.3 - Vacant Structures and Land',
   '2025 FCNYS - Section 806.2 - Obstruction of Means of Egress')
   OR coalesce(a->>'status_type_name','') NOT IN ('Open','Closed','Void')
   OR coalesce(a->>'SBL','') NOT IN ('002.-15-10.0','003.-13-11.0','007.-14-07.0')
   OR r->>'cleaning_version' IS DISTINCT FROM 'syracuse-clean-events-v1'
   OR r->>'cleaned_description' IS DISTINCT FROM a->>'violation'
   OR r->>'government_violation_id' IS DISTINCT FROM a->>'violation_id'
   OR r->>'case_id' IS DISTINCT FROM a->>'complaint_number'
   OR r->>'published_violation_number' IS DISTINCT FROM a->>'violation_number'
   OR r->>'parcel_id' IS DISTINCT FROM a->>'SBL'
   OR r->>'address' IS DISTINCT FROM a->>'complaint_address'
   OR r->>'zip' IS DISTINCT FROM a->>'complaint_zip'
   OR r->>'source_status' IS DISTINCT FROM a->>'status_type_name'
   OR r->>'normalized_status' IS DISTINCT FROM lower(a->>'status_type_name')
   OR r#>>'{citation,original_sha256}' IS DISTINCT FROM ev.original_sha256
   OR r#>>'{citation,input_sha256}' IS DISTINCT FROM j->>'input_sha256'
   OR r#>>'{citation,delivery_id}' IS DISTINCT FROM j->>'delivery_id'
   OR r#>>'{citation,processing_run_id}' IS DISTINCT FROM j->>'processing_run_id'
   OR (r#>>'{citation,source_row}')::integer IS DISTINCT FROM ev.source_row
   OR encode(sha256(convert_to(to_jsonb(a->>'violation')::text,'UTF8')),'hex') IS DISTINCT FROM r->>'cleaned_sha256'
   OR NOT EXISTS(SELECT 1 FROM snap_relaunch.property_identities pi WHERE pi.property_id=(r->>'property_id')::uuid AND pi.source_parcel_reference=a->>'SBL') THEN
   RAISE EXCEPTION 'Clean source binding failed' USING ERRCODE='22023';END IF;
  -- Exclusive field projection: do not store/pass client fields, raw text,
  -- parcel contact columns, owner names or a user-supplied insight here.
  SELECT jsonb_object_agg(key,value) INTO clean FROM jsonb_each(r) WHERE key=ANY(ARRAY[
   'record_key','property_id','parcel_id','government_violation_id','published_violation_number','case_id','address','city','state','zip',
   'cleaned_description','source_status','normalized_status','case_opened_at','citation_at','status_changed_at','compliance_due_at',
   'revision_sha256','cleaning_version','cleaned_sha256','citation','source_attribution','source_notice','terms_url','record_grain','limitations']);
  IF clean IS DISTINCT FROM r OR (SELECT count(*) FROM jsonb_object_keys(clean))<>26
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r->'citation') key) IS DISTINCT FROM
    ARRAY['collected_at','delivery_id','input_sha256','original_sha256','parcel_evidence_sha256','parcel_retrieved_at','processing_run_id','publication_date','source_row','source_url']::text[]
   OR r->>'city' IS DISTINCT FROM 'Syracuse' OR r->>'state' IS DISTINCT FROM 'NY'
   OR r->>'record_grain' IS DISTINCT FROM 'source_violation'
   OR r#>>'{citation,source_url}' IS DISTINCT FROM 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0'
   OR r->>'terms_url' IS DISTINCT FROM 'https://data.syr.gov/pages/termsofuse'
   OR r->>'source_attribution' IS DISTINCT FROM 'City of Syracuse Open Data, Code Violations V2'
   OR r->>'source_notice' IS DISTINCT FROM 'The City of Syracuse makes no representation, warranty or guarantee relating to the data or analyses derived from these data.'
   OR r->'limitations' IS DISTINCT FROM '["Status describes the agency record at collection; present physical condition is unverified.","The selected citation window is not the full property history. Absence from a later collection does not mean closed.","Case opening and violation citation dates are different; a distinct violation opening date is unavailable.","Affected unit, current occupancy, ownership, repair cost, market value and owner intent are unavailable.","The portal dataset is informational and is not the official city record."]'::jsonb THEN
   RAISE EXCEPTION 'Unreviewed output fields' USING ERRCODE='22023';END IF;
  IF (r->>'case_opened_at')::timestamptz IS DISTINCT FROM to_timestamp((a->>'open_date')::numeric/1000)
   OR (r->>'citation_at')::timestamptz IS DISTINCT FROM to_timestamp((a->>'violation_date')::numeric/1000)
   OR (r->>'status_changed_at')::timestamptz IS DISTINCT FROM to_timestamp((a->>'status_date')::numeric/1000)
   OR (r->>'compliance_due_at')::timestamptz IS DISTINCT FROM to_timestamp((a->>'comply_by_date')::numeric/1000)
   OR (r#>>'{citation,collected_at}')::timestamptz IS DISTINCT FROM (original->>'collected_at')::timestamptz
   OR r#>'{citation,publication_date}' IS DISTINCT FROM 'null'::jsonb
   OR NOT EXISTS(SELECT 1 FROM snap_relaunch.parcel_evidence old
     WHERE old.property_id=(r->>'property_id')::uuid AND old.evidence_sha256=r#>>'{citation,parcel_evidence_sha256}'
      AND old.source_retrieved_at=(r#>>'{citation,parcel_retrieved_at}')::timestamptz) THEN
   RAISE EXCEPTION 'Clean date or parcel citation changed' USING ERRCODE='22023';END IF;
  fact:=r-ARRAY['revision_sha256','cleaning_version','cleaned_sha256','citation','source_attribution','source_notice','terms_url','record_grain','limitations'];
  IF encode(sha256(convert_to(snap_relaunch.canonical_clean_json_v1(fact),'UTF8')),'hex') IS DISTINCT FROM r->>'revision_sha256'
   OR encode(sha256(convert_to('["city-of-syracuse-ny","source_violation",'||to_jsonb(a->>'violation_id')::text||']','UTF8')),'hex') IS DISTINCT FROM ev.record_key THEN
   RAISE EXCEPTION 'Native identity or clean revision changed' USING ERRCODE='22023';END IF;
  INSERT INTO snap_relaunch.cleaned_source_events_v1 VALUES(prep,ev.record_key,r->>'revision_sha256',r->>'cleaned_sha256',clean);
 END LOOP;
 result:=jsonb_build_object('version','syracuse-private-handoff-v1','status','staged','preparation_sha256',prep,
  'payload_sha256',j->>'payload_sha256','delivery_id',j->>'delivery_id','processing_run_id',j->>'processing_run_id',
  'events',jsonb_array_length(j#>'{cleaning,records}'),'parcels',jsonb_array_length(j->'identities'),'customer_accepted',false);
 INSERT INTO snap_relaunch.source_intake_receipts_v1(preparation_sha256,envelope_sha256,receipt) VALUES(prep,p_envelope_sha256,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION snap_relaunch.stage_clean_syracuse_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.fn_source_investor_evidence_v1(p_acceptance_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE; events jsonb;
BEGIN
 a:=snap_relaunch.require_source_acceptance_v1(p_acceptance_id,'customer_export');
 SELECT jsonb_agg(c.payload ORDER BY c.payload->>'citation_at',c.record_key) INTO events
 FROM snap_relaunch.cleaned_source_events_v1 c
 WHERE c.preparation_sha256=a.preparation_sha256 AND c.record_key=ANY(a.record_keys);
 IF jsonb_array_length(events) IS DISTINCT FROM cardinality(a.record_keys) THEN
  RAISE EXCEPTION 'Accepted clean source evidence unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('version','accepted-clean-investor-evidence-v1','acceptance_id',a.id,
  'acceptance_revision',a.command_sha256,'as_of',clock_timestamp(),'events',events);
END $$;
-- Keep the reader closed until the entitlement-aware customer/export path is
-- installed and tested. Source acceptance alone does not authorize a paid export.
REVOKE ALL ON FUNCTION public.fn_source_investor_evidence_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
