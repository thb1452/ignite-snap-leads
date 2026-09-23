BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.fn_reserve_source_export_v1(p_request_id uuid, p_acceptance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a snap_relaunch.customer_source_acceptances%ROWTYPE;s public.user_subscriptions%ROWTYPE;
 prior public.export_logs%ROWTYPE;has_sub boolean;mode text;tier text;ids uuid[];rows jsonb;n integer;
 req_hash text;selection_hash text;result jsonb;entitlement jsonb;unlocks jsonb:='[]'::jsonb;pid uuid;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_acceptance_id IS NULL THEN
  RAISE EXCEPTION 'Authenticated export identity required' USING ERRCODE='42501';END IF;
 RAISE EXCEPTION 'Source export held: cleaned privacy evidence is required' USING ERRCODE='55000';
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
END $function$

;
COMMIT;
