-- Execute this complete candidate in ONE transaction. No business rows are changed.
-- Baseline: customer project after PR179, current main bc4de14adfcea24b33f27589add9a538cd58c6f4.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $guard$ BEGIN
IF to_regprocedure('public.fn_require_rpc_reader_v1(boolean)') IS NOT NULL THEN RAISE EXCEPTION 'RPC guard already exists'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_add_filtered_to_list(uuid,text,text,integer,integer,uuid,text,integer)'))) IS DISTINCT FROM 'bf75e6904b47e0bc44e84c5cd6ddb03d' THEN RAISE EXCEPTION 'Definition drift: fn_add_filtered_to_list'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_dashboard_stats()'))) IS DISTINCT FROM '78af3ad705af89d2f2fe31dbaf2b071d' THEN RAISE EXCEPTION 'Definition drift: fn_dashboard_stats'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_data_health_report()'))) IS DISTINCT FROM '27a06d56458e8a0b9bc7313be72de37a' THEN RAISE EXCEPTION 'Definition drift: fn_data_health_report'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_distinct_city_counts()'))) IS DISTINCT FROM 'e88cc6483b149dc089485083ab18d261' THEN RAISE EXCEPTION 'Definition drift: fn_distinct_city_counts'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_get_list_properties(uuid,integer,integer)'))) IS DISTINCT FROM '9c16c0d3a89d00dac5047d8cc648baaa' THEN RAISE EXCEPTION 'Definition drift: fn_get_list_properties'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_get_unlock_count(uuid)'))) IS DISTINCT FROM 'e4e5333952eafe64f5b9ebd1636479fc' THEN RAISE EXCEPTION 'Definition drift: fn_get_unlock_count'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_job_status(uuid)'))) IS DISTINCT FROM '023b208645fcc040935fa59d10b2f46f' THEN RAISE EXCEPTION 'Definition drift: fn_job_status'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_jurisdiction_stats()'))) IS DISTINCT FROM '5172bc661b9d03fed377757f12ded6e0' THEN RAISE EXCEPTION 'Definition drift: fn_jurisdiction_stats'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_map_markers(text,text,text,integer,integer,integer)'))) IS DISTINCT FROM '02706932be72415d2538bd32a6efe276' THEN RAISE EXCEPTION 'Definition drift: fn_map_markers'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_opportunity_funnel()'))) IS DISTINCT FROM 'aa3f8dbf79f777e9fcd3bc4ad4728f2c' THEN RAISE EXCEPTION 'Definition drift: fn_opportunity_funnel'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_properties_untraced_in_list(uuid,integer)'))) IS DISTINCT FROM 'b063a6fac62a7846bbfd9f8c032e53c6' THEN RAISE EXCEPTION 'Definition drift: fn_properties_untraced_in_list'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_violation_counts_by_area(text,text)'))) IS DISTINCT FROM '4a8d977785e08a79df1a4123e8a38a74' THEN RAISE EXCEPTION 'Definition drift: fn_violation_counts_by_area'; END IF;
IF md5(pg_get_functiondef(to_regprocedure('public.fn_zip_pressure(text,text)'))) IS DISTINCT FROM '21bca3c30d4020411bee320a93c2ec89' THEN RAISE EXCEPTION 'Definition drift: fn_zip_pressure'; END IF;
IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN ('public.properties'::regclass,'public.violations'::regclass,'public.lead_lists'::regclass,'public.list_properties'::regclass,'public.skiptrace_jobs'::regclass,'public.unlocked_properties'::regclass,'public.property_contacts'::regclass) AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'Dependent RLS disabled'; END IF;
END $guard$;


CREATE FUNCTION public.fn_require_rpc_reader_v1(p_admin_only boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path='pg_catalog' AS $guard$
BEGIN
  -- Role comes from the database executor, not an editable JWT/user metadata key.
  IF current_user='service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR p_admin_only IS NULL OR
     (p_admin_only AND NOT coalesce(public.has_role(auth.uid(),'admin'::public.app_role),false)) THEN
    RAISE EXCEPTION 'This account is not authorized for this database operation' USING ERRCODE='42501';
  END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.fn_require_rpc_reader_v1(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_require_rpc_reader_v1(boolean) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.fn_add_filtered_to_list(p_list_id uuid, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_min_score integer DEFAULT NULL::integer, p_max_score integer DEFAULT NULL::integer, p_jurisdiction_id uuid DEFAULT NULL::uuid, p_enforcement_type text DEFAULT NULL::text, p_limit integer DEFAULT 25000)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
 SET row_security TO 'on'
AS $function$
DECLARE
  v_user_id UUID;
  v_inserted INT := 0;
  v_total_matching INT;
  v_data_tier TEXT;
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify the list belongs to this user
  IF NOT EXISTS (
    SELECT 1 FROM lead_lists WHERE id = p_list_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'List not found or access denied');
  END IF;

  -- Get user's data tier for filtering
  SELECT COALESCE(sp.data_tier, 'basic') INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_user_id AND us.status = 'active'
  LIMIT 1;

  -- Count matching properties first (use EXPLAIN ANALYZE optimized query)
  SELECT COUNT(*) INTO v_total_matching
  FROM properties p
  WHERE (p_state IS NULL OR p.state = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
    AND (p_min_score IS NULL OR p.snap_score >= p_min_score)
    AND (p_max_score IS NULL OR p.snap_score <= p_max_score)
    AND (p_jurisdiction_id IS NULL OR p.jurisdiction_id = p_jurisdiction_id)
    AND (p_enforcement_type IS NULL OR p.enforcement_type = p_enforcement_type)
    AND (v_data_tier = 'premium' OR p.enforcement_type = 'code_violation');

  -- Use a direct INSERT ... SELECT with ON CONFLICT (more efficient)
  INSERT INTO list_properties (list_id, property_id, created_by)
  SELECT p_list_id, p.id, v_user_id
  FROM properties p
  WHERE (p_state IS NULL OR p.state = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
    AND (p_min_score IS NULL OR p.snap_score >= p_min_score)
    AND (p_max_score IS NULL OR p.snap_score <= p_max_score)
    AND (p_jurisdiction_id IS NULL OR p.jurisdiction_id = p_jurisdiction_id)
    AND (p_enforcement_type IS NULL OR p.enforcement_type = p_enforcement_type)
    AND (v_data_tier = 'premium' OR p.enforcement_type = 'code_violation')
  ORDER BY p.snap_score DESC NULLS LAST
  LIMIT p_limit
  ON CONFLICT (list_id, property_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'inserted', v_inserted,
    'total_matching', v_total_matching,
    'limit_applied', p_limit
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_add_filtered_to_list(uuid,text,text,integer,integer,uuid,text,integer) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_add_filtered_to_list(uuid,text,text,integer,integer,uuid,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_data_tier text;
  result JSON;
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'total_leads', 0,
      'hot_leads', 0,
      'avg_snap_score', 0,
      'distressed_count', 0,
      'value_add_count', 0,
      'watch_count', 0,
      'distressed_avg', 0,
      'value_add_avg', 0,
      'watch_avg', 0
    );
  END IF;

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Build stats filtered by data_tier
  IF v_data_tier = 'basic' THEN
    -- Basic: only code violations
    SELECT json_build_object(
      'total_leads', (SELECT COUNT(*) FROM properties WHERE enforcement_type = 'code_violation'),
      'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80 AND enforcement_type = 'code_violation'),
      'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL AND enforcement_type = 'code_violation'),
      'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70 AND enforcement_type = 'code_violation'),
      'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70 AND enforcement_type = 'code_violation'),
      'watch_count', (SELECT COUNT(*) FROM properties WHERE (snap_score < 40 OR snap_score IS NULL) AND enforcement_type = 'code_violation'),
      'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70 AND enforcement_type = 'code_violation'),
      'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70 AND enforcement_type = 'code_violation'),
      'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL AND enforcement_type = 'code_violation'),
      'data_tier', v_data_tier
    ) INTO result;
  ELSE
    -- Premium or no subscription: show all
    SELECT json_build_object(
      'total_leads', (SELECT COUNT(*) FROM properties),
      'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80),
      'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL),
      'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70),
      'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
      'watch_count', (SELECT COUNT(*) FROM properties WHERE snap_score < 40 OR snap_score IS NULL),
      'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70),
      'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
      'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL),
      'data_tier', v_data_tier
    ) INTO result;
  END IF;
  
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_dashboard_stats() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_dashboard_stats() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_data_health_report()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  SELECT json_build_object(
    'total_properties', (SELECT COUNT(*) FROM properties),
    'missing_zip', (SELECT COUNT(*) FROM properties WHERE zip IS NULL OR zip = ''),
    'missing_zip_pct', ROUND(100.0 * (SELECT COUNT(*) FROM properties WHERE zip IS NULL OR zip = '') / GREATEST((SELECT COUNT(*) FROM properties), 1), 2),
    'missing_latlng', (SELECT COUNT(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0),
    'missing_latlng_pct', ROUND(100.0 * (SELECT COUNT(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0) / GREATEST((SELECT COUNT(*) FROM properties), 1), 2),
    'missing_snap_score', (SELECT COUNT(*) FROM properties WHERE snap_score IS NULL),
    'total_violations', (SELECT COUNT(*) FROM violations),
    'top_missing_zip_cities', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT city, state,
          COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') as missing,
          COUNT(*) as total,
          ROUND(100.0 * COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') / COUNT(*), 1) as pct_missing,
          MAX(updated_at) as last_update
        FROM properties
        GROUP BY city, state
        HAVING COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') > 0
        ORDER BY COUNT(*) FILTER (WHERE zip IS NULL OR zip = '') DESC
        LIMIT 25
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_data_health_report() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_data_health_report() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_distinct_city_counts()
 RETURNS TABLE(city text, state text, cnt bigint)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
  SELECT public.fn_require_rpc_reader_v1(true);
  SELECT TRIM(p.city) AS city, UPPER(TRIM(p.state)) AS state, COUNT(*) AS cnt
  FROM properties p
  WHERE p.city IS NOT NULL AND p.state IS NOT NULL
  GROUP BY TRIM(p.city), UPPER(TRIM(p.state))
  ORDER BY cnt DESC;
$function$;

REVOKE ALL ON FUNCTION public.fn_distinct_city_counts() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_distinct_city_counts() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_get_list_properties(p_list_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
DECLARE
  v_user_id UUID;
  v_offset INT;
  v_total BIGINT;
  v_items JSON;
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  v_user_id := auth.uid();
  v_offset := (p_page - 1) * p_page_size;

  -- Verify list ownership
  IF NOT EXISTS (
    SELECT 1 FROM lead_lists WHERE id = p_list_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'List not found');
  END IF;

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM list_properties lp
  WHERE lp.list_id = p_list_id;

  -- Get properties
  SELECT json_agg(row_to_json(t)) INTO v_items
  FROM (
    SELECT 
      p.id,
      p.address,
      p.city,
      p.state,
      p.zip,
      p.snap_score,
      p.total_violations,
      p.open_violations,
      p.enforcement_type,
      p.opportunity_class,
      lp.added_at
    FROM list_properties lp
    JOIN properties p ON lp.property_id = p.id
    WHERE lp.list_id = p_list_id
    ORDER BY lp.added_at DESC
    LIMIT p_page_size
    OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'success', true,
    'items', COALESCE(v_items, '[]'::json),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_list_properties(uuid,integer,integer) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_get_list_properties(uuid,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_get_unlock_count(p_property_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
  SELECT public.fn_require_rpc_reader_v1(false);
  SELECT COUNT(*)::INTEGER FROM unlocked_properties WHERE property_id = p_property_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_unlock_count(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_get_unlock_count(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_job_status(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
DECLARE
  v_job record;
  v_contacts_count int;
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(false);
  SELECT * INTO v_job
  FROM skiptrace_jobs
  WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Count contacts created for this job's properties
  SELECT COUNT(*) INTO v_contacts_count
  FROM property_contacts
  WHERE property_id = ANY(v_job.property_ids)
    AND created_at >= v_job.created_at;
  
  RETURN jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'counts', v_job.counts,
    'contacts_found', v_contacts_count,
    'created_at', v_job.created_at,
    'started_at', v_job.started_at,
    'finished_at', v_job.finished_at,
    'error', v_job.error
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_job_status(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_job_status(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_jurisdiction_stats()
 RETURNS TABLE(jurisdiction_id uuid, jurisdiction_name text, city text, state text, enforcement_profile jsonb, property_count bigint, avg_score numeric, distressed_count bigint)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  RETURN QUERY
  SELECT 
    j.id as jurisdiction_id,
    j.name as jurisdiction_name,
    j.city,
    j.state,
    COALESCE(j.enforcement_profile, '{"strictness": "unknown", "avg_violations_per_property": 0, "score_multiplier": 1.0}'::jsonb) as enforcement_profile,
    COUNT(p.id)::BIGINT as property_count,
    COALESCE(ROUND(AVG(p.snap_score)), 0) as avg_score,
    COUNT(CASE WHEN p.snap_score >= 70 THEN 1 END)::BIGINT as distressed_count
  FROM jurisdictions j
  LEFT JOIN properties p ON p.jurisdiction_id = j.id
  GROUP BY j.id, j.name, j.city, j.state, j.enforcement_profile
  HAVING COUNT(p.id) > 0
  ORDER BY COUNT(p.id) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_jurisdiction_stats() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_jurisdiction_stats() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_map_markers(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_limit integer DEFAULT 50000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_data_tier text;
  v_items jsonb;
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Authentication required'
    );
  END IF;

  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- No subscription = no markers
  IF v_data_tier IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Active subscription required'
    );
  END IF;

  -- Fetch markers based on data_tier
  IF v_data_tier = 'basic' THEN
    SELECT jsonb_agg(row_to_json(m)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state, p.enforcement_type
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND p.enforcement_type = 'code_violation'
        AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) m;
  ELSE
    SELECT jsonb_agg(row_to_json(m)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state, p.enforcement_type
      FROM properties p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR p.city ILIKE p_city)
        AND (p_search IS NULL OR p.address ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) m;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(jsonb_array_length(v_items), 0),
    'data_tier', v_data_tier
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_map_markers(text,text,text,integer,integer,integer) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_map_markers(text,text,text,integer,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_opportunity_funnel()
 RETURNS TABLE(opportunity_class text, property_count bigint, avg_score numeric)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  RETURN QUERY
  SELECT 
    'distressed'::TEXT as opportunity_class,
    COUNT(*)::BIGINT as property_count,
    COALESCE(ROUND(AVG(snap_score)), 0) as avg_score
  FROM properties 
  WHERE snap_score >= 70
  
  UNION ALL
  
  SELECT 
    'value_add'::TEXT,
    COUNT(*)::BIGINT,
    COALESCE(ROUND(AVG(snap_score)), 0)
  FROM properties 
  WHERE snap_score >= 40 AND snap_score < 70
  
  UNION ALL
  
  SELECT 
    'watch'::TEXT,
    COUNT(*)::BIGINT,
    COALESCE(ROUND(AVG(snap_score)), 0)
  FROM properties 
  WHERE snap_score < 40 OR snap_score IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_opportunity_funnel() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_opportunity_funnel() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_properties_untraced_in_list(p_list_id uuid, p_limit integer DEFAULT 5000)
 RETURNS TABLE(property_id uuid)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
  SELECT public.fn_require_rpc_reader_v1(false);
  SELECT lp.property_id
  FROM public.list_properties lp
  LEFT JOIN public.property_contacts pc ON pc.property_id = lp.property_id
  WHERE lp.list_id = p_list_id
  GROUP BY lp.property_id
  HAVING COUNT(pc.property_id) = 0
  LIMIT p_limit;
$function$;

REVOKE ALL ON FUNCTION public.fn_properties_untraced_in_list(uuid,integer) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_properties_untraced_in_list(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_violation_counts_by_area(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS TABLE(violation_type text, count bigint)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
BEGIN
  PERFORM public.fn_require_rpc_reader_v1(true);
  RETURN QUERY
  SELECT
    v.violation_type,
    COUNT(*)::BIGINT AS count
  FROM violations v
  JOIN properties p ON p.id = v.property_id
  WHERE
    (p_state IS NULL OR p.state = p_state)
    AND (p_city IS NULL OR p.city = p_city)
    AND v.violation_type IS NOT NULL
  GROUP BY v.violation_type
  ORDER BY count DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_violation_counts_by_area(text,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_violation_counts_by_area(text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_zip_pressure(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS TABLE(zip text, avg_score numeric, property_count bigint, avg_lat numeric, avg_lng numeric)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
 SET row_security TO 'on'
AS $function$
  SELECT public.fn_require_rpc_reader_v1(true);
  SELECT
    p.zip,
    ROUND(AVG(p.snap_score)::numeric, 1) AS avg_score,
    COUNT(*) AS property_count,
    ROUND(AVG(p.latitude)::numeric, 6) AS avg_lat,
    ROUND(AVG(p.longitude)::numeric, 6) AS avg_lng
  FROM properties p
  WHERE p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.snap_score IS NOT NULL
    AND p.zip IS NOT NULL
    AND p.zip != ''
    AND (p_state IS NULL OR p.state = p_state)
    AND (p_city IS NULL OR p.city = p_city)
  GROUP BY p.zip
  HAVING COUNT(*) >= 2
  ORDER BY AVG(p.snap_score) DESC
  LIMIT 500;
$function$;

REVOKE ALL ON FUNCTION public.fn_zip_pressure(text,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fn_zip_pressure(text,text) TO authenticated,service_role;