-- SNAP customer wallet/export candidate. Project ojyxblegxpdgaqiscxpz.
-- Supersedes the unpublished unlock/trial candidate; PR178 must already be present.
-- Execute this complete file in ONE transaction. Existing rows are preserved.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.fn_charge_credits(uuid[],uuid)'::regprocedure)) IS DISTINCT FROM '6196089a8dc60999609888b1d2e9e847' THEN
    RAISE EXCEPTION 'Baseline drift: fn_charge_credits';
  END IF;
  IF md5(pg_get_functiondef('public.fn_consume_credit(text,jsonb)'::regprocedure)) IS DISTINCT FROM 'f2c4bb60a76ef3112215cff142fe7b50' THEN
    RAISE EXCEPTION 'Baseline drift: fn_consume_credit';
  END IF;
  IF md5(pg_get_functiondef('public.fn_consume_usage_atomic(text,integer)'::regprocedure)) IS DISTINCT FROM 'f4ff6df4278e891049ef8815e1f7da61' THEN
    RAISE EXCEPTION 'Baseline drift: fn_consume_usage_atomic';
  END IF;
  IF md5(pg_get_functiondef('public.fn_export_properties_batch(uuid[],boolean)'::regprocedure)) IS DISTINCT FROM '6b7a9444c5560b99da863cc6f5f7c705' THEN
    RAISE EXCEPTION 'Baseline drift: fn_export_properties_batch';
  END IF;
  IF md5(pg_get_functiondef('public.fn_increment_trial_exports(uuid,integer)'::regprocedure)) IS DISTINCT FROM 'ff886f7c9a1bd3b98a45f34886cc346b' THEN
    RAISE EXCEPTION 'Baseline drift: fn_increment_trial_exports';
  END IF;
  IF md5(pg_get_functiondef('public.fn_unlock_property(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '79ff95f00dcde13de28538976164faa0' THEN
    RAISE EXCEPTION 'Baseline drift: fn_unlock_property';
  END IF;
  IF to_regclass('public.uniq_ledger_job_prop_reason') IS NULL OR to_regclass('public.idx_unlocked_properties_user_property') IS NULL THEN
    RAISE EXCEPTION 'Expected ledger/unlock uniqueness indexes are missing';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='export_logs' AND column_name='reservation_key') THEN
    RAISE EXCEPTION 'Export reservation schema already exists; inspect before changing it';
  END IF;
END;
$guard$;

-- Candidate only. The grant follows same-account, positive-count, current-trial
-- and atomic quota checks. No table data is rewritten by this migration.
CREATE OR REPLACE FUNCTION public.fn_increment_trial_exports(p_user_id uuid, p_count integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_sub public.user_subscriptions%ROWTYPE;
  v_new_count integer;
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success',false,'error','unauthorized');
  END IF;
  IF p_count IS NULL OR p_count <= 0 THEN
    RETURN jsonb_build_object('success',false,'error','invalid_count');
  END IF;

  SELECT * INTO v_sub FROM public.user_subscriptions
  WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_sub.status NOT IN ('trial','trialing') THEN
    RETURN jsonb_build_object('success',false,'error','no_active_trial');
  END IF;
  IF v_sub.trial_started_at IS NULL OR v_sub.trial_started_at > now() OR
     v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at <= now() THEN
    RETURN jsonb_build_object('success',false,'error','trial_expired');
  END IF;
  v_limit := COALESCE(v_sub.trial_exports_limit,500);
  IF v_limit < 0 OR COALESCE(v_sub.trial_exports_used,0) < 0 THEN
    RETURN jsonb_build_object('success',false,'error','trial_quota_invalid');
  END IF;

  -- Check and increment in one statement after locking the selected trial.
  -- Subtraction avoids integer overflow for an oversized caller count.
  UPDATE public.user_subscriptions
  SET trial_exports_used = COALESCE(trial_exports_used,0) + p_count, updated_at = now()
  WHERE id = v_sub.id AND status IN ('trial','trialing')
    AND trial_ends_at > now() AND trial_started_at <= now()
    AND p_count <= v_limit AND COALESCE(trial_exports_used,0) <= v_limit - p_count
  RETURNING trial_exports_used INTO v_new_count;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','trial_exports_exhausted',
      'used',COALESCE(v_sub.trial_exports_used,0),'limit',v_limit);
  END IF;
  RETURN jsonb_build_object('success',true,'used',v_new_count,'remaining',v_limit-v_new_count);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_increment_trial_exports(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_increment_trial_exports(uuid,integer) TO authenticated;

-- Every debit path uses the existing account profile as its row lock.
-- The ledger trigger also covers negative inserts from privileged writers.
CREATE OR REPLACE FUNCTION public.guard_credit_ledger_debit_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_balance bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.delta IS DISTINCT FROM OLD.delta THEN
      RAISE EXCEPTION 'Credit ledger accounting entries are immutable' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.delta < 0 THEN
    PERFORM 1 FROM public.profiles WHERE user_id=NEW.user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(sum(delta),0) INTO v_balance FROM public.credit_ledger WHERE user_id=NEW.user_id;
    IF v_balance < -(NEW.delta::bigint) THEN
      RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_credit_ledger_debit_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER credit_ledger_debit_guard_v1 BEFORE INSERT OR UPDATE OF user_id,delta ON public.credit_ledger
FOR EACH ROW EXECUTE FUNCTION public.guard_credit_ledger_debit_v1();

CREATE OR REPLACE FUNCTION public.fn_consume_credit(p_reason text,p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_job uuid;v_property uuid;v_existing public.credit_ledger%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN
    RAISE EXCEPTION 'Customer credit operations remain held' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason))=0 OR length(p_reason)>80 OR
     jsonb_typeof(p_meta) IS DISTINCT FROM 'object' OR p_meta->>'job_id' IS NULL OR p_meta->>'property_id' IS NULL THEN
    RAISE EXCEPTION 'Stable job and property identifiers are required' USING ERRCODE='22023';
  END IF;
  v_job := (p_meta->>'job_id')::uuid;v_property := (p_meta->>'property_id')::uuid;
  PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.credit_ledger
  WHERE user_id=auth.uid() AND job_id_extracted=v_job AND property_id_extracted=v_property AND reason=p_reason;
  IF FOUND THEN
    IF v_existing.delta<>-1 OR v_existing.meta IS DISTINCT FROM p_meta THEN
      RAISE EXCEPTION 'Credit operation identity conflicts with existing receipt' USING ERRCODE='22023';
    END IF;
    RETURN 1;
  END IF;
  INSERT INTO public.credit_ledger(user_id,delta,reason,meta) VALUES(auth.uid(),-1,p_reason,p_meta);
  RETURN 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_charge_credits(p_property_ids uuid[],p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_ids uuid[];v_prior uuid[];v_balance integer;v_bad boolean;v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN
    RAISE EXCEPTION 'Customer credit operations remain held' USING ERRCODE='42501';
  END IF;
  IF p_job_id IS NULL OR p_property_ids IS NULL OR cardinality(p_property_ids)<1 OR cardinality(p_property_ids)>1000
      OR array_position(p_property_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A stable job and bounded property selection are required' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM(SELECT DISTINCT unnest(p_property_ids) id) s;
  v_hash:=encode(sha256(convert_to(array_to_json(v_ids)::text,'UTF8')),'hex');
  PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account unavailable' USING ERRCODE='42501'; END IF;
  SELECT array_agg(property_id_extracted ORDER BY property_id_extracted),bool_or(delta<>-1)
  INTO v_prior,v_bad FROM public.credit_ledger
  WHERE user_id=auth.uid() AND job_id_extracted=p_job_id AND reason='skiptrace_charge';
  IF v_prior IS NOT NULL THEN
    IF v_prior IS DISTINCT FROM v_ids OR v_bad THEN
      RAISE EXCEPTION 'Credit operation identity conflicts with existing receipt' USING ERRCODE='22023';
    END IF;
    SELECT COALESCE(sum(delta),0)::integer INTO v_balance FROM public.credit_ledger WHERE user_id=auth.uid();
    RETURN jsonb_build_object('charged',0,'previously_charged',cardinality(v_ids),'new_balance',v_balance,'replayed',true);
  END IF;
  INSERT INTO public.credit_ledger(user_id,delta,reason,meta)
  SELECT auth.uid(),-1,'skiptrace_charge',jsonb_build_object('job_id',p_job_id,'property_id',id,'selection_sha256',v_hash)
  FROM unnest(v_ids) id;
  SELECT COALESCE(sum(delta),0)::integer INTO v_balance FROM public.credit_ledger WHERE user_id=auth.uid();
  RETURN jsonb_build_object('charged',cardinality(v_ids),'new_balance',v_balance,'replayed',false);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_consume_credit(text,jsonb),public.fn_charge_credits(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_consume_credit(text,jsonb),public.fn_charge_credits(uuid[],uuid) TO authenticated;

-- Candidate only. Preserves the current admin-only customer containment.
-- Requires wallet-debits.candidate.sql; its trigger serializes every ledger debit.
CREATE OR REPLACE FUNCTION public.fn_unlock_property(p_user_id uuid,p_property_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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

  IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property_id) THEN
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
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_unlock_property(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_unlock_property(uuid,uuid) TO authenticated;

-- Add trusted reservation fields to the existing private export history.
-- Older client-written log rows stay historical and cannot become receipts.
ALTER TABLE public.export_logs
  ADD COLUMN reservation_key uuid,
  ADD COLUMN reservation_version text,
  ADD COLUMN request_sha256 text,
  ADD COLUMN selection_sha256 text,
  ADD COLUMN authorized_property_ids uuid[],
  ADD COLUMN receipt_payload jsonb,
  ADD COLUMN entitlement_receipt jsonb;
CREATE UNIQUE INDEX export_logs_request_identity_v1 ON public.export_logs(user_id,reservation_key)
WHERE reservation_key IS NOT NULL;
ALTER TABLE public.export_logs ADD CONSTRAINT export_logs_reservation_shape_v1 CHECK (
 (reservation_key IS NULL AND reservation_version IS NULL AND request_sha256 IS NULL AND selection_sha256 IS NULL
  AND authorized_property_ids IS NULL AND receipt_payload IS NULL AND entitlement_receipt IS NULL)
 OR
 (reservation_key IS NOT NULL AND reservation_version IS NOT NULL AND request_sha256 IS NOT NULL AND selection_sha256 IS NOT NULL
  AND authorized_property_ids IS NOT NULL AND receipt_payload IS NOT NULL AND entitlement_receipt IS NOT NULL
  AND reservation_version='export-reservation-v1'
  AND request_sha256 ~ '^[0-9a-f]{64}$'
  AND selection_sha256 ~ '^[0-9a-f]{64}$' AND cardinality(authorized_property_ids) BETWEEN 1 AND 1000
  AND jsonb_typeof(receipt_payload)='array' AND jsonb_array_length(receipt_payload)=row_count
  AND row_count=cardinality(authorized_property_ids) AND jsonb_typeof(entitlement_receipt)='object')
);
-- Keep current metadata reads/client telemetry compatible. Private receipt
-- payloads can only be returned through the entitlement-checked function.
REVOKE ALL ON public.export_logs FROM anon;
REVOKE SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.export_logs FROM authenticated;
GRANT SELECT(id,user_id,created_at,state_filter,city_filter,row_count,filters) ON public.export_logs TO authenticated;
GRANT INSERT(user_id,state_filter,city_filter,row_count,filters) ON public.export_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_reserve_export_v1(
  p_request_id uuid,p_request_fingerprint text,p_property_ids uuid[] DEFAULT NULL,p_enforce_code_violation_only boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_sub public.user_subscriptions%ROWTYPE;
  v_previous public.export_logs%ROWTYPE;
  v_has_sub boolean;v_ids uuid[];v_hash text;v_mode text;v_tier text:='basic';v_code_only boolean;
  v_rows jsonb;v_result jsonb;v_entitlement jsonb;v_unlocks jsonb:='[]'::jsonb;v_id uuid;v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN
    RAISE EXCEPTION 'Customer exports remain held' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Export request identity is required' USING ERRCODE='22023'; END IF;
  IF p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Export request fingerprint is required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Export account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id=auth.uid()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  v_has_sub:=FOUND;
  IF v_has_sub THEN
    IF v_sub.status IN ('trial','trialing') THEN
      v_mode:='trial';
      IF v_sub.trial_started_at IS NULL OR v_sub.trial_started_at>now() OR
         v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at<=now() THEN
        RAISE EXCEPTION 'Trial expired or unverified' USING ERRCODE='42501';
      END IF;
    ELSIF v_sub.status='active' THEN
      v_mode:='subscription';
      IF v_sub.current_period_start IS NULL OR v_sub.current_period_start>now() OR
         v_sub.current_period_end IS NULL OR v_sub.current_period_end<=now() THEN
        RAISE EXCEPTION 'Subscription expired or unverified' USING ERRCODE='42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'No current subscription authorization' USING ERRCODE='42501';
    END IF;
    SELECT data_tier INTO v_tier FROM public.subscription_plans WHERE id=v_sub.plan_id;
    IF v_tier IS NULL OR v_tier NOT IN ('basic','premium') THEN
      RAISE EXCEPTION 'Subscription tier unverified' USING ERRCODE='42501';
    END IF;
  ELSE v_mode:='payg'; END IF;
  v_code_only:=v_tier='basic' OR COALESCE(p_enforce_code_violation_only,false);

  IF p_property_ids IS NOT NULL THEN
    IF cardinality(p_property_ids)<1 OR cardinality(p_property_ids)>1000 OR array_position(p_property_ids,NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Export selection must contain 1 to 1000 property IDs' USING ERRCODE='22023';
    END IF;
    SELECT array_agg(id ORDER BY id) INTO v_ids FROM(SELECT DISTINCT unnest(p_property_ids) id) s;
    v_hash:=encode(sha256(convert_to('export-v1|'||array_to_json(v_ids)::text||'|'||v_code_only::text,'UTF8')),'hex');
  END IF;

  SELECT * INTO v_previous FROM public.export_logs
  WHERE user_id=auth.uid() AND reservation_key=p_request_id;
  IF FOUND THEN
    IF v_previous.reservation_version IS DISTINCT FROM 'export-reservation-v1' OR
       v_previous.request_sha256 IS DISTINCT FROM p_request_fingerprint OR
       (v_hash IS NOT NULL AND v_previous.selection_sha256 IS DISTINCT FROM v_hash) THEN
      RAISE EXCEPTION 'Export request identity conflicts with an existing receipt' USING ERRCODE='22023';
    END IF;
    IF v_code_only AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_previous.receipt_payload) r
        WHERE r->>'enforcement_type' IS DISTINCT FROM 'code_violation') THEN
      RAISE EXCEPTION 'Current plan cannot retrieve this export' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('status','replayed','request_id',p_request_id,'row_count',v_previous.row_count,
      'property_ids',v_previous.authorized_property_ids,'rows',v_previous.receipt_payload,'entitlement',v_previous.entitlement_receipt);
  END IF;
  IF p_property_ids IS NULL THEN RETURN jsonb_build_object('status','missing','request_id',p_request_id); END IF;

  v_rows:=public.fn_export_properties_batch(v_ids,v_code_only);
  v_count:=cardinality(v_ids);
  IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(v_rows)<>v_count THEN
    RAISE EXCEPTION 'Some selected properties are unavailable for this account' USING ERRCODE='42501';
  END IF;

  IF v_mode='subscription' THEN
    v_result:=public.fn_consume_usage_atomic('exports',v_count);
    IF (v_result->>'allowed')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Export quota authorization failed' USING ERRCODE='P0001',DETAIL=v_result::text;
    END IF;
    v_entitlement:=jsonb_build_object('mode',v_mode,'usage',v_result);
    INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
    SELECT auth.uid(),id,0,'subscription' FROM unnest(v_ids) id ON CONFLICT(user_id,property_id) DO NOTHING;
  ELSIF v_mode='trial' THEN
    v_result:=public.fn_increment_trial_exports(auth.uid(),v_count);
    IF (v_result->>'success')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Trial export quota authorization failed' USING ERRCODE='P0001',DETAIL=v_result::text;
    END IF;
    v_entitlement:=jsonb_build_object('mode',v_mode,'usage',v_result);
    INSERT INTO public.unlocked_properties(user_id,property_id,credit_cost,unlock_source)
    SELECT auth.uid(),id,0,'subscription' FROM unnest(v_ids) id ON CONFLICT(user_id,property_id) DO NOTHING;
  ELSE
    FOREACH v_id IN ARRAY v_ids LOOP
      v_result:=public.fn_unlock_property(auth.uid(),v_id);
      IF (v_result->>'success')::boolean IS DISTINCT FROM true THEN
        -- A raised error rolls back every earlier entitlement/debit in this call.
        RAISE EXCEPTION 'Export property authorization failed' USING ERRCODE='P0001',DETAIL=v_result::text;
      END IF;
      v_unlocks:=v_unlocks||jsonb_build_array(jsonb_build_object('property_id',v_id,'receipt',v_result));
    END LOOP;
    v_entitlement:=jsonb_build_object('mode',v_mode,'unlocks',v_unlocks);
  END IF;

  INSERT INTO public.export_logs(user_id,row_count,filters,reservation_key,reservation_version,request_sha256,
      selection_sha256,authorized_property_ids,receipt_payload,entitlement_receipt)
  VALUES(auth.uid(),v_count,jsonb_build_object('authorization','export-reservation-v1','code_violation_only',v_code_only),
    p_request_id,'export-reservation-v1',p_request_fingerprint,v_hash,v_ids,v_rows,v_entitlement);
  RETURN jsonb_build_object('status','reserved','request_id',p_request_id,'row_count',v_count,
    'property_ids',v_ids,'rows',v_rows,'entitlement',v_entitlement);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_reserve_export_v1(uuid,text,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_reserve_export_v1(uuid,text,uuid[],boolean) TO authenticated;