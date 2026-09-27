-- Candidate customer path. Install only with the reviewed acceptance change
-- and source-distribution decision. This returns cleaned, accepted evidence.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.fn_clean_syracuse_catalog_v1(p_search text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); a snap_relaunch.customer_source_acceptances%ROWTYPE;
 mapped jsonb; clean jsonb; entry jsonb; keyed jsonb:='{}'::jsonb; matches jsonb;
 observations jsonb:='{}'::jsonb; history jsonb; observation_key text;
 source_to_customer jsonb:='{}'::jsonb; customer_to_source jsonb:='{}'::jsonb;
 k text; q text:=lower(trim(coalesce(p_search,''))); seen integer:=0;
BEGIN
 IF actor IS NULL OR length(q)>80 OR q ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'Signed-in search and a short query required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.deleted_at IS NULL
   AND u.confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
   AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp())) THEN
  RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501';END IF;
 FOR a IN SELECT * FROM snap_relaunch.customer_source_acceptances
   WHERE consumer_user_id=actor AND purpose='customer_export'
   ORDER BY created_at DESC,id DESC LOOP
  seen:=seen+1;
  IF seen>100 THEN RAISE EXCEPTION 'Too many accepted source batches' USING ERRCODE='54000';END IF;
  BEGIN
   PERFORM snap_relaunch.require_source_acceptance_v1(a.id,'customer_export');
  EXCEPTION WHEN SQLSTATE '42501' THEN CONTINUE;
  END;
  FOR mapped IN SELECT value FROM jsonb_array_elements(a.mapped_items) LOOP
   SELECT c.payload INTO clean FROM snap_relaunch.cleaned_source_events_v1 c
    WHERE c.preparation_sha256=a.preparation_sha256 AND c.record_key=mapped->>'record_key';
   IF clean IS NULL OR clean->>'record_key' IS DISTINCT FROM mapped->>'record_key'
    OR clean->>'property_id' IS DISTINCT FROM mapped->>'source_property_id'
    OR clean->>'cleaning_version' IS DISTINCT FROM 'syracuse-clean-events-v1'
    OR mapped->>'customer_property_id' IS NULL THEN
    RAISE EXCEPTION 'Accepted cleaned evidence unavailable' USING ERRCODE='42501';END IF;
   IF (source_to_customer ? (clean->>'property_id') AND
       source_to_customer->>(clean->>'property_id') IS DISTINCT FROM mapped->>'customer_property_id')
     OR (customer_to_source ? (mapped->>'customer_property_id') AND
       customer_to_source->>(mapped->>'customer_property_id') IS DISTINCT FROM clean->>'property_id') THEN
    RAISE EXCEPTION 'Accepted property mapping disagrees across batches' USING ERRCODE='42501';END IF;
   source_to_customer:=jsonb_set(source_to_customer,ARRAY[clean->>'property_id'],
     to_jsonb(mapped->>'customer_property_id'),true);
   customer_to_source:=jsonb_set(customer_to_source,ARRAY[mapped->>'customer_property_id'],
     to_jsonb(clean->>'property_id'),true);
   IF q<>'' AND position(q IN lower(coalesce(clean->>'address','')||' '||
     coalesce(clean->>'city','')||' '||coalesce(clean->>'zip',''))) = 0 THEN CONTINUE;END IF;
   entry:=jsonb_build_object('acceptance_id',a.id,'acceptance_revision',a.command_sha256,
    'customer_property_id',mapped->>'customer_property_id','event',clean);
   observation_key:=a.preparation_sha256||':'||(clean->>'record_key');
   IF NOT observations ? observation_key THEN
    observations:=jsonb_set(observations,ARRAY[observation_key],entry,true);
   END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(observations))>2000 THEN
    RAISE EXCEPTION 'Accepted history exceeds this pilot limit' USING ERRCODE='54000';END IF;
   k:=(mapped->>'customer_property_id')||':'||(clean->>'record_key');
   IF NOT keyed ? k OR
      (keyed->k->'event'->'citation'->>'collected_at')::timestamptz
         < (clean->'citation'->>'collected_at')::timestamptz THEN
    keyed:=jsonb_set(keyed,ARRAY[k],entry,true);
   END IF;
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY value->'event'->>'address',
   value->>'customer_property_id',value->'event'->>'citation_at',value->'event'->>'record_key'),'[]'::jsonb)
 INTO matches FROM jsonb_each(keyed);
 SELECT coalesce(jsonb_agg(value ORDER BY value->'event'->'citation'->>'collected_at',value->'event'->>'record_key'),'[]'::jsonb)
 INTO history FROM jsonb_each(observations);
 RETURN jsonb_build_object('version','accepted-clean-syracuse-catalog-v1',
  'as_of',clock_timestamp(),'items',matches,'observations',history);
END $$;
REVOKE ALL ON FUNCTION public.fn_clean_syracuse_catalog_v1(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_clean_syracuse_catalog_v1(text) TO authenticated;
COMMIT;
