CREATE OR REPLACE FUNCTION snap_relaunch.stage_intake_v1(p_payload text, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'snap_relaunch'
AS $function$
DECLARE
  j jsonb; m jsonb; e jsonb; p jsonb; ref jsonb;
  prep text; event_count integer; parcel_count integer; inserted integer;
  old_hash text; old_payload text;
BEGIN
  IF p_payload IS NULL OR octet_length(p_payload) > 1048576 OR p_sha256 IS NULL
     OR encode(sha256(convert_to(p_payload,'UTF8')),'hex') IS DISTINCT FROM p_sha256 THEN
    RAISE EXCEPTION 'Invalid intake payload hash or size';
  END IF;
  j := p_payload::jsonb;
  IF j->>'version' IS DISTINCT FROM 'customer-intake-v1'
     OR j->>'source_project_ref' IS DISTINCT FROM 'dqwolscmceelqpkfclgi'
     OR j->>'customer_project_ref' IS DISTINCT FROM 'ojyxblegxpdgaqiscxpz' THEN
    RAISE EXCEPTION 'Wrong intake contract or database binding';
  END IF;
  prep := j->>'preparation_sha256';
  IF encode(sha256(convert_to(j->>'preparation_text','UTF8')),'hex') IS DISTINCT FROM prep OR prep IS NULL THEN
    RAISE EXCEPTION 'Preparation bytes do not match';
  END IF;
  m := (j->>'preparation_text')::jsonb;
  IF m->>'version' IS DISTINCT FROM 'syracuse-review-preparation-v1'
     OR m->'customer_accepted' IS DISTINCT FROM 'false'::jsonb
     OR m->'usable_records' IS DISTINCT FROM 'false'::jsonb
     OR m->'customer_export_authorized' IS DISTINCT FROM 'false'::jsonb
     OR m->'published' IS DISTINCT FROM 'false'::jsonb
     OR m->'approved_property_mappings' IS DISTINCT FROM '0'::jsonb
     OR m->>'purpose' IS DISTINCT FROM 'private_review_only'
     OR jsonb_typeof(j->'events') IS DISTINCT FROM 'array'
     OR jsonb_typeof(j->'parcels') IS DISTINCT FROM 'array'
     OR jsonb_typeof(m->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Only unapproved review preparation is supported';
  END IF;
  event_count := jsonb_array_length(j->'events'); parcel_count := jsonb_array_length(j->'parcels');
  IF event_count NOT BETWEEN 1 AND 2000 OR parcel_count NOT BETWEEN 1 AND 2000
     OR event_count IS DISTINCT FROM (m->>'violation_records')::integer
     OR parcel_count IS DISTINCT FROM (m->>'assessed_parcels')::integer
     OR event_count IS DISTINCT FROM jsonb_array_length(m->'items') THEN
    RAISE EXCEPTION 'Intake count mismatch';
  END IF;
  INSERT INTO snap_relaunch.intake_batches(preparation_sha256,payload_sha256,payload_text,source_project_ref,
    customer_project_ref,delivery_id,processing_run_id,record_type,collected_at,event_count,parcel_count)
  VALUES(prep,p_sha256,p_payload,j->>'source_project_ref',j->>'customer_project_ref',
    (m->>'delivery_id')::uuid,(m->>'processing_run_id')::uuid,'code_violation',
    (m->>'code_collected_at')::timestamptz,event_count,parcel_count)
  ON CONFLICT (preparation_sha256) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    SELECT payload_sha256,payload_text INTO old_hash,old_payload FROM snap_relaunch.intake_batches WHERE preparation_sha256=prep;
    IF old_hash IS DISTINCT FROM p_sha256 OR old_payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Preparation replay differs from original intake';
    END IF;
    RETURN jsonb_build_object('status','replayed','preparation_sha256',prep,'events',event_count,'parcels',parcel_count,'customer_accepted',false);
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(j->'parcels') LOOP
    IF p->>'city' IS DISTINCT FROM 'Syracuse' OR p->>'state' IS DISTINCT FROM 'NY'
       OR p->>'customer_property_id' IS DISTINCT FROM '' OR p->>'customer_accepted' IS DISTINCT FROM 'false'
       OR p->>'usable_records' IS DISTINCT FROM 'false' OR p->>'customer_export_authorized' IS DISTINCT FROM 'false'
       OR p->>'published' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Invalid parcel review state'; END IF;
    INSERT INTO snap_relaunch.intake_parcels VALUES(prep,p->>'source_parcel_reference',p->>'source_address',
      p->>'city',p->>'state',p->>'zip',p);
  END LOOP;
  FOR e IN SELECT value FROM jsonb_array_elements(j->'events') LOOP
    SELECT value INTO STRICT ref FROM jsonb_array_elements(m->'items')
      WHERE value->>'record_key'=e->>'record_key' AND value->>'source_row'=e->>'source_row';
    IF e->>'original_sha256' IS DISTINCT FROM ref->>'original_sha256'
       OR e->>'canonical_sha256' IS DISTINCT FROM ref->>'canonical_sha256'
       OR e->>'source_parcel_reference' IS DISTINCT FROM ref->>'source_parcel_reference'
       OR (e->>'review_reasons')::jsonb IS DISTINCT FROM ref->'review_reasons'
       OR ref->'customer_property_id' IS DISTINCT FROM 'null'::jsonb
       OR e->>'customer_property_id' IS DISTINCT FROM '' OR e->>'customer_accepted' IS DISTINCT FROM 'false'
       OR e->>'usable_records' IS DISTINCT FROM 'false' OR e->>'customer_export_authorized' IS DISTINCT FROM 'false'
       OR e->>'published' IS DISTINCT FROM 'false' OR e->>'delivery_id' IS DISTINCT FROM m->>'delivery_id'
       OR e->>'processing_run_id' IS DISTINCT FROM m->>'processing_run_id' THEN
      RAISE EXCEPTION 'Event source binding or review state differs';
    END IF;
    IF (e->>'source_original_json')::jsonb->>'case_id' IS DISTINCT FROM e->>'case_id'
       OR coalesce((e->>'source_original_json')::jsonb->>'government_numeric_violation_id',(e->>'source_original_json')::jsonb#>>'{raw_government_attributes,violation_id}') IS DISTINCT FROM e->>'source_numeric_violation_id'
       OR (e->>'source_original_json')::jsonb->'raw_government_attributes'->>'SBL' IS DISTINCT FROM e->>'source_parcel_reference' THEN
      RAISE EXCEPTION 'Government event identity differs';
    END IF;
    INSERT INTO snap_relaunch.intake_events VALUES(prep,(e->>'source_row')::integer,e->>'record_key',
      e->>'source_parcel_reference',e->>'source_numeric_violation_id',e->>'case_id',e->>'published_violation_number',
      e->>'original_sha256',e->>'canonical_sha256',e->>'source_original_json',e,(e->>'review_reasons')::jsonb);
  END LOOP;
  RETURN jsonb_build_object('status','staged','preparation_sha256',prep,'events',event_count,'parcels',parcel_count,'customer_accepted',false);
END;
$function$;
