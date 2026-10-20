-- One reviewed Buffalo source snapshot only. This does not release the global
-- upload hold, write legacy properties/violations, or authorize customer export.
-- Run as the existing privileged migration owner in one transaction. The import
-- function remains private, SECURITY INVOKER, and unavailable to API roles.
-- Owner access is deliberately NOT installed here: after inspecting the receipt,
-- the operator separately grants the verified existing owner this exact batch.
BEGIN;

CREATE SCHEMA IF NOT EXISTS snap_relaunch;

CREATE TABLE snap_relaunch.buffalo_pilot_batches_v1 (
  pilot_key text PRIMARY KEY CHECK (pilot_key = 'buffalo-residential-code-20261020-v1'),
  preparation_sha256 text UNIQUE NOT NULL CHECK (preparation_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 = 'e8a160bb048efb984f54008248ceba5c9cc6fa83f564483743038e00428a2e68'),
  records_sha256 text NOT NULL CHECK (records_sha256 = '2b86ea206f5288e9fae9ec6b00b66a19bfaee731c2852c6fdbcf921333c64a71'),
  source_id text NOT NULL CHECK (source_id = 'SRC_2c09ff0ee9f5da4d'),
  source_url text NOT NULL CHECK (source_url = 'https://data.buffalony.gov/resource/ivrf-k9vm.json'),
  source_name text NOT NULL CHECK (source_name = 'City of Buffalo, NY'),
  collected_at timestamptz NOT NULL CHECK (collected_at = '2026-10-19T23:43:46.001147+00:00'::timestamptz),
  event_count integer NOT NULL CHECK (event_count = 984),
  case_count integer NOT NULL CHECK (case_count = 322),
  address_count integer NOT NULL CHECK (address_count = 307),
  held_count integer NOT NULL CHECK (held_count = 4),
  payload_text text NOT NULL CHECK (octet_length(payload_text) <= 4194304),
  manifest_text text NOT NULL,
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE snap_relaunch.buffalo_pilot_events_v1 (
  source_id text NOT NULL CHECK (source_id = 'SRC_2c09ff0ee9f5da4d'),
  agency_record_id text NOT NULL CHECK (agency_record_id ~ '^[0-9]+$' AND agency_record_id NOT IN ('538939','538938','539418','539421')),
  preparation_sha256 text NOT NULL REFERENCES snap_relaunch.buffalo_pilot_batches_v1(preparation_sha256),
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  raw_content_sha256 text NOT NULL CHECK (raw_content_sha256 ~ '^[a-f0-9]{64}$'),
  cleaned_sha256 text NOT NULL CHECK (cleaned_sha256 ~ '^[a-f0-9]{64}$'),
  raw_source_text text NOT NULL,
  cleaned_text text NOT NULL,
  raw_source jsonb NOT NULL CHECK (jsonb_typeof(raw_source) = 'object'),
  cleaned jsonb NOT NULL CHECK (jsonb_typeof(cleaned) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (source_id, agency_record_id),
  UNIQUE (preparation_sha256, source_row_number),
  CHECK (agency_record_id = cleaned->>'agency_record_id' AND agency_record_id = raw_source->>'uniquekey'),
  CHECK (source_id = cleaned->>'source_id'),
  CHECK (raw_content_sha256 = cleaned->>'source_content_hash')
);

CREATE TABLE snap_relaunch.buffalo_pilot_review_access_v1 (
  review_user_id uuid NOT NULL CONSTRAINT buffalo_pilot_review_access_user_fk_v1 REFERENCES auth.users(id) ON DELETE CASCADE,
  preparation_sha256 text NOT NULL REFERENCES snap_relaunch.buffalo_pilot_batches_v1(preparation_sha256),
  enabled boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  revoked_at timestamptz,
  PRIMARY KEY (review_user_id, preparation_sha256),
  CHECK (review_user_id = '242fb409-b137-46d5-9aa6-2696710f5fcd'::uuid)
);

ALTER TABLE snap_relaunch.buffalo_pilot_batches_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_relaunch.buffalo_pilot_events_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_relaunch.buffalo_pilot_review_access_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.buffalo_pilot_batches_v1,
  snap_relaunch.buffalo_pilot_events_v1,
  snap_relaunch.buffalo_pilot_review_access_v1 FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION snap_relaunch.reject_buffalo_pilot_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Buffalo pilot evidence is immutable; changes require a separately reviewed revision' USING ERRCODE = '42501';
END;
$function$;
REVOKE ALL ON FUNCTION snap_relaunch.reject_buffalo_pilot_mutation_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER buffalo_pilot_batches_immutable_v1
BEFORE UPDATE OR DELETE ON snap_relaunch.buffalo_pilot_batches_v1
FOR EACH ROW EXECUTE FUNCTION snap_relaunch.reject_buffalo_pilot_mutation_v1();
CREATE TRIGGER buffalo_pilot_batches_no_truncate_v1
BEFORE TRUNCATE ON snap_relaunch.buffalo_pilot_batches_v1
FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_buffalo_pilot_mutation_v1();
CREATE TRIGGER buffalo_pilot_events_immutable_v1
BEFORE UPDATE OR DELETE ON snap_relaunch.buffalo_pilot_events_v1
FOR EACH ROW EXECUTE FUNCTION snap_relaunch.reject_buffalo_pilot_mutation_v1();
CREATE TRIGGER buffalo_pilot_events_no_truncate_v1
BEFORE TRUNCATE ON snap_relaunch.buffalo_pilot_events_v1
FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.reject_buffalo_pilot_mutation_v1();

-- The event ledger accepts exactly one complete reviewed INSERT statement.
-- No later direct SQL insert may add a 985th row or displace a paginated record.
CREATE FUNCTION snap_relaunch.seal_buffalo_pilot_events_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog SET row_security = on
AS $function$
DECLARE v_count bigint; v_digest text;
BEGIN
  IF TG_OP <> 'INSERT' OR TG_LEVEL <> 'STATEMENT'
     OR TG_TABLE_SCHEMA <> 'snap_relaunch' OR TG_TABLE_NAME <> 'buffalo_pilot_events_v1' THEN
    RAISE EXCEPTION 'Invalid Buffalo ledger seal invocation' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('snap:buffalo:SRC_2c09ff0ee9f5da4d', 0));
  IF TG_WHEN = 'BEFORE' THEN
    IF EXISTS (SELECT 1 FROM snap_relaunch.buffalo_pilot_events_v1) THEN
      RAISE EXCEPTION 'Buffalo pilot ledger is sealed; further records require a separately reviewed batch' USING ERRCODE = '42501';
    END IF;
    RETURN NULL;
  ELSIF TG_WHEN <> 'AFTER' THEN
    RAISE EXCEPTION 'Invalid Buffalo ledger seal timing' USING ERRCODE = '42501';
  END IF;
  SELECT count(*), encode(sha256(convert_to(string_agg(
    concat_ws('|',source_id,agency_record_id,source_row_number::text,raw_content_sha256,cleaned_sha256),
    E'\n' ORDER BY source_row_number),'UTF8')),'hex') INTO v_count, v_digest
  FROM snap_relaunch.buffalo_pilot_events_v1;
  IF v_count IS DISTINCT FROM 984
     OR v_digest IS DISTINCT FROM '2b86ea206f5288e9fae9ec6b00b66a19bfaee731c2852c6fdbcf921333c64a71'
     OR EXISTS (SELECT 1 FROM snap_relaunch.buffalo_pilot_events_v1 WHERE
       raw_content_sha256 IS DISTINCT FROM encode(sha256(convert_to(raw_source_text,'UTF8')),'hex')
       OR cleaned_sha256 IS DISTINCT FROM encode(sha256(convert_to(cleaned_text,'UTF8')),'hex')
       OR raw_source IS DISTINCT FROM raw_source_text::jsonb
       OR cleaned IS DISTINCT FROM cleaned_text::jsonb) THEN
    RAISE EXCEPTION 'Buffalo ledger must contain exactly the complete reviewed 984-record batch' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION snap_relaunch.seal_buffalo_pilot_events_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER buffalo_pilot_events_sealed_before_insert_v1
BEFORE INSERT ON snap_relaunch.buffalo_pilot_events_v1
FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.seal_buffalo_pilot_events_v1();
CREATE TRIGGER buffalo_pilot_events_sealed_after_insert_v1
AFTER INSERT ON snap_relaunch.buffalo_pilot_events_v1
FOR EACH STATEMENT EXECUTE FUNCTION snap_relaunch.seal_buffalo_pilot_events_v1();

CREATE FUNCTION snap_relaunch.fn_import_buffalo_pilot_v1(p_payload_text text, p_payload_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog SET row_security = on
AS $function$
DECLARE
  v_payload jsonb; v_manifest jsonb; v_item jsonb; v_clean jsonb; v_raw jsonb;
  v_existing snap_relaunch.buffalo_pilot_batches_v1%ROWTYPE;
  v_clean_text text; v_raw_text text; v_manifest_text text;
  v_clean_hash text; v_raw_hash text; v_manifest_hash text; v_records_hash text;
  v_record_id text; v_source_row integer; v_previous_source_row integer := 0;
  v_ids text[] := ARRAY[]::text[]; v_case_numbers text[] := ARRAY[]::text[];
  v_addresses text[] := ARRAY[]::text[]; v_proof_lines text[] := ARRAY[]::text[];
  v_case_count integer; v_address_count integer; v_count integer := 0;
  v_receipt jsonb; v_created_at timestamptz := transaction_timestamp();
  v_clean_keys constant text[] := ARRAY[
    'batch_state','record_type','source_id','agency_name','agency_record_id','case_number',
    'case_type','violation_code','code_section','violation_description','comments','violation_location',
    'violation_date','source_date_raw','source_status','normalized_status','address','city','state','zip',
    'property_class','residential_evidence','parcel_id','latitude','longitude','source_url',
    'snapshot_finished_at','source_content_hash','input_file_sha256','source_row_number'];
BEGIN
  IF p_payload_text IS NULL OR octet_length(p_payload_text) > 4194304 OR octet_length(p_payload_text) < 1000
     OR p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR encode(sha256(convert_to(p_payload_text, 'UTF8')), 'hex') <> p_payload_sha256 THEN
    RAISE EXCEPTION 'Buffalo payload size or SHA-256 mismatch' USING ERRCODE = '22023';
  END IF;
  v_payload := p_payload_text::jsonb;
  IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
     OR v_payload->>'version' IS DISTINCT FROM 'buffalo-pilot-import-v1'
     OR NOT (v_payload ?& ARRAY['version','manifest_text','manifest_sha256','records'])
     OR (SELECT count(*) FROM jsonb_object_keys(v_payload)) <> 4
     OR (SELECT count(*) <> count(DISTINCT key) FROM json_each(p_payload_text::json))
     OR jsonb_typeof(v_payload->'manifest_text') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload->'manifest_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload->'records') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Buffalo pilot envelope' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_payload->'records') <> 984 THEN
    RAISE EXCEPTION 'This Buffalo pilot requires exactly 984 eligible source violations' USING ERRCODE = '22023';
  END IF;
  v_manifest_text := v_payload->>'manifest_text';
  v_manifest_hash := encode(sha256(convert_to(v_manifest_text, 'UTF8')), 'hex');
  IF v_manifest_hash <> v_payload->>'manifest_sha256'
     OR v_manifest_hash <> 'e8a160bb048efb984f54008248ceba5c9cc6fa83f564483743038e00428a2e68' THEN
    RAISE EXCEPTION 'Buffalo pilot manifest does not match the reviewed preparation' USING ERRCODE = '22023';
  END IF;
  v_manifest := v_manifest_text::jsonb;
  -- A source-wide transaction lock serializes exact replays and changed batches.
  PERFORM pg_advisory_xact_lock(hashtextextended('snap:buffalo:SRC_2c09ff0ee9f5da4d', 0));
  SELECT * INTO v_existing FROM snap_relaunch.buffalo_pilot_batches_v1
    WHERE pilot_key = 'buffalo-residential-code-20261020-v1';
  IF FOUND THEN
    IF v_existing.preparation_sha256 <> p_payload_sha256
       OR v_existing.payload_text <> p_payload_text
       OR v_existing.manifest_sha256 <> v_manifest_hash THEN
      RAISE EXCEPTION 'A different Buffalo pilot or changed source record is held for review; existing evidence was not changed' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM snap_relaunch.buffalo_pilot_events_v1 WHERE preparation_sha256 = p_payload_sha256) <> 984 THEN
      RAISE EXCEPTION 'Buffalo receipt integrity check failed' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.receipt || jsonb_build_object('status', 'replayed');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_payload->'records') LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR NOT (v_item ?& ARRAY['cleaned_text','cleaned_sha256','raw_source_text','raw_content_sha256'])
       OR (SELECT count(*) FROM jsonb_object_keys(v_item)) <> 4
       OR EXISTS (SELECT 1 FROM jsonb_each(v_item) WHERE jsonb_typeof(value) <> 'string') THEN
      RAISE EXCEPTION 'Malformed Buffalo record envelope' USING ERRCODE = '22023';
    END IF;
    v_clean_text := v_item->>'cleaned_text'; v_raw_text := v_item->>'raw_source_text';
    v_clean_hash := v_item->>'cleaned_sha256'; v_raw_hash := v_item->>'raw_content_sha256';
    IF octet_length(v_clean_text) > 32768 OR octet_length(v_raw_text) > 65536
       OR v_clean_hash !~ '^[a-f0-9]{64}$' OR v_raw_hash !~ '^[a-f0-9]{64}$'
       OR encode(sha256(convert_to(v_clean_text, 'UTF8')), 'hex') <> v_clean_hash
       OR encode(sha256(convert_to(v_raw_text, 'UTF8')), 'hex') <> v_raw_hash THEN
      RAISE EXCEPTION 'Buffalo record content hash mismatch' USING ERRCODE = '22023';
    END IF;
    v_clean := v_clean_text::jsonb; v_raw := v_raw_text::jsonb;
    IF jsonb_typeof(v_clean) IS DISTINCT FROM 'object' OR jsonb_typeof(v_raw) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Buffalo source and cleaned records must be JSON objects' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_clean ?& v_clean_keys)
       OR (SELECT count(*) FROM jsonb_object_keys(v_clean)) <> cardinality(v_clean_keys)
       OR EXISTS (SELECT 1 FROM jsonb_each(v_clean) WHERE jsonb_typeof(value) <> 'string')
       OR EXISTS (SELECT 1 FROM jsonb_each(v_raw) WHERE jsonb_typeof(value) <> 'string' OR key LIKE 'audit\_%' ESCAPE '\')
       OR (SELECT count(*) <> count(DISTINCT key) FROM json_each(v_clean_text::json))
       OR (SELECT count(*) <> count(DISTINCT key) FROM json_each(v_raw_text::json)) THEN
      RAISE EXCEPTION 'Buffalo record keys, values or raw provenance are malformed' USING ERRCODE = '22023';
    END IF;
    v_record_id := v_clean->>'agency_record_id';
    IF v_record_id !~ '^[0-9]+$' OR v_record_id IN ('538939','538938','539418','539421')
       OR v_record_id = ANY(v_ids) OR (v_clean->>'source_row_number') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'Duplicate, held or malformed Buffalo agency identity' USING ERRCODE = '22023';
    END IF;
    v_source_row := (v_clean->>'source_row_number')::integer;
    IF v_source_row <= v_previous_source_row THEN
      RAISE EXCEPTION 'Buffalo records must have unique ascending source row numbers' USING ERRCODE = '22023';
    END IF;
    v_previous_source_row := v_source_row;
    IF v_clean->>'batch_state' <> 'PREPARED_ONLY' OR v_clean->>'record_type' <> 'Code'
       OR v_clean->>'source_id' <> 'SRC_2c09ff0ee9f5da4d' OR v_clean->>'agency_name' <> 'City of Buffalo, NY'
       OR v_clean->>'source_url' <> 'https://data.buffalony.gov/resource/ivrf-k9vm.json'
       OR v_clean->>'snapshot_finished_at' <> '2026-10-19T23:43:46.001147+00:00'
       OR v_clean->>'input_file_sha256' <> '3e909c31762d37aad99205a84d9215ef51197b72ae1a92153d1c7f9c7a83796b'
       OR v_clean->>'source_content_hash' <> v_raw_hash
       OR v_clean->>'city' <> 'BUFFALO' OR v_clean->>'state' <> 'NY'
       OR v_clean->>'source_status' <> 'ACTIVE' OR v_clean->>'normalized_status' <> 'active'
       OR v_clean->>'property_class' <> ALL(ARRAY['200','210','215','220','230','240','250','260','270','271','280','281'])
       OR v_clean->>'zip' !~ '^[0-9]{5}$' OR v_clean->>'address' !~ '^[1-9][0-9]*.*[A-Za-z]'
       OR length(btrim(v_clean->>'case_number')) = 0 OR length(btrim(v_clean->>'violation_code')) = 0
       OR length(btrim(v_clean->>'violation_description')) = 0 OR length(btrim(v_clean->>'residential_evidence')) = 0 THEN
      RAISE EXCEPTION 'Buffalo source, residential classification, status or complete address validation failed' USING ERRCODE = '22023';
    END IF;
    IF v_clean->>'violation_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR (v_clean->>'violation_date')::date NOT BETWEEN DATE '2026-09-20' AND DATE '2026-10-20'
       OR left(v_clean->>'source_date_raw', 10) <> v_clean->>'violation_date' THEN
      RAISE EXCEPTION 'Buffalo source date is outside the reviewed window or inconsistent' USING ERRCODE = '22023';
    END IF;
    -- Exact raw identity/source fields: no current-time or invented case-open date.
    IF v_raw->>'uniquekey' IS DISTINCT FROM v_record_id
       OR v_raw->>'case_number' IS DISTINCT FROM v_clean->>'case_number'
       OR v_raw->>'case_type' IS DISTINCT FROM v_clean->>'case_type'
       OR v_raw->>'code' IS DISTINCT FROM v_clean->>'violation_code'
       OR v_raw->>'date' IS DISTINCT FROM v_clean->>'source_date_raw'
       OR v_raw->>'status' IS DISTINCT FROM 'ACTIVE'
       OR v_raw->>'address' IS DISTINCT FROM v_clean->>'address'
       OR v_raw->>'city' IS DISTINCT FROM 'BUFFALO' OR v_raw->>'state' IS DISTINCT FROM 'NY'
       OR v_raw->>'zip' IS DISTINCT FROM v_clean->>'zip'
       OR v_raw->>'propclass' IS DISTINCT FROM v_clean->>'property_class'
       OR v_raw->>'sbl' IS DISTINCT FROM v_clean->>'parcel_id'
       OR v_raw->>'latitude' IS DISTINCT FROM v_clean->>'latitude'
       OR v_raw->>'longitude' IS DISTINCT FROM v_clean->>'longitude' THEN
      RAISE EXCEPTION 'Buffalo raw and cleaned source evidence disagree' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM snap_relaunch.buffalo_pilot_events_v1
      WHERE source_id = 'SRC_2c09ff0ee9f5da4d' AND agency_record_id = v_record_id) THEN
      RAISE EXCEPTION 'A previously collected Buffalo source ID is held for review; it will not be overwritten' USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, v_record_id);
    v_case_numbers := array_append(v_case_numbers, v_clean->>'case_number');
    v_addresses := array_append(v_addresses, jsonb_build_array(v_clean->>'address',v_clean->>'city',v_clean->>'state',v_clean->>'zip')::text);
    v_proof_lines := array_append(v_proof_lines, concat_ws('|', 'SRC_2c09ff0ee9f5da4d', v_record_id, v_source_row::text, v_raw_hash, v_clean_hash));
    v_count := v_count + 1;
  END LOOP;
  SELECT count(DISTINCT x) INTO v_case_count FROM unnest(v_case_numbers) AS x;
  SELECT count(DISTINCT x) INTO v_address_count FROM unnest(v_addresses) AS x;
  v_records_hash := encode(sha256(convert_to(array_to_string(v_proof_lines, E'\n'), 'UTF8')), 'hex');
  IF v_count <> 984 OR cardinality(v_ids) <> 984 OR v_case_count <> 322 OR v_address_count <> 307
     OR v_records_hash <> '2b86ea206f5288e9fae9ec6b00b66a19bfaee731c2852c6fdbcf921333c64a71' THEN
    RAISE EXCEPTION 'Buffalo complete batch content proof or aggregate counts do not match the reviewed first batch' USING ERRCODE = '22023';
  END IF;
  v_receipt := jsonb_build_object('version','buffalo-pilot-import-receipt-v1','status','imported',
    'preparation_sha256',p_payload_sha256,'manifest_sha256',v_manifest_hash,'records_sha256',v_records_hash,
    'event_count',984,'case_count',322,'address_count',307,'held_count',4,'created_at',v_created_at);
  INSERT INTO snap_relaunch.buffalo_pilot_batches_v1 (
    pilot_key,preparation_sha256,manifest_sha256,records_sha256,source_id,source_url,source_name,collected_at,
    event_count,case_count,address_count,held_count,payload_text,manifest_text,manifest,receipt,created_at)
  VALUES ('buffalo-residential-code-20261020-v1',p_payload_sha256,v_manifest_hash,v_records_hash,
    'SRC_2c09ff0ee9f5da4d','https://data.buffalony.gov/resource/ivrf-k9vm.json','City of Buffalo, NY',
    '2026-10-19T23:43:46.001147+00:00'::timestamptz,984,322,307,4,p_payload_text,v_manifest_text,v_manifest,v_receipt,v_created_at);
  INSERT INTO snap_relaunch.buffalo_pilot_events_v1 (
    source_id,agency_record_id,preparation_sha256,source_row_number,raw_content_sha256,cleaned_sha256,
    raw_source_text,cleaned_text,raw_source,cleaned,created_at)
  SELECT 'SRC_2c09ff0ee9f5da4d',(item->>'cleaned_text')::jsonb->>'agency_record_id',p_payload_sha256,
    ((item->>'cleaned_text')::jsonb->>'source_row_number')::integer,item->>'raw_content_sha256',item->>'cleaned_sha256',
    item->>'raw_source_text',item->>'cleaned_text',(item->>'raw_source_text')::jsonb,(item->>'cleaned_text')::jsonb,v_created_at
  FROM jsonb_array_elements(v_payload->'records') AS item;
  IF (SELECT count(*) FROM snap_relaunch.buffalo_pilot_events_v1 WHERE preparation_sha256 = p_payload_sha256) <> 984 THEN
    RAISE EXCEPTION 'Buffalo insertion readback failed' USING ERRCODE = '22023';
  END IF;
  RETURN v_receipt;
END;
$function$;
REVOKE ALL ON FUNCTION snap_relaunch.fn_import_buffalo_pilot_v1(text,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.fn_owner_buffalo_source_review_v1(p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = on
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_batch snap_relaunch.buffalo_pilot_batches_v1%ROWTYPE;
  v_events jsonb; v_next integer;
  v_unavailable constant jsonb := '{"version":"owner-buffalo-source-review-v1","status":"unavailable"}'::jsonb;
BEGIN
  -- Avoid revealing any batch existence/count/metadata to an unassigned account.
  IF v_uid IS NULL OR v_uid <> '242fb409-b137-46d5-9aa6-2696710f5fcd'::uuid
     OR NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL
       AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())) THEN
    RETURN v_unavailable;
  END IF;
  SELECT b.* INTO v_batch FROM snap_relaunch.buffalo_pilot_batches_v1 AS b
  JOIN snap_relaunch.buffalo_pilot_review_access_v1 AS a USING (preparation_sha256)
  WHERE b.pilot_key = 'buffalo-residential-code-20261020-v1'
    AND a.review_user_id = v_uid AND a.enabled AND a.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN v_unavailable; END IF;
  IF p_limit IS NULL OR p_limit <> 25 OR p_offset IS NULL OR p_offset < 0 OR p_offset > 975 OR p_offset % 25 <> 0 THEN
    RAISE EXCEPTION 'Invalid Buffalo review page' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'agency_record_id',e.agency_record_id,'case_number',e.cleaned->>'case_number','case_type',e.cleaned->>'case_type',
    'violation_code',e.cleaned->>'violation_code','code_section',e.cleaned->>'code_section',
    'violation_description',e.cleaned->>'violation_description','comments',e.cleaned->>'comments',
    'violation_location',e.cleaned->>'violation_location','violation_date',e.cleaned->>'violation_date',
    'source_date_raw',e.cleaned->>'source_date_raw','source_status',e.cleaned->>'source_status',
    'normalized_status',e.cleaned->>'normalized_status','address',e.cleaned->>'address','city',e.cleaned->>'city',
    'state',e.cleaned->>'state','zip',e.cleaned->>'zip','property_class',e.cleaned->>'property_class',
    'residential_evidence',e.cleaned->>'residential_evidence','parcel_id',e.cleaned->>'parcel_id',
    'source_content_hash',e.raw_content_sha256,'source_row_number',e.source_row_number
  ) ORDER BY e.source_row_number), '[]'::jsonb) INTO v_events
  FROM (SELECT * FROM snap_relaunch.buffalo_pilot_events_v1
    WHERE preparation_sha256 = v_batch.preparation_sha256 ORDER BY source_row_number LIMIT p_limit OFFSET p_offset) AS e;
  IF jsonb_array_length(v_events) <> least(p_limit, v_batch.event_count - p_offset) THEN
    RAISE EXCEPTION 'Buffalo review evidence is incomplete' USING ERRCODE = '22023';
  END IF;
  v_next := CASE WHEN p_offset + p_limit < v_batch.event_count THEN p_offset + p_limit ELSE NULL END;
  RETURN jsonb_build_object('version','owner-buffalo-source-review-v1','status','available','checked_at',statement_timestamp(),
    'batch',jsonb_build_object('preparation_sha256',v_batch.preparation_sha256,'source_name',v_batch.source_name,
      'source_url',v_batch.source_url,'collected_at',v_batch.collected_at,'event_count',v_batch.event_count,
      'case_count',v_batch.case_count,'address_count',v_batch.address_count,'held_count',v_batch.held_count,
      'limitations',jsonb_build_array(
        'Private owner review of this Buffalo batch only; customer publication, export and outreach are not authorized by this import.',
        '984 distinct government violation IDs span 322 cases, 307 addresses and 376 source parcel IDs; addresses and parcel IDs are not interchangeable.',
        'Four possible duplicate source records remain held and were not imported.',
        'ACTIVE is the agency status in the collected snapshot; collection time does not establish current conditions.',
        'Violation dates are agency observation dates, not inferred case-opening dates.',
        'Residential classification follows the retained source property-class evidence; no ownership or contact enrichment was performed.'
      )), 'events',v_events,'next_offset',v_next);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_owner_buffalo_source_review_v1(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_owner_buffalo_source_review_v1(integer,integer) TO authenticated;

COMMIT;
