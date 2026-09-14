-- LOCAL CANDIDATE ONLY. Execute complete file in one transaction after baseline review.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='25s';
DO $guard$ BEGIN
IF to_regprocedure('public.fn_require_scoped_rpc_v1(uuid,boolean)') IS NOT NULL OR to_regprocedure('public.fn_has_role_client_v1(uuid,public.app_role)') IS NOT NULL THEN RAISE EXCEPTION 'Scoped RPC guard already exists';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.accept_invitation(text)'))) IS DISTINCT FROM '8d3b0c08a32b078669968dc950fa079e' THEN RAISE EXCEPTION 'Definition drift: accept_invitation';END IF;
IF NOT has_function_privilege('anon','public.accept_invitation(text)','EXECUTE') OR NOT has_function_privilege('authenticated','public.accept_invitation(text)','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: accept_invitation';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_get_user_allowed_states(uuid)'))) IS DISTINCT FROM 'bafd5108747f27a559a408c12ee5885a' THEN RAISE EXCEPTION 'Definition drift: fn_get_user_allowed_states';END IF;
IF NOT has_function_privilege('anon','public.fn_get_user_allowed_states(uuid)','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_get_user_allowed_states(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_get_user_allowed_states';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_check_enrichment_limit(uuid,integer)'))) IS DISTINCT FROM '6743a91815f6b1f8a8160f942f19eb0f' THEN RAISE EXCEPTION 'Definition drift: fn_check_enrichment_limit';END IF;
IF NOT has_function_privilege('anon','public.fn_check_enrichment_limit(uuid,integer)','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_check_enrichment_limit(uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_check_enrichment_limit';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_consume_enrichment_usage(uuid,integer)'))) IS DISTINCT FROM '35eb928c8e38288872d00ba8ce46b159' THEN RAISE EXCEPTION 'Definition drift: fn_consume_enrichment_usage';END IF;
IF NOT has_function_privilege('anon','public.fn_consume_enrichment_usage(uuid,integer)','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_consume_enrichment_usage(uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_consume_enrichment_usage';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_update_user_states(text[])'))) IS DISTINCT FROM '674e737367b7751b76dac13e0ffa94c4' THEN RAISE EXCEPTION 'Definition drift: fn_update_user_states';END IF;
IF NOT has_function_privilege('anon','public.fn_update_user_states(text[])','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_update_user_states(text[])','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_update_user_states';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_check_county_limit(integer)'))) IS DISTINCT FROM 'e8754a3e0a2d45fb63a077c4ba34b823' THEN RAISE EXCEPTION 'Definition drift: fn_check_county_limit';END IF;
IF NOT has_function_privilege('anon','public.fn_check_county_limit(integer)','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_check_county_limit(integer)','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_check_county_limit';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.has_role(uuid,app_role)'))) IS DISTINCT FROM 'c9435c061911f8bc732dadf64697e488' THEN RAISE EXCEPTION 'Definition drift: has_role';END IF;
IF NOT has_function_privilege('anon','public.has_role(uuid,app_role)','EXECUTE') OR NOT has_function_privilege('authenticated','public.has_role(uuid,app_role)','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: has_role';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_fulfillment_overview()'))) IS DISTINCT FROM '592378cc8ea3532d6461010470c499f3' THEN RAISE EXCEPTION 'Definition drift: fn_fulfillment_overview';END IF;
IF NOT has_function_privilege('anon','public.fn_fulfillment_overview()','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_fulfillment_overview()','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_fulfillment_overview';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_state_response_analytics()'))) IS DISTINCT FROM 'b70d3080e4fea6da6ad7a00624880aa4' THEN RAISE EXCEPTION 'Definition drift: fn_state_response_analytics';END IF;
IF NOT has_function_privilege('anon','public.fn_state_response_analytics()','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_state_response_analytics()','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_state_response_analytics';END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_jurisdiction_intelligence()'))) IS DISTINCT FROM '8bd626c782b632175f3f0e665651585f' THEN RAISE EXCEPTION 'Definition drift: fn_jurisdiction_intelligence';END IF;
IF NOT has_function_privilege('anon','public.fn_jurisdiction_intelligence()','EXECUTE') OR NOT has_function_privilege('authenticated','public.fn_jurisdiction_intelligence()','EXECUTE') THEN RAISE EXCEPTION 'Client ACL drift: fn_jurisdiction_intelligence';END IF;
END $guard$;

CREATE FUNCTION public.fn_require_scoped_rpc_v1(p_user_id uuid, p_admin_only boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
BEGIN
  -- Database SET ROLE is enforced by PostgreSQL; JWT JSON is not this authority.
  -- Works inside existing definer callers, whose current_user becomes postgres.
  IF current_user='service_role' OR session_user='service_role' OR
     current_setting('role',true)='service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR p_admin_only IS NULL OR
     (p_admin_only AND NOT coalesce(public.has_role(auth.uid(),'admin'::public.app_role),false)) OR
     (NOT p_admin_only AND p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'This account is not authorized for this database operation' USING ERRCODE='42501';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_require_scoped_rpc_v1(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_require_scoped_rpc_v1(uuid,boolean) TO authenticated,service_role;

CREATE FUNCTION public.fn_has_role_client_v1(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $function$
 SELECT CASE WHEN current_setting('role',true)='anon' THEN false
 WHEN current_setting('role',true)='service_role' OR session_user='service_role' OR
   (auth.uid() IS NOT NULL AND (_user_id=auth.uid() OR EXISTS(
      SELECT 1 FROM public.user_roles own WHERE own.user_id=auth.uid() AND own.role='admin'::public.app_role
   ))) THEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role=_role)
 ELSE false END
$function$;
REVOKE ALL ON FUNCTION public.fn_has_role_client_v1(uuid,public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_role_client_v1(uuid,public.app_role) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE v_user_id uuid:=auth.uid();v_email text;v_invitation public.user_invitations%ROWTYPE;
BEGIN
 IF v_user_id IS NULL THEN RETURN json_build_object('success',false,'error','Not authenticated');END IF;
 SELECT u.email INTO v_email FROM auth.users u
 WHERE u.id=v_user_id AND u.email_confirmed_at IS NOT NULL
   AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
   AND (u.banned_until IS NULL OR u.banned_until<=now());
 IF v_email IS NULL OR btrim(v_email)='' OR p_token IS NULL OR btrim(p_token)='' THEN
   RETURN json_build_object('success',false,'error','Verified invitation recipient required');
 END IF;
 -- Atomic claim is also the row lock: a racing caller rechecks pending status.
 UPDATE public.user_invitations i SET status='accepted',accepted_at=now()
 WHERE i.token=p_token AND i.status='pending' AND i.expires_at>now()
   AND lower(btrim(i.email))=lower(btrim(v_email))
 RETURNING i.* INTO v_invitation;
 IF NOT FOUND THEN RETURN json_build_object('success',false,'error','Invalid or expired invitation');END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(v_user_id,v_invitation.role)
 ON CONFLICT(user_id,role) DO NOTHING;
 RETURN json_build_object('success',true,'role',v_invitation.role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_user_allowed_states(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_states text[];
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  PERFORM public.fn_require_scoped_rpc_v1(v_user_id,false);
  
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  
  SELECT ARRAY_AGG(state)
  INTO v_states
  FROM user_allowed_states
  WHERE user_id = v_user_id;
  
  RETURN COALESCE(v_states, ARRAY[]::text[]);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_check_enrichment_limit(p_user_id uuid, p_address_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_is_trial boolean := false;
  v_limit integer := 500;
  v_used integer := 0;
  v_remaining integer;
  v_period_start timestamptz;
BEGIN
  PERFORM public.fn_require_scoped_rpc_v1(p_user_id,false);
  IF p_user_id IS NULL OR p_address_count IS NULL OR p_address_count<=0 THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_amount');
  END IF;
  SELECT us.*, sp.name as plan_name
  INTO v_sub
  FROM user_subscriptions us
  LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_sub IS NULL OR NOT COALESCE((
    (v_sub.status='active' AND v_sub.current_period_start<=now() AND v_sub.current_period_end>now()) OR
    (v_sub.status IN ('trial','trialing') AND v_sub.trial_started_at<=now() AND v_sub.trial_ends_at>now())
  ),false) THEN
    RETURN jsonb_build_object('allowed',false,'reason','no_current_subscription');
  ELSIF v_sub.status IN ('trial','trialing') THEN
    v_is_trial := true;
    v_limit := COALESCE(v_sub.trial_exports_limit, 500);
    v_period_start := COALESCE(v_sub.current_period_start, v_sub.trial_started_at, date_trunc('month', now()));
  ELSE
    v_is_trial := false;
    v_limit := CASE 
      WHEN v_sub.plan_name ILIKE '%elite%' OR v_sub.plan_name ILIKE '%enterprise%' THEN 50000
      WHEN v_sub.plan_name ILIKE '%pro%' THEN 25000
      WHEN v_sub.plan_name ILIKE '%starter%' THEN 10000
      ELSE 10000
    END;
    v_period_start := COALESCE(v_sub.current_period_start, date_trunc('month', now()));
  END IF;

  SELECT COALESCE(SUM(addresses_charged), 0)
  INTO v_used
  FROM enrichment_jobs
  WHERE user_id = p_user_id
    AND created_at >= v_period_start;

  v_remaining := GREATEST(v_limit - v_used, 0);

  IF v_used::bigint + p_address_count::bigint > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', CASE WHEN v_is_trial THEN 'trial_limit_exceeded' ELSE 'plan_limit_exceeded' END,
      'message', format('You have used %s of %s scan addresses this period. This upload requires %s.', v_used, v_limit, p_address_count),
      'current', v_used,
      'limit', v_limit,
      'remaining', v_remaining,
      'is_trial', v_is_trial
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current', v_used,
    'limit', v_limit,
    'remaining', v_remaining,
    'is_trial', v_is_trial
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_consume_enrichment_usage(p_user_id uuid,p_address_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE v_check jsonb;
BEGIN
 PERFORM public.fn_require_scoped_rpc_v1(p_user_id,false);
 v_check:=public.fn_check_enrichment_limit(p_user_id,p_address_count);
 IF NOT coalesce((v_check->>'allowed')::boolean,false) THEN RETURN v_check;END IF;
 -- Existing two-argument contract cannot identify an idempotent operation.
 -- Never claim a debit was made when no receipt/reservation was stored.
 RETURN jsonb_build_object('allowed',false,'reason','enrichment_reservation_required',
   'message','Enrichment remains held until durable reservation accounting is connected',
   'current',v_check->'current','limit',v_check->'limit','remaining',v_check->'remaining');
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_update_user_states(p_states text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE v_user_id uuid:=auth.uid();v_sub record;v_states text[];v_max_states integer;
BEGIN
 PERFORM public.fn_require_scoped_rpc_v1(v_user_id,false);
 IF v_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','Authentication required');END IF;
 IF coalesce(array_ndims(p_states),1)<>1 OR coalesce(cardinality(p_states),0)>1000 THEN
   RETURN jsonb_build_object('success',false,'error','Invalid state array');
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_states) s WHERE s IS NULL OR upper(btrim(s)) !~ '^[A-Z]{2}$') THEN
   RETURN jsonb_build_object('success',false,'error','Invalid state code');
 END IF;
 SELECT coalesce(array_agg(s ORDER BY s),ARRAY[]::text[]) INTO v_states
 FROM (SELECT DISTINCT upper(btrim(x)) s FROM unnest(p_states) x) normalized;
 -- Serializes empty and existing per-account state sets through one path.
 PERFORM pg_advisory_xact_lock(hashtextextended('snap-user-state:'||v_user_id::text,0));
 SELECT us.*,sp.max_states INTO v_sub FROM
   (SELECT * FROM public.user_subscriptions WHERE user_id=v_user_id ORDER BY created_at DESC LIMIT 1) us
   JOIN public.subscription_plans sp ON sp.id=us.plan_id;
 IF v_sub IS NULL OR NOT coalesce((
   (v_sub.status='active' AND v_sub.current_period_start<=now() AND v_sub.current_period_end>now()) OR
   (v_sub.status IN ('trial','trialing') AND v_sub.trial_started_at<=now() AND v_sub.trial_ends_at>now())
 ),false) THEN RETURN jsonb_build_object('success',false,'error','Current subscription or trial required');END IF;
 v_max_states:=v_sub.max_states;
 IF v_max_states IS NULL OR v_max_states<0 OR (v_max_states>0 AND cardinality(v_states)>v_max_states) THEN
   RETURN jsonb_build_object('success',false,'error','State selection exceeds plan limit');
 END IF;
 DELETE FROM public.user_allowed_states WHERE user_id=v_user_id;
 INSERT INTO public.user_allowed_states(user_id,state) SELECT v_user_id,unnest(v_states);
 RETURN jsonb_build_object('success',true,'states',v_states);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_check_county_limit(p_amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_max_counties integer;
  v_current_count integer;
  v_remaining integer;
  v_plan_name text;
BEGIN
  PERFORM public.fn_require_scoped_rpc_v1(auth.uid(),false);
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
  END IF;
  
  IF p_amount IS NULL OR p_amount<=0 THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_amount');
  END IF;
  -- Get user's subscription limits
  SELECT sp.max_counties, sp.display_name
  INTO v_max_counties, v_plan_name
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;
  
  -- Default to starter plan limits if no subscription found
  IF v_max_counties IS NULL THEN
    SELECT sp.max_counties, sp.display_name
    INTO v_max_counties, v_plan_name
    FROM subscription_plans sp
    WHERE sp.name = 'starter'
    LIMIT 1;
  END IF;
  
  -- Fallback if no plan found at all
  IF v_max_counties IS NULL THEN
    v_max_counties := 5;
    v_plan_name := 'Free';
  END IF;
  
  -- -1 means unlimited
  IF v_max_counties = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'message', 'Unlimited counties allowed',
      'current', 0,
      'limit', -1,
      'remaining', -1,
      'plan_name', v_plan_name
    );
  END IF;
  
  -- Count currently assigned counties (organization-wide)
  SELECT COUNT(*)
  INTO v_current_count
  FROM counties
  WHERE assigned_to IS NOT NULL AND (
    current_setting('role',true)='service_role' OR session_user='service_role' OR
    public.has_role(v_user_id,'admin'::public.app_role) OR assigned_to=v_user_id
  );
  
  v_remaining := v_max_counties - v_current_count;
  
  IF v_current_count::bigint + p_amount::bigint > v_max_counties THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format('County limit reached. Your %s plan allows %s counties. You have %s assigned.', 
                       v_plan_name, v_max_counties, v_current_count),
      'current', v_current_count,
      'limit', v_max_counties,
      'remaining', GREATEST(0, v_remaining),
      'plan_name', v_plan_name
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'within_limit',
    'message', format('%s of %s counties used', v_current_count, v_max_counties),
    'current', v_current_count,
    'limit', v_max_counties,
    'remaining', v_remaining,
    'plan_name', v_plan_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
BEGIN
 -- Preserve trusted definer dependencies that recheck another account's role.
 -- This invoker sees the actual calling SQL identity, not a JSON claim.
 IF current_user IN ('postgres','service_role') THEN
   RETURN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role=_role);
 END IF;
 RETURN public.fn_has_role_client_v1(_user_id,_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fulfillment_overview()
 RETURNS TABLE(total_fulfilled bigint, with_file bigint, file_upload_rate numeric, avg_quality numeric, format_csv bigint, format_pdf bigint, format_image bigint, format_mixed bigint, format_other bigint, avg_response_days numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, total_fees numeric, redacted_count bigint, avg_estimated_rows numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.fn_require_scoped_rpc_v1(auth.uid(),true);
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status='fulfilled') AS total_fulfilled,
    COUNT(*) FILTER (WHERE status='fulfilled' AND fulfillment_file_url IS NOT NULL) AS with_file,
    CASE WHEN COUNT(*) FILTER (WHERE status='fulfilled') > 0 THEN
      ROUND(COUNT(*) FILTER (WHERE status='fulfilled' AND fulfillment_file_url IS NOT NULL)::numeric
        / COUNT(*) FILTER (WHERE status='fulfilled') * 100, 1)
    ELSE 0 END AS file_upload_rate,
    COALESCE(ROUND(AVG(data_quality_score) FILTER (WHERE status='fulfilled')::numeric, 1), 0) AS avg_quality,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='csv') AS format_csv,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='pdf') AS format_pdf,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='image') AS format_image,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format='mixed') AS format_mixed,
    COUNT(*) FILTER (WHERE status='fulfilled' AND data_format NOT IN ('csv','pdf','image','mixed')) AS format_other,
    COALESCE(ROUND(AVG(
      CASE WHEN status='fulfilled' AND sent_at IS NOT NULL AND response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (response_received_at - sent_at)) / 86400.0
      END
    )::numeric, 1), 0) AS avg_response_days,
    -- fee incidence: % of ALL requests (not just fulfilled) that had a fee
    CASE WHEN COUNT(*) > 0 THEN
      ROUND(COUNT(*) FILTER (WHERE fee_amount > 0)::numeric / COUNT(*) * 100, 1)
    ELSE 0 END AS fee_incidence_rate,
    COALESCE(ROUND(AVG(fee_amount) FILTER (WHERE fee_amount > 0)::numeric, 2), 0) AS avg_fee_nonzero,
    COALESCE(SUM(fee_amount) FILTER (WHERE fee_amount > 0), 0) AS total_fees,
    COUNT(*) FILTER (WHERE redaction_flag = true) AS redacted_count,
    COALESCE(ROUND(AVG(estimated_row_count) FILTER (WHERE estimated_row_count > 0)::numeric, 0), 0) AS avg_estimated_rows
  FROM foia_requests;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_state_response_analytics()
 RETURNS TABLE(state text, total_requests bigint, fulfilled_count bigint, avg_response_days numeric, fulfillment_rate numeric, rejection_rate numeric, avg_data_quality numeric, avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, redaction_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.fn_require_scoped_rpc_v1(auth.uid(),true);
  RETURN QUERY
  SELECT
    t.state,
    COUNT(r.id) AS total_requests,
    COUNT(r.id) FILTER (WHERE r.status='fulfilled') AS fulfilled_count,
    COALESCE(ROUND(AVG(
      CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.response_received_at - r.sent_at)) / 86400.0
      END
    )::numeric, 1), 0) AS avg_response_days,
    CASE WHEN COUNT(r.id) > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.status='fulfilled')::numeric / COUNT(r.id) * 100, 1))
    ELSE 0 END AS fulfillment_rate,
    CASE WHEN COUNT(r.id) > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.status='rejected')::numeric / COUNT(r.id) * 100, 1))
    ELSE 0 END AS rejection_rate,
    COALESCE(ROUND(AVG(r.data_quality_score)::numeric, 1), 0) AS avg_data_quality,
    COALESCE(ROUND(AVG(r.fee_amount)::numeric, 2), 0) AS avg_fee_amount,
    CASE WHEN COUNT(r.id) > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.fee_amount > 0)::numeric / COUNT(r.id) * 100, 1))
    ELSE 0 END AS fee_incidence_rate,
    COALESCE(ROUND(AVG(r.fee_amount) FILTER (WHERE r.fee_amount > 0)::numeric, 2), 0) AS avg_fee_nonzero,
    CASE WHEN COUNT(r.id) FILTER (WHERE r.status='fulfilled') > 0 THEN
      LEAST(100, ROUND(COUNT(r.id) FILTER (WHERE r.redaction_flag = true)::numeric
        / COUNT(r.id) FILTER (WHERE r.status='fulfilled') * 100, 1))
    ELSE 0 END AS redaction_pct
  FROM targets t
  LEFT JOIN foia_requests r ON r.target_id = t.id
  WHERE NOT t.is_duplicate
  GROUP BY t.state
  ORDER BY COUNT(r.id) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_jurisdiction_intelligence()
 RETURNS TABLE(target_id uuid, jurisdiction_name text, state text, county text, population integer, target_type text, portal_difficulty_score integer, total_requests bigint, fulfilled_count bigint, rejected_count bigint, needs_review_count bigint, no_portal_count bigint, fulfillment_rate numeric, rejection_rate numeric, avg_response_days numeric, avg_data_quality numeric, avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, redaction_pct numeric, hostility_score numeric, jis numeric, speed_tier text, rejection_tier text, fee_risk text, redaction_pattern text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.fn_require_scoped_rpc_v1(auth.uid(),true);
  RETURN QUERY
  WITH base AS (
    SELECT
      t.id AS tid,
      t.jurisdiction_name,
      t.state,
      t.county,
      t.population,
      t.target_type,
      t.portal_difficulty_score,
      COUNT(r.id) AS total_req,
      COUNT(r.id) FILTER (WHERE r.status='fulfilled') AS fulfilled_ct,
      COUNT(r.id) FILTER (WHERE r.status='rejected') AS rejected_ct,
      COUNT(r.id) FILTER (WHERE r.status='needs_review') AS review_ct,
      COUNT(r.id) FILTER (WHERE r.status='no_portal') AS noportal_ct,
      -- avg response days (fulfilled only)
      AVG(CASE WHEN r.status='fulfilled' AND r.sent_at IS NOT NULL AND r.response_received_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.response_received_at - r.sent_at)) / 86400.0 END) AS raw_avg_days,
      AVG(r.data_quality_score) AS raw_avg_quality,
      AVG(r.fee_amount) AS raw_avg_fee,
      -- fee incidence: % of requests where fee > 0
      CASE WHEN COUNT(r.id) > 0 THEN
        COUNT(r.id) FILTER (WHERE r.fee_amount > 0)::numeric / COUNT(r.id) * 100
      ELSE 0 END AS raw_fee_incidence,
      -- avg fee among nonzero only
      AVG(r.fee_amount) FILTER (WHERE r.fee_amount > 0) AS raw_avg_fee_nz,
      -- redaction pct among fulfilled
      CASE WHEN COUNT(r.id) FILTER (WHERE r.status='fulfilled') > 0 THEN
        COUNT(r.id) FILTER (WHERE r.redaction_flag = true)::numeric
        / COUNT(r.id) FILTER (WHERE r.status='fulfilled') * 100
      ELSE 0 END AS raw_redaction_pct
    FROM targets t
    LEFT JOIN foia_requests r ON r.target_id = t.id
    WHERE NOT t.is_duplicate
    GROUP BY t.id, t.jurisdiction_name, t.state, t.county, t.population, t.target_type, t.portal_difficulty_score
  ),
  scored AS (
    SELECT *,
      -- derived rates (bounded 0-100)
      CASE WHEN total_req > 0 THEN LEAST(100, ROUND(fulfilled_ct::numeric / total_req * 100, 1)) ELSE 0 END AS fulfill_rate,
      CASE WHEN total_req > 0 THEN LEAST(100, ROUND(rejected_ct::numeric / total_req * 100, 1)) ELSE 0 END AS reject_rate,
      COALESCE(ROUND(raw_avg_days::numeric, 1), 0) AS resp_days,
      COALESCE(ROUND(raw_avg_quality::numeric, 1), 0) AS quality,
      COALESCE(ROUND(raw_avg_fee::numeric, 2), 0) AS fee_avg,
      ROUND(LEAST(100, raw_fee_incidence)::numeric, 1) AS fee_inc,
      COALESCE(ROUND(raw_avg_fee_nz::numeric, 2), 0) AS fee_nz,
      ROUND(LEAST(100, raw_redaction_pct)::numeric, 1) AS redact_pct,
      -- hostility: weighted sum of negative-outcome percentages, clamped
      CASE WHEN total_req > 0 THEN
        LEAST(100, GREATEST(0, ROUND((
          (rejected_ct::numeric / total_req * 100) * 0.50 +
          (review_ct::numeric   / total_req * 100) * 0.30 +
          (noportal_ct::numeric / total_req * 100) * 0.20
        )::numeric, 1)))
      ELSE 0 END AS hostility,
      -- JIS: 5-component weighted score with exponential speed decay
      CASE WHEN total_req > 0 THEN
        LEAST(100, GREATEST(0, ROUND((
          -- 35% fulfillment rate (already 0-100 scale)
          (LEAST(100, fulfilled_ct::numeric / total_req * 100)) * 0.35
          -- 25% speed: exponential decay  100·e^(-days/30)
          + (100.0 * EXP(-1.0 * COALESCE(raw_avg_days, 90) / 30.0)) * 0.25
          -- 20% non-rejection rate
          + (100.0 - LEAST(100, rejected_ct::numeric / total_req * 100)) * 0.20
          -- 10% data quality (1-5 → 0-100)
          + (COALESCE(raw_avg_quality, 3) * 20.0) * 0.10
          -- 10% portal ease (invert difficulty 1-5 → 100-0)
          + ((6.0 - COALESCE(portal_difficulty_score, 3)) * 20.0) * 0.10
        )::numeric, 1)))
      ELSE 0 END AS jis_score
    FROM base
  )
  SELECT
    tid AS target_id,
    jurisdiction_name, state, county, population, target_type, portal_difficulty_score,
    total_req   AS total_requests,
    fulfilled_ct AS fulfilled_count,
    rejected_ct  AS rejected_count,
    review_ct    AS needs_review_count,
    noportal_ct  AS no_portal_count,
    fulfill_rate AS fulfillment_rate,
    reject_rate  AS rejection_rate,
    resp_days    AS avg_response_days,
    quality      AS avg_data_quality,
    fee_avg      AS avg_fee_amount,
    fee_inc      AS fee_incidence_rate,
    fee_nz       AS avg_fee_nonzero,
    redact_pct   AS redaction_pct,
    hostility    AS hostility_score,
    jis_score    AS jis,
    -- tactical flags
    CASE
      WHEN resp_days <= 0 AND fulfilled_ct = 0 THEN 'DEAD'
      WHEN resp_days > 0 AND resp_days < 15 THEN 'FAST'
      WHEN resp_days >= 15 AND resp_days <= 45 THEN 'MEDIUM'
      WHEN resp_days > 45 AND resp_days <= 90 THEN 'SLOW'
      ELSE 'DEAD'
    END AS speed_tier,
    CASE
      WHEN reject_rate < 10 THEN 'LOW'
      WHEN reject_rate <= 30 THEN 'MODERATE'
      ELSE 'HIGH'
    END AS rejection_tier,
    CASE
      WHEN fee_inc <= 0 THEN 'NONE'
      WHEN fee_inc < 20 THEN 'OCCASIONAL'
      ELSE 'FREQUENT'
    END AS fee_risk,
    CASE
      WHEN redact_pct < 10 THEN 'CLEAN'
      WHEN redact_pct <= 40 THEN 'PARTIAL'
      ELSE 'HEAVY'
    END AS redaction_pattern
  FROM scored;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_allowed_states(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_get_user_allowed_states(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_check_enrichment_limit(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_check_enrichment_limit(uuid,integer) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_consume_enrichment_usage(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_consume_enrichment_usage(uuid,integer) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_update_user_states(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_update_user_states(text[]) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_check_county_limit(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_check_county_limit(integer) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_fulfillment_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_fulfillment_overview() TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_state_response_analytics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_state_response_analytics() TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.fn_jurisdiction_intelligence() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_jurisdiction_intelligence() TO authenticated,service_role;

-- Preserve safe anonymous boolean false for policy evaluation; direct foreign-role
-- lookups no longer return membership. Revoking this helper can break public RLS.
-- Direct row writes otherwise bypass the quota setter entirely.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER ON public.user_allowed_states FROM PUBLIC,anon,authenticated;
DO $verify$ BEGIN
 IF has_table_privilege('anon','public.user_allowed_states','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
    has_table_privilege('authenticated','public.user_allowed_states','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
    has_any_column_privilege('anon','public.user_allowed_states','INSERT,UPDATE') OR
    has_any_column_privilege('authenticated','public.user_allowed_states','INSERT,UPDATE') THEN
   RAISE EXCEPTION 'State mutation remains granted through an inherited or column privilege';
 END IF;
END $verify$;