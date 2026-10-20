-- Run INSIDE a transaction after installing and importing the exact pilot.
-- The caller must ROLLBACK this verification transaction. Test claims are local
-- database role simulations, not browser sessions or changes to auth.users.
DO $checks$
DECLARE r jsonb; n integer; actual_hash text; v_role text; v_table text;
BEGIN
  SELECT count(*) INTO n FROM snap_relaunch.buffalo_pilot_events_v1;
  IF n <> 984 THEN RAISE EXCEPTION 'Wrong saved row count'; END IF;
  IF (SELECT count(DISTINCT agency_record_id) FROM snap_relaunch.buffalo_pilot_events_v1) <> 984
     OR (SELECT count(DISTINCT cleaned->>'case_number') FROM snap_relaunch.buffalo_pilot_events_v1) <> 322
     OR (SELECT count(DISTINCT (cleaned->>'address',cleaned->>'city',cleaned->>'state',cleaned->>'zip')) FROM snap_relaunch.buffalo_pilot_events_v1) <> 307
     OR (SELECT count(DISTINCT cleaned->>'parcel_id') FROM snap_relaunch.buffalo_pilot_events_v1) <> 376 THEN
    RAISE EXCEPTION 'Source identities or counts were collapsed';
  END IF;
  IF EXISTS (SELECT 1 FROM snap_relaunch.buffalo_pilot_events_v1 WHERE
    agency_record_id IN ('538939','538938','539418','539421')
    OR raw_content_sha256 IS DISTINCT FROM encode(sha256(convert_to(raw_source_text,'UTF8')),'hex')
    OR cleaned_sha256 IS DISTINCT FROM encode(sha256(convert_to(cleaned_text,'UTF8')),'hex')
    OR raw_source IS DISTINCT FROM raw_source_text::jsonb
    OR cleaned IS DISTINCT FROM cleaned_text::jsonb
    OR raw_source->>'uniquekey' IS DISTINCT FROM agency_record_id
    OR raw_source->>'date' IS DISTINCT FROM cleaned->>'source_date_raw'
    OR left(raw_source->>'date',10) IS DISTINCT FROM cleaned->>'violation_date') THEN
    RAISE EXCEPTION 'Source evidence changed';
  END IF;
  SELECT encode(sha256(convert_to(string_agg(concat_ws('|',source_id,agency_record_id,source_row_number::text,raw_content_sha256,cleaned_sha256),E'\n' ORDER BY source_row_number),'UTF8')),'hex')
    INTO actual_hash FROM snap_relaunch.buffalo_pilot_events_v1;
  IF actual_hash IS DISTINCT FROM '2b86ea206f5288e9fae9ec6b00b66a19bfaee731c2852c6fdbcf921333c64a71' THEN
    RAISE EXCEPTION 'Saved batch digest differs';
  END IF;
  SELECT snap_relaunch.fn_import_buffalo_pilot_v1(payload_text,preparation_sha256) INTO r
    FROM snap_relaunch.buffalo_pilot_batches_v1;
  IF r->>'status' IS DISTINCT FROM 'replayed' OR (SELECT count(*) FROM snap_relaunch.buffalo_pilot_events_v1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Replay added records';
  END IF;
  BEGIN
    PERFORM snap_relaunch.fn_import_buffalo_pilot_v1(payload_text||' ',encode(sha256(convert_to(payload_text||' ','UTF8')),'hex'))
      FROM snap_relaunch.buffalo_pilot_batches_v1;
    RAISE EXCEPTION 'Changed payload was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE snap_relaunch.buffalo_pilot_events_v1 SET agency_record_id=agency_record_id WHERE source_row_number=(SELECT min(source_row_number) FROM snap_relaunch.buffalo_pilot_events_v1);
    RAISE EXCEPTION 'Immutable evidence was updateable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon','public.fn_owner_buffalo_source_review_v1(integer,integer)','EXECUTE') IS DISTINCT FROM false
     OR has_function_privilege('service_role','public.fn_owner_buffalo_source_review_v1(integer,integer)','EXECUTE') IS DISTINCT FROM false
     OR has_function_privilege('authenticated','public.fn_owner_buffalo_source_review_v1(integer,integer)','EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Owner read RPC privilege boundary is incorrect';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(v_role,'snap_relaunch.fn_import_buffalo_pilot_v1(text,text)','EXECUTE') IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'API role % can execute the private importer', v_role;
    END IF;
    FOREACH v_table IN ARRAY ARRAY['buffalo_pilot_batches_v1','buffalo_pilot_events_v1','buffalo_pilot_review_access_v1','buffalo_pilot_transfer_chunks_v1'] LOOP
      IF has_table_privilege(v_role,'snap_relaunch.' || v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'API role % has direct privileges on %', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['buffalo_pilot_batches_v1','buffalo_pilot_events_v1','buffalo_pilot_review_access_v1','buffalo_pilot_transfer_chunks_v1'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'snap_relaunch' AND c.relname = v_table AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'Private table % does not have RLS enabled', v_table;
    END IF;
  END LOOP;
END;
$checks$;

INSERT INTO snap_relaunch.buffalo_pilot_review_access_v1(review_user_id,preparation_sha256)
SELECT '242fb409-b137-46d5-9aa6-2696710f5fcd',preparation_sha256 FROM snap_relaunch.buffalo_pilot_batches_v1
ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
DO $auth_checks$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  r := public.fn_owner_buffalo_source_review_v1();
  IF r IS DISTINCT FROM '{"version":"owner-buffalo-source-review-v1","status":"unavailable"}'::jsonb THEN
    RAISE EXCEPTION 'Missing identity leaked batch data';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  r := public.fn_owner_buffalo_source_review_v1();
  IF r IS DISTINCT FROM '{"version":"owner-buffalo-source-review-v1","status":"unavailable"}'::jsonb THEN
    RAISE EXCEPTION 'Unassigned identity leaked batch data';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','242fb409-b137-46d5-9aa6-2696710f5fcd',true);
  r := public.fn_owner_buffalo_source_review_v1(25,0);
  IF r->>'status' IS DISTINCT FROM 'available' OR jsonb_array_length(r->'events') IS DISTINCT FROM 25 OR r->>'next_offset' IS DISTINCT FROM '25' THEN
    RAISE EXCEPTION 'Owner first page failed';
  END IF;
  r := public.fn_owner_buffalo_source_review_v1(25,975);
  IF r->>'status' IS DISTINCT FROM 'available' OR jsonb_array_length(r->'events') IS DISTINCT FROM 9 OR r->'next_offset' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Owner final page failed';
  END IF;
  BEGIN
    PERFORM public.fn_owner_buffalo_source_review_v1(25,-1);
    RAISE EXCEPTION 'Invalid page was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END;
$auth_checks$;
RESET ROLE;
UPDATE snap_relaunch.buffalo_pilot_review_access_v1 SET enabled=false;
SET LOCAL ROLE authenticated;
DO $revoked$
BEGIN
  IF public.fn_owner_buffalo_source_review_v1() IS DISTINCT FROM '{"version":"owner-buffalo-source-review-v1","status":"unavailable"}'::jsonb THEN
    RAISE EXCEPTION 'Revocation failed';
  END IF;
END;
$revoked$;
RESET ROLE;
SELECT jsonb_build_object('checks_passed',true,'event_count',984,'case_count',322,'address_count',307,
  'source_parcel_count',376,'held_excluded',4,'replay_added',0,'evidence_immutable',true,
  'owner_read_allowed',true,'unassigned_read_denied',true,'revocation_passed',true,
  'api_roles_cannot_import',true) AS verification;
