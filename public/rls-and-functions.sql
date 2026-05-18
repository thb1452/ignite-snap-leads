-- Generated from snapignite-prod (ojyxblegxpdgaqiscxpz) live state
-- Excludes extension-owned functions (PostGIS, pgcrypto, etc.)
-- Apply AFTER schema-export.sql


-- ============================================
-- Functions
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find the pending invitation
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Insert the role (ignore if already exists)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_invitation.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN json_build_object('success', true, 'role', v_invitation.role);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_enroll_lead_in_sequences(_lead_id uuid, _trigger_type text, _match_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead RECORD;
  _seq RECORD;
  _to_number text;
BEGIN
  -- Load lead
  SELECT id, org_id, property_id INTO _lead
  FROM leads WHERE id = _lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Resolve a phone for the lead's owner (best-effort)
  SELECT phone INTO _to_number
  FROM property_contacts
  WHERE property_id = _lead.property_id
    AND phone IS NOT NULL
    AND phone <> ''
  ORDER BY created_at DESC
  LIMIT 1;

  -- Iterate matching sequences
  FOR _seq IN
    SELECT id FROM drip_sequences
    WHERE org_id = _lead.org_id
      AND is_active = true
      AND trigger_type = _trigger_type
      AND (
        trigger_config->>'match' = _match_value
        OR trigger_config->>'match' = '*'
        OR trigger_config = '{}'::jsonb
      )
  LOOP
    -- Skip if already enrolled in this sequence (active or paused)
    IF EXISTS (
      SELECT 1 FROM drip_enrollments
      WHERE lead_id = _lead_id AND sequence_id = _seq.id
        AND status IN ('active', 'paused')
    ) THEN CONTINUE; END IF;

    INSERT INTO drip_enrollments (
      org_id, lead_id, sequence_id, current_step,
      next_run_at, status, to_number
    ) VALUES (
      _lead.org_id, _lead_id, _seq.id, 0,
      now(), 'active', _to_number
    );
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_insights_batch(batch_size integer DEFAULT 5000)
 RETURNS TABLE(processed integer, remaining bigint)
 LANGUAGE plpgsql
 SET statement_timeout TO '600s'
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INTEGER := 0;
BEGIN
  -- Update properties with NULL snap_insight using the SQL function
  WITH batch AS (
    SELECT id, total_violations, open_violations, avg_days_open, 
           violation_types, distress_signals, repeat_offender, 
           multi_department, escalated
    FROM properties
    WHERE snap_insight IS NULL
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE properties p
  SET snap_insight = generate_enforcement_insight(
    b.total_violations,
    b.open_violations,
    b.avg_days_open,
    b.violation_types,
    b.distress_signals,
    b.repeat_offender,
    b.multi_department,
    b.escalated
  ),
  last_analyzed_at = NOW()
  FROM batch b
  WHERE p.id = b.id;
  
  GET DIAGNOSTICS v_processed = ROW_COUNT;
  
  RETURN QUERY SELECT v_processed, (SELECT COUNT(*) FROM properties WHERE snap_insight IS NULL);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_property_aggregates_batch(p_batch_size integer DEFAULT 5000)
 RETURNS TABLE(processed integer, updated integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INTEGER := 0;
  v_updated INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  WITH stale_properties AS (
    SELECT id
    FROM properties
    WHERE total_violations = 0 OR total_violations IS NULL
    LIMIT p_batch_size
  ),
  violation_aggregates AS (
    SELECT 
      v.property_id,
      COUNT(*)::INTEGER AS total_violations,
      COUNT(*) FILTER (WHERE LOWER(TRIM(v.status)) = 'open')::INTEGER AS open_violations,
      ARRAY_AGG(DISTINCT fn_normalize_violation_type(v.violation_type)) 
        FILTER (WHERE v.violation_type IS NOT NULL AND v.violation_type != '') AS violation_types,
      COUNT(DISTINCT v.case_id) FILTER (WHERE v.case_id IS NOT NULL AND v.case_id != '') > 1 AS repeat_offender,
      MAX(v.opened_date) AS last_enforcement_date
    FROM violations v
    INNER JOIN stale_properties sp ON v.property_id = sp.id
    GROUP BY v.property_id
  )
  UPDATE properties p
  SET 
    total_violations = COALESCE(va.total_violations, 0),
    open_violations = COALESCE(va.open_violations, 0),
    violation_types = COALESCE(va.violation_types, ARRAY[]::TEXT[]),
    repeat_offender = COALESCE(va.repeat_offender, FALSE),
    last_enforcement_date = va.last_enforcement_date,
    updated_at = NOW()
  FROM stale_properties sp
  LEFT JOIN violation_aggregates va ON sp.id = va.property_id
  WHERE p.id = sp.id;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_processed := v_updated;
  
  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM properties
  WHERE total_violations = 0 OR total_violations IS NULL;
  
  RETURN QUERY SELECT v_processed, v_updated, v_remaining;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_violation_dates_batch(p_batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
  v_remaining int;
BEGIN
  WITH batch AS (
    SELECT p.id
    FROM properties p
    WHERE p.newest_violation_date IS NULL
      AND p.total_violations > 0
    LIMIT p_batch_size
  ),
  agg AS (
    SELECT 
      v.property_id,
      MAX(COALESCE(v.opened_date, v.created_at::date)) AS max_date,
      MIN(COALESCE(v.opened_date, v.created_at::date)) AS min_date
    FROM violations v
    WHERE v.property_id IN (SELECT id FROM batch)
    GROUP BY v.property_id
  ),
  do_update AS (
    UPDATE properties p
    SET 
      newest_violation_date = a.max_date,
      oldest_violation_date = COALESCE(p.oldest_violation_date, a.min_date)
    FROM agg a
    WHERE p.id = a.property_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_updated FROM do_update;

  SELECT COUNT(*) INTO v_remaining
  FROM properties
  WHERE newest_violation_date IS NULL AND total_violations > 0;

  RETURN jsonb_build_object('updated', v_updated, 'remaining', v_remaining);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.batch_normalize_violation_types(batch_size integer DEFAULT 1000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  fixed int := 0;
BEGIN
  WITH targets AS (
    SELECT id FROM properties
    WHERE EXISTS (
      SELECT 1 FROM unnest(violation_types) vt
      WHERE vt NOT IN ('Exterior','Safety','Zoning','Structural','Vacancy','Utility','Fire','Unknown','Water Disconnection')
    )
    LIMIT batch_size
  ),
  updated AS (
    UPDATE properties p
    SET violation_types = (
      SELECT ARRAY(SELECT DISTINCT fn_normalize_violation_type(vt) FROM unnest(p.violation_types) vt)
    )
    FROM targets t
    WHERE p.id = t.id
    RETURNING p.id
  )
  SELECT count(*) INTO fixed FROM updated;
  
  RETURN fixed;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_upsert_violations(p_violations jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_existing_status_changed_at TIMESTAMPTZ;
  v_existing_previous_status TEXT;
  v_property_id UUID;
  v_violation_type TEXT;
  v_case_id TEXT;
  v_status TEXT;
  v_opened_date DATE;
  v_last_updated TIMESTAMPTZ;
  v_description TEXT;
  v_raw_description TEXT;
  v_result JSON;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_violations)
  LOOP
    BEGIN
      -- Extract fields
      v_property_id := (v_item->>'property_id')::UUID;
      v_violation_type := v_item->>'violation_type';
      v_case_id := v_item->>'case_id';
      v_status := COALESCE(v_item->>'status', 'Open');
      v_opened_date := (v_item->>'opened_date')::DATE;
      v_last_updated := (v_item->>'last_updated')::TIMESTAMPTZ;
      v_description := v_item->>'description';
      v_raw_description := v_item->>'raw_description';

      -- Reset existing vars
      v_existing_id := NULL;
      v_existing_status := NULL;
      v_existing_status_changed_at := NULL;
      v_existing_previous_status := NULL;

      -- Check for existing violation
      SELECT id, status, status_changed_at, previous_status
      INTO v_existing_id, v_existing_status, v_existing_status_changed_at, v_existing_previous_status
      FROM violations
      WHERE property_id = v_property_id
        AND violation_type = v_violation_type
        AND (case_id = v_case_id OR (case_id IS NULL AND v_case_id IS NULL))
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        -- Update existing violation with lifecycle tracking
        UPDATE violations SET
          status = v_status,
          previous_status = CASE 
            WHEN v_existing_status != v_status THEN v_existing_status 
            ELSE v_existing_previous_status 
          END,
          status_changed_at = CASE 
            WHEN v_existing_status != v_status THEN NOW() 
            ELSE v_existing_status_changed_at 
          END,
          closed_at = CASE 
            WHEN v_status IN ('Closed', 'Resolved', 'Complied') AND v_existing_status NOT IN ('Closed', 'Resolved', 'Complied') THEN NOW()::DATE
            WHEN v_status NOT IN ('Closed', 'Resolved', 'Complied') THEN NULL
            ELSE closed_at
          END,
          last_updated = COALESCE(v_last_updated, NOW())::DATE,
          last_seen_at = NOW(),
          description = COALESCE(v_description, description),
          raw_description = COALESCE(v_raw_description, raw_description),
          days_open = CASE 
            WHEN v_status NOT IN ('Closed', 'Resolved', 'Complied') AND opened_date IS NOT NULL 
            THEN EXTRACT(DAY FROM NOW() - opened_date)::INT
            ELSE days_open
          END
        WHERE id = v_existing_id;
        
        v_updated := v_updated + 1;
      ELSE
        -- Insert new violation
        INSERT INTO violations (
          property_id,
          violation_type,
          case_id,
          status,
          opened_date,
          last_updated,
          description,
          raw_description,
          first_seen_at,
          last_seen_at,
          days_open
        ) VALUES (
          v_property_id,
          v_violation_type,
          v_case_id,
          v_status,
          v_opened_date,
          COALESCE(v_last_updated, NOW())::DATE,
          v_description,
          v_raw_description,
          NOW(),
          NOW(),
          CASE 
            WHEN v_opened_date IS NOT NULL 
            THEN EXTRACT(DAY FROM NOW() - v_opened_date)::INT
            ELSE NULL
          END
        );
        
        v_inserted := v_inserted + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Row error: ' || SQLERRM);
    END;
  END LOOP;

  v_result := json_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'errors', v_errors
  );

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_foia_invite(p_token text)
 RETURNS TABLE(email text, accepted boolean, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT fi.email, fi.accepted, fi.expires_at
  FROM public.foia_invites fi
  WHERE fi.token = p_token
    AND fi.expires_at > now()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_due_drip_enrollments(_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, org_id uuid, lead_id uuid, sequence_id uuid, current_step integer, to_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT e.id
    FROM public.drip_enrollments e
    WHERE e.status = 'active'
      AND e.next_run_at <= now()
    ORDER BY e.next_run_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  ),
  bumped AS (
    UPDATE public.drip_enrollments e
    SET next_run_at = now() + interval '5 minutes'
    FROM claimed
    WHERE e.id = claimed.id
    RETURNING e.id, e.org_id, e.lead_id, e.sequence_id, e.current_step, e.to_number
  )
  SELECT b.id, b.org_id, b.lead_id, b.sequence_id, b.current_step, b.to_number FROM bumped b;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_foia_signup(p_user_id uuid, p_email text, p_full_name text, p_role text DEFAULT 'va'::text, p_token text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_global_admin boolean := false;
  v_effective_role text := 'va';
BEGIN
  -- Without token, caller must be authenticated as that same user.
  IF p_token IS NULL THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Unauthorized profile provisioning attempt';
    END IF;
  END IF;

  -- Validate token flow (used when no session yet during invite signup)
  IF p_token IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.foia_invites fi
      WHERE fi.token = p_token
        AND fi.accepted = false
        AND fi.expires_at > now()
        AND fi.email = p_email
    ) THEN
      RAISE EXCEPTION 'Invalid or expired invite token';
    END IF;
  END IF;

  -- Derive effective role from app-level admin role only.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role::text = 'admin'
  ) INTO v_is_global_admin;

  IF v_is_global_admin THEN
    v_effective_role := 'admin';
  ELSE
    v_effective_role := 'va';
  END IF;

  INSERT INTO public.foia_profiles (id, email, full_name, role)
  VALUES (p_user_id, p_email, p_full_name, v_effective_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = CASE
          WHEN public.foia_profiles.role = 'admin' THEN 'admin'
          ELSE EXCLUDED.role
        END;

  IF p_token IS NOT NULL THEN
    UPDATE public.foia_invites
    SET accepted = true
    WHERE token = p_token
      AND accepted = false;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_credit(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits and lock the row
  SELECT credits INTO current_credits
  FROM public.user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check if user has credits
  IF current_credits IS NULL OR current_credits <= 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;
  
  -- Deduct credit
  UPDATE public.user_profiles
  SET credits = credits - 1, updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Return new balance
  RETURN current_credits - 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT email FROM auth.users WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_add_filtered_to_list(p_list_id uuid, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_min_score integer DEFAULT NULL::integer, p_max_score integer DEFAULT NULL::integer, p_jurisdiction_id uuid DEFAULT NULL::uuid, p_enforcement_type text DEFAULT NULL::text, p_limit integer DEFAULT 25000)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_user_id UUID;
  v_inserted INT := 0;
  v_total_matching INT;
  v_data_tier TEXT;
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_backfill_zips_by_city_centroids(p_city text, p_state text, p_batch_size integer DEFAULT 500)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INT := 0;
  v_remaining INT := 0;
  v_no_coords INT := 0;
BEGIN
  -- Build centroids ONLY from same city's existing ZIP data
  WITH city_zip_centroids AS (
    SELECT zip,
      AVG(latitude::float) as clat,
      AVG(longitude::float) as clng
    FROM properties
    WHERE zip IS NOT NULL AND zip != ''
      AND UPPER(city) = UPPER(p_city)
      AND UPPER(state) = UPPER(p_state)
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    GROUP BY zip
  ),
  candidates AS (
    SELECT id, address, city, state, latitude::float as lat, longitude::float as lng
    FROM properties
    WHERE (zip IS NULL OR zip = '')
      AND UPPER(city) = UPPER(p_city)
      AND UPPER(state) = UPPER(p_state)
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    LIMIT p_batch_size
  ),
  nearest AS (
    SELECT DISTINCT ON (c.id)
      c.id, c.address, c.city, c.state, zc.zip as derived_zip
    FROM candidates c
    CROSS JOIN city_zip_centroids zc
    ORDER BY c.id, (c.lat - zc.clat)^2 + (c.lng - zc.clng)^2
  ),
  safe_updates AS (
    SELECT n.id, n.derived_zip
    FROM nearest n
    WHERE NOT EXISTS (
      SELECT 1 FROM properties p2
      WHERE p2.id != n.id
        AND lower(trim(p2.address)) = lower(trim(n.address))
        AND lower(trim(p2.city)) = lower(trim(n.city))
        AND lower(trim(p2.state)) = lower(trim(n.state))
        AND lower(trim(p2.zip)) = lower(trim(n.derived_zip))
    )
  ),
  do_update AS (
    UPDATE properties p
    SET zip = su.derived_zip
    FROM safe_updates su
    WHERE p.id = su.id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_updated FROM do_update;

  SELECT COUNT(*) INTO v_remaining
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND UPPER(city) = UPPER(p_city) AND UPPER(state) = UPPER(p_state)
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude != 0 AND longitude != 0;

  SELECT COUNT(*) INTO v_no_coords
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND UPPER(city) = UPPER(p_city) AND UPPER(state) = UPPER(p_state)
    AND (latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0);

  RETURN json_build_object(
    'updated', v_updated,
    'remaining_with_coords', v_remaining,
    'no_coords', v_no_coords
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_backfill_zips_by_city_mode(p_city text, p_state text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode_zip TEXT;
  v_updated INTEGER := 0;
  v_rec RECORD;
  v_existing_id UUID;
BEGIN
  SELECT zip INTO v_mode_zip
  FROM properties
  WHERE LOWER(city) = LOWER(p_city)
    AND LOWER(state) = LOWER(p_state)
    AND zip IS NOT NULL AND zip != ''
  GROUP BY zip
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_mode_zip IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT id, address FROM properties
    WHERE LOWER(city) = LOWER(p_city)
      AND LOWER(state) = LOWER(p_state)
      AND (zip IS NULL OR zip = '')
  LOOP
    SELECT id INTO v_existing_id
    FROM properties
    WHERE LOWER(TRIM(address)) = LOWER(TRIM(v_rec.address))
      AND LOWER(TRIM(city)) = LOWER(TRIM(p_city))
      AND LOWER(TRIM(state)) = LOWER(TRIM(p_state))
      AND LOWER(TRIM(zip)) = LOWER(TRIM(v_mode_zip))
      AND id != v_rec.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Merge: move non-duplicate violations
      UPDATE violations SET property_id = v_existing_id 
      WHERE property_id = v_rec.id
        AND NOT EXISTS (
          SELECT 1 FROM violations v2 
          WHERE v2.property_id = v_existing_id AND v2.case_id = violations.case_id
        );
      -- Delete remaining duplicate violations
      DELETE FROM violations WHERE property_id = v_rec.id;
      -- Move non-duplicate list entries
      UPDATE list_properties SET property_id = v_existing_id
      WHERE property_id = v_rec.id
        AND NOT EXISTS (
          SELECT 1 FROM list_properties lp2 
          WHERE lp2.property_id = v_existing_id AND lp2.list_id = list_properties.list_id
        );
      DELETE FROM list_properties WHERE property_id = v_rec.id;
      -- Move other linked records (no unique constraints)
      UPDATE lead_activity SET property_id = v_existing_id WHERE property_id = v_rec.id;
      UPDATE property_contacts SET property_id = v_existing_id WHERE property_id = v_rec.id;
      UPDATE call_logs SET property_id = v_existing_id WHERE property_id = v_rec.id;
      UPDATE clean_leads SET property_id = v_existing_id WHERE property_id = v_rec.id;
      -- Delete the duplicate property
      DELETE FROM properties WHERE id = v_rec.id;
    ELSE
      UPDATE properties SET zip = v_mode_zip WHERE id = v_rec.id;
    END IF;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_backfill_zips_nearest_neighbor(p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_batch_size integer DEFAULT 500)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INT := 0;
  v_skipped INT := 0;
  v_conflicts INT := 0;
  v_no_coords INT := 0;
  v_total INT := 0;
BEGIN
  -- Set-based update using zip centroids and lateral join
  WITH zip_centroids AS (
    -- Pre-compute average lat/lng per ZIP in the search area
    SELECT zip,
      AVG(latitude::float) as clat,
      AVG(longitude::float) as clng
    FROM properties
    WHERE zip IS NOT NULL AND zip != ''
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
      AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    GROUP BY zip
  ),
  candidates AS (
    SELECT id, address, city, state, latitude::float as lat, longitude::float as lng
    FROM properties
    WHERE (zip IS NULL OR zip = '')
      AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
      AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude != 0 AND longitude != 0
    LIMIT p_batch_size
  ),
  nearest AS (
    SELECT DISTINCT ON (c.id)
      c.id, c.address, c.city, c.state, zc.zip as derived_zip
    FROM candidates c
    CROSS JOIN zip_centroids zc
    ORDER BY c.id, (c.lat - zc.clat)^2 + (c.lng - zc.clng)^2
  ),
  safe_updates AS (
    SELECT n.id, n.derived_zip
    FROM nearest n
    WHERE NOT EXISTS (
      SELECT 1 FROM properties p2
      WHERE p2.id != n.id
        AND lower(trim(p2.address)) = lower(trim(n.address))
        AND lower(trim(p2.city)) = lower(trim(n.city))
        AND lower(trim(p2.state)) = lower(trim(n.state))
        AND lower(trim(p2.zip)) = lower(trim(n.derived_zip))
    )
  ),
  do_update AS (
    UPDATE properties p
    SET zip = su.derived_zip
    FROM safe_updates su
    WHERE p.id = su.id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_updated FROM do_update;

  -- Count total candidates processed
  SELECT COUNT(*) INTO v_total
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude != 0 AND longitude != 0;

  SELECT COUNT(*) INTO v_no_coords
  FROM properties
  WHERE (zip IS NULL OR zip = '')
    AND (p_city IS NULL OR UPPER(city) = UPPER(p_city))
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0);

  RETURN json_build_object(
    'updated', v_updated,
    'remaining_with_coords', v_total - v_updated,
    'no_coords', v_no_coords,
    'batch_size', p_batch_size
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bulk_insert_properties(p_properties jsonb)
 RETURNS TABLE(address text, city text, state text, zip text, property_id uuid, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prop JSONB;
  inserted_id UUID;
  existing_id UUID;
BEGIN
  FOR prop IN SELECT * FROM jsonb_array_elements(p_properties)
  LOOP
    -- First try to find existing property
    SELECT id INTO existing_id
    FROM properties p
    WHERE LOWER(TRIM(p.address)) = LOWER(TRIM(prop->>'address'))
      AND LOWER(TRIM(p.city)) = LOWER(TRIM(prop->>'city'))
      AND LOWER(TRIM(p.state)) = LOWER(TRIM(prop->>'state'));
    
    IF existing_id IS NOT NULL THEN
      -- Property already exists
      address := prop->>'address';
      city := prop->>'city';
      state := prop->>'state';
      zip := prop->>'zip';
      property_id := existing_id;
      was_created := FALSE;
      RETURN NEXT;
    ELSE
      -- Insert new property
      INSERT INTO properties (address, city, state, zip, county, scope, jurisdiction_id)
      VALUES (
        prop->>'address',
        prop->>'city', 
        prop->>'state',
        prop->>'zip',
        prop->>'county',
        prop->>'scope',
        (prop->>'jurisdiction_id')::UUID
      )
      ON CONFLICT ON CONSTRAINT idx_properties_unique_address DO NOTHING
      RETURNING id INTO inserted_id;
      
      IF inserted_id IS NOT NULL THEN
        address := prop->>'address';
        city := prop->>'city';
        state := prop->>'state';
        zip := prop->>'zip';
        property_id := inserted_id;
        was_created := TRUE;
        RETURN NEXT;
      ELSE
        -- Race condition - another process inserted it, fetch it
        SELECT id INTO existing_id
        FROM properties p
        WHERE LOWER(TRIM(p.address)) = LOWER(TRIM(prop->>'address'))
          AND LOWER(TRIM(p.city)) = LOWER(TRIM(prop->>'city'))
          AND LOWER(TRIM(p.state)) = LOWER(TRIM(prop->>'state'));
        
        address := prop->>'address';
        city := prop->>'city';
        state := prop->>'state';
        zip := prop->>'zip';
        property_id := existing_id;
        was_created := FALSE;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bulk_match_properties(p_addresses text[])
 RETURNS TABLE(input_address text, property_id uuid, address text, city text, state text, zip text, snap_score integer, open_violations integer, violation_types text[], last_enforcement_date timestamp with time zone, snap_insight text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (lower(trim(p.address)))
    lower(trim(p.address)) as input_address,
    p.id as property_id,
    p.address,
    p.city,
    p.state,
    p.zip,
    p.snap_score,
    p.open_violations,
    p.violation_types,
    p.last_enforcement_date,
    p.snap_insight
  FROM properties p
  WHERE lower(trim(p.address)) = ANY(p_addresses)
  ORDER BY lower(trim(p.address)), p.snap_score DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bulk_run_inc(p_run_id text, p_field text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_field = 'succeeded' THEN
    UPDATE skiptrace_bulk_runs SET succeeded = succeeded + 1 WHERE run_id = p_run_id;
  ELSIF p_field = 'failed' THEN
    UPDATE skiptrace_bulk_runs SET failed = failed + 1 WHERE run_id = p_run_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_category_property_counts(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS TABLE(category_id text, category_label text, property_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET statement_timeout TO '10s'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT p.violation_types, p.enforcement_type
    FROM properties p
    WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
      AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
    LIMIT 500000
  )
  SELECT v.cid, v.clabel, COALESCE(counts.cnt, 0)::bigint
  FROM (VALUES
    ('exterior',  'Exterior Issues'),
    ('safety',    'Safety Issues'),
    ('structural','Structural Issues'),
    ('zoning',    'Zoning Issues'),
    ('vacancy',   'Vacancy Issues'),
    ('utility',   'Utility Issues'),
    ('water_disconnection', 'Water Disconnection')
  ) AS v(cid, clabel)
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM filtered f WHERE
      CASE v.cid
        WHEN 'exterior'   THEN f.violation_types && ARRAY['Exterior','Yard','Weeds','Weeds & Rubbish','Lawn','Fence','Paint','Siding']
        WHEN 'safety'     THEN f.violation_types && ARRAY['Safety','Fire','Hazard','Electrical','Gas']
        WHEN 'structural' THEN f.violation_types && ARRAY['Structural','Foundation','Roof','Wall','Building']
        WHEN 'zoning'     THEN f.violation_types && ARRAY['Zoning','Permit','Unpermitted','Unpermitted Construction','Land Use']
        WHEN 'vacancy'    THEN f.violation_types && ARRAY['Vacancy','Vacant','Abandoned','Boarded']
        WHEN 'utility'    THEN f.violation_types && ARRAY['Utility','Water','Sewer','Plumbing','Electric']
        WHEN 'water_disconnection' THEN f.enforcement_type = 'water_shutoff'
        ELSE false
      END
  ) counts ON true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_charge_credits(p_property_ids uuid[], p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_qty int := array_length(p_property_ids, 1);
  v_balance int;
BEGIN
  -- Lock user profile row
  SELECT balance INTO v_balance
  FROM v_user_credits
  WHERE user_id = v_user_id
  FOR UPDATE;
  
  -- Check sufficient credits with proper error code
  IF v_balance IS NULL OR v_balance < v_qty THEN
    RAISE EXCEPTION 'insufficient credits'
      USING ERRCODE = 'P0001',
            DETAIL = 'INSUFFICIENT_CREDITS';
  END IF;
  
  -- Charge credits (negative delta)
  INSERT INTO credit_ledger (user_id, delta, reason, meta)
  SELECT 
    v_user_id,
    -1,
    'skiptrace_charge',
    jsonb_build_object('job_id', p_job_id, 'property_id', pid)
  FROM unnest(p_property_ids) AS pid;
  
  RETURN jsonb_build_object(
    'charged', v_qty,
    'new_balance', v_balance - v_qty
  );
END;
$function$
;

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
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
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
  WHERE assigned_to IS NOT NULL;
  
  v_remaining := v_max_counties - v_current_count;
  
  IF v_current_count + p_amount > v_max_counties THEN
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
  SELECT us.*, sp.name as plan_name
  INTO v_sub
  FROM user_subscriptions us
  LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    v_limit := 500;
    v_is_trial := true;
    v_period_start := date_trunc('month', now());
  ELSIF v_sub.status = 'trialing' THEN
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

  IF v_used + p_address_count > v_limit THEN
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

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subscription record;
  v_usage jsonb;
  v_limit integer;
  v_current integer;
  v_remaining integer;
BEGIN
  SELECT * INTO v_subscription FROM fn_get_user_subscription(p_user_id);

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_subscription',
      'message', 'No active subscription found. Please subscribe to continue.'
    );
  END IF;

  v_usage := fn_get_current_usage(p_user_id);

  IF p_usage_type = 'exports' THEN
    v_limit := v_subscription.max_monthly_exports;
    v_current := COALESCE((v_usage->>'exports_count')::int, 0);
  ELSIF p_usage_type = 'skip_traces' THEN
    v_limit := v_subscription.max_skip_traces_per_month;
    v_current := COALESCE((v_usage->>'skip_traces_count')::int, 0);
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_type',
      'message', 'Invalid usage type'
    );
  END IF;

  IF v_limit = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current', v_current,
      'limit', null,
      'remaining', null,
      'plan_name', v_subscription.plan_name,
      'unlimited', true
    );
  END IF;

  v_remaining := v_limit - v_current;

  IF v_current + p_amount > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format(
        'You have reached your monthly %s limit (%s/%s). Upgrade your plan for more.',
        p_usage_type, v_current, v_limit
      ),
      'current', v_current,
      'limit', v_limit,
      'remaining', GREATEST(0, v_remaining),
      'plan_name', v_subscription.plan_name
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current', v_current,
    'limit', v_limit,
    'remaining', v_remaining - p_amount,
    'plan_name', v_subscription.plan_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_check_unlocked_batch(p_user_id uuid, p_property_ids uuid[])
 RETURNS TABLE(property_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT up.property_id
  FROM unlocked_properties up
  WHERE up.user_id = p_user_id
    AND up.property_id = ANY(p_property_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_consume_credit(p_reason text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE bal int;
BEGIN
  SELECT COALESCE(SUM(delta),0) INTO bal
  FROM public.credit_ledger
  WHERE user_id = auth.uid();

  IF bal <= 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, meta)
  VALUES (auth.uid(), -1, p_reason, p_meta);

  RETURN 1;
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_consume_enrichment_usage(p_user_id uuid, p_address_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check jsonb;
BEGIN
  v_check := fn_check_enrichment_limit(p_user_id, p_address_count);
  
  IF NOT (v_check->>'allowed')::boolean THEN
    RETURN v_check;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', (v_check->>'remaining')::integer - p_address_count,
    'charged', p_address_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_consume_usage(p_usage_type text, p_amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delegate to atomic implementation
  RETURN fn_consume_usage_atomic(p_usage_type, p_amount);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_consume_usage_atomic(p_usage_type text, p_amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_period_start date;
  v_period_end date;
  v_max_limit integer;
  v_plan_name text;
  v_new_count integer;
  v_old_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'message', 'Authentication required'
    );
  END IF;

  -- Get billing period and limits from subscription
  SELECT 
    us.current_period_start::date,
    us.current_period_end::date,
    CASE 
      WHEN p_usage_type = 'exports' THEN sp.max_monthly_exports
      WHEN p_usage_type = 'skip_traces' THEN sp.max_skip_traces_per_month
      ELSE 0
    END,
    sp.display_name
  INTO v_period_start, v_period_end, v_max_limit, v_plan_name
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Fallback to calendar month and starter limits if no subscription
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    
    SELECT 
      CASE 
        WHEN p_usage_type = 'exports' THEN max_monthly_exports
        WHEN p_usage_type = 'skip_traces' THEN max_skip_traces_per_month
        ELSE 0
      END,
      display_name
    INTO v_max_limit, v_plan_name
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;
  END IF;

  -- Handle unlimited plans (-1 means unlimited)
  IF v_max_limit = -1 THEN
    -- Still track usage for unlimited plans, just don't enforce
    INSERT INTO subscription_usage (user_id, period_start, period_end)
    VALUES (v_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;
    
    IF p_usage_type = 'exports' THEN
      UPDATE subscription_usage
      SET exports_count = exports_count + p_amount, updated_at = now()
      WHERE user_id = v_user_id AND period_start = v_period_start
      RETURNING exports_count INTO v_new_count;
    ELSIF p_usage_type = 'skip_traces' THEN
      UPDATE subscription_usage
      SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
      WHERE user_id = v_user_id AND period_start = v_period_start
      RETURNING skip_traces_count INTO v_new_count;
    END IF;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'consumed', p_amount,
      'current', COALESCE(v_new_count, p_amount),
      'limit', null,
      'remaining', null,
      'plan_name', v_plan_name,
      'unlimited', true
    );
  END IF;

  -- Ensure usage record exists
  INSERT INTO subscription_usage (user_id, period_start, period_end)
  VALUES (v_user_id, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  -- ATOMIC CHECK-AND-INCREMENT
  -- This is the key fix: single UPDATE with WHERE clause that checks limit
  IF p_usage_type = 'exports' THEN
    UPDATE subscription_usage
    SET exports_count = exports_count + p_amount, updated_at = now()
    WHERE user_id = v_user_id 
      AND period_start = v_period_start
      AND exports_count + p_amount <= v_max_limit
    RETURNING exports_count, exports_count - p_amount INTO v_new_count, v_old_count;
  ELSIF p_usage_type = 'skip_traces' THEN
    UPDATE subscription_usage
    SET skip_traces_count = skip_traces_count + p_amount, updated_at = now()
    WHERE user_id = v_user_id 
      AND period_start = v_period_start
      AND skip_traces_count + p_amount <= v_max_limit
    RETURNING skip_traces_count, skip_traces_count - p_amount INTO v_new_count, v_old_count;
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_type',
      'message', 'Invalid usage type'
    );
  END IF;

  -- If UPDATE didn't match any rows, the limit was exceeded
  IF v_new_count IS NULL THEN
    -- Get current count for error message
    SELECT 
      CASE 
        WHEN p_usage_type = 'exports' THEN exports_count
        WHEN p_usage_type = 'skip_traces' THEN skip_traces_count
        ELSE 0
      END
    INTO v_old_count
    FROM subscription_usage
    WHERE user_id = v_user_id AND period_start = v_period_start;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'message', format('You have reached your monthly %s limit (%s/%s). Upgrade your plan for more.', 
                       p_usage_type, COALESCE(v_old_count, 0), v_max_limit),
      'current', COALESCE(v_old_count, 0),
      'limit', v_max_limit,
      'remaining', 0,
      'plan_name', v_plan_name
    );
  END IF;

  -- Success!
  RETURN jsonb_build_object(
    'allowed', true,
    'consumed', p_amount,
    'current', v_new_count,
    'limit', v_max_limit,
    'remaining', GREATEST(0, v_max_limit - v_new_count),
    'plan_name', v_plan_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_data_tier text;
  result JSON;
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_data_health_report()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_distinct_cities(p_state text DEFAULT NULL::text)
 RETURNS TABLE(city text)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '8s'
AS $function$
  SELECT DISTINCT INITCAP(mv.city) AS city
  FROM mv_distinct_cities mv
  WHERE (p_state IS NULL OR UPPER(mv.state) = UPPER(p_state))
    AND LENGTH(mv.city) >= 3
    AND mv.city !~ '^\d'
  ORDER BY city;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_distinct_city_counts()
 RETURNS TABLE(city text, state text, cnt bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT TRIM(p.city) AS city, UPPER(TRIM(p.state)) AS state, COUNT(*) AS cnt
  FROM properties p
  WHERE p.city IS NOT NULL AND p.state IS NOT NULL
  GROUP BY TRIM(p.city), UPPER(TRIM(p.state))
  ORDER BY cnt DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_distinct_states()
 RETURNS TABLE(state text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT state FROM mv_distinct_states ORDER BY state;
$function$
;

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
      AND (NOT p_enforce_code_violation_only OR p.enforcement_type = 'code_violation')
  ) q;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_fix_city_names(mappings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  m jsonb;
  old_city_val text;
  old_state_val text;
  new_city_val text;
  total_updated int := 0;
  total_merged int := 0;
  merge_count int;
  update_count int;
  dup record;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(mappings)
  LOOP
    old_city_val := m->>'old_city';
    old_state_val := m->>'old_state';
    new_city_val := m->>'new_city';

    -- Step 1: Handle duplicates - find old-city rows that would conflict
    -- Reassign child records and delete duplicates in bulk
    FOR dup IN
      SELECT old_p.id AS old_id, keeper.id AS keeper_id
      FROM properties old_p
      JOIN properties keeper
        ON UPPER(TRIM(keeper.address)) = UPPER(TRIM(old_p.address))
        AND UPPER(TRIM(keeper.city)) = UPPER(TRIM(new_city_val))
        AND UPPER(TRIM(keeper.state)) = UPPER(TRIM(old_p.state))
        AND keeper.id != old_p.id
      WHERE UPPER(TRIM(old_p.city)) = UPPER(TRIM(old_city_val))
        AND UPPER(TRIM(old_p.state)) = UPPER(TRIM(old_state_val))
    LOOP
      UPDATE lead_activity SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE list_properties SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE call_logs SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE property_contacts SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      UPDATE saved_properties SET property_id = dup.keeper_id WHERE property_id = dup.old_id;
      DELETE FROM clean_leads WHERE property_id = dup.old_id;
      DELETE FROM properties WHERE id = dup.old_id;
      total_merged := total_merged + 1;
    END LOOP;

    -- Step 2: Bulk rename remaining (non-conflicting) rows
    UPDATE properties
    SET city = new_city_val
    WHERE UPPER(TRIM(city)) = UPPER(TRIM(old_city_val))
      AND UPPER(TRIM(state)) = UPPER(TRIM(old_state_val));
    GET DIAGNOSTICS update_count = ROW_COUNT;
    total_updated := total_updated + update_count;
  END LOOP;

  RETURN jsonb_build_object('updated', total_updated, 'merged', total_merged);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_fulfillment_overview()
 RETURNS TABLE(total_fulfilled bigint, with_file bigint, file_upload_rate numeric, avg_quality numeric, format_csv bigint, format_pdf bigint, format_image bigint, format_mixed bigint, format_other bigint, avg_response_days numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, total_fees numeric, redacted_count bigint, avg_estimated_rows numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  FROM foia_requests
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_current_usage(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exports_count integer;
  v_api_calls_count integer;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
BEGIN
  -- Get actual subscription period
  SELECT current_period_start, current_period_end
  INTO v_period_start, v_period_end
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE);
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::timestamp with time zone;
  END IF;

  SELECT COALESCE(exports_count, 0), COALESCE(api_calls_count, 0)
  INTO v_exports_count, v_api_calls_count
  FROM subscription_usage
  WHERE user_id = p_user_id
    AND period_start = v_period_start::date;

  IF v_exports_count IS NULL THEN
    v_exports_count := 0;
    v_api_calls_count := 0;
  END IF;

  RETURN jsonb_build_object(
    'exports_count', v_exports_count,
    'api_calls_count', v_api_calls_count,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_list_properties(p_list_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_offset INT;
  v_total BIGINT;
  v_items JSON;
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_trial_status(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_is_trial boolean;
  v_days_remaining numeric;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'is_on_trial', false,
      'has_trial_expired', false,
      'has_active_subscription', false,
      'trial_days_remaining', 0,
      'trial_exports_used', 0,
      'trial_exports_remaining', 0,
      'trial_exports_limit', 500,
      'trial_tier', null,
      'trial_ends_at', null,
      'trial_started_at', null,
      'subscription_status', null,
      'can_export', false,
      'plan_id', null
    );
  END IF;

  SELECT * INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object(
      'is_on_trial', false,
      'has_trial_expired', false,
      'has_active_subscription', false,
      'trial_days_remaining', 0,
      'trial_exports_used', 0,
      'trial_exports_remaining', 0,
      'trial_exports_limit', 500,
      'trial_tier', null,
      'trial_ends_at', null,
      'trial_started_at', null,
      'subscription_status', null,
      'can_export', false,
      'plan_id', null
    );
  END IF;

  v_is_trial := v_sub.status IN ('trial', 'trialing');
  v_days_remaining := EXTRACT(EPOCH FROM (v_sub.trial_ends_at - now())) / 86400.0;

  RETURN jsonb_build_object(
    'is_on_trial', v_is_trial AND v_sub.trial_ends_at > now(),
    'has_trial_expired', v_is_trial AND v_sub.trial_ends_at <= now(),
    'has_active_subscription', v_sub.status IN ('active', 'past_due'),
    'trial_days_remaining', ROUND(v_days_remaining, 1),
    'trial_exports_used', COALESCE(v_sub.trial_exports_used, 0),
    'trial_exports_remaining', GREATEST(0, COALESCE(v_sub.trial_exports_limit, 500) - COALESCE(v_sub.trial_exports_used, 0)),
    'trial_exports_limit', COALESCE(v_sub.trial_exports_limit, 500),
    'trial_tier', v_sub.trial_tier,
    'trial_ends_at', v_sub.trial_ends_at,
    'trial_started_at', v_sub.trial_started_at,
    'subscription_status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'can_export', (v_is_trial AND v_sub.trial_ends_at > now() AND COALESCE(v_sub.trial_exports_used, 0) < COALESCE(v_sub.trial_exports_limit, 500)) OR v_sub.status IN ('active', 'past_due')
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_unlock_count(p_property_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::INTEGER FROM unlocked_properties WHERE property_id = p_property_id;
$function$
;

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

CREATE OR REPLACE FUNCTION public.fn_get_user_lists()
 RETURNS TABLE(id uuid, name text, created_at timestamp with time zone, property_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    ll.id,
    ll.name,
    ll.created_at,
    COUNT(lp.id) as property_count
  FROM lead_lists ll
  LEFT JOIN list_properties lp ON ll.id = lp.list_id
  WHERE ll.user_id = auth.uid()
  GROUP BY ll.id, ll.name, ll.created_at
  ORDER BY ll.created_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(subscription_id uuid, user_id uuid, plan_id uuid, plan_name text, display_name text, status text, current_period_start timestamp with time zone, current_period_end timestamp with time zone, max_monthly_exports integer, max_counties integer, max_user_seats integer, max_skip_traces_per_month integer, has_advanced_filters boolean, has_violation_filtering boolean, has_rolling_intelligence boolean, has_escalation_alerts boolean, has_api_access boolean, stripe_subscription_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id as subscription_id,
    s.user_id,
    s.plan_id,
    p.name as plan_name,
    p.display_name,
    s.status,
    s.current_period_start,
    s.current_period_end,
    p.max_monthly_exports,
    p.max_counties,
    p.max_user_seats,
    p.max_skip_traces_per_month,
    p.has_advanced_filters,
    p.has_violation_filtering,
    p.has_rolling_intelligence,
    p.has_escalation_alerts,
    p.has_api_access,
    s.stripe_subscription_id
  FROM public.user_subscriptions s
  JOIN public.subscription_plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND p_user_id = auth.uid()
    AND s.status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY s.created_at DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_increment_trial_exports(p_user_id uuid, p_count integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_new_count integer;
BEGIN
  SELECT id, trial_exports_used, trial_exports_limit, trial_ends_at, status
  INTO v_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('trial', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_trial');
  END IF;

  IF v_sub.trial_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_expired');
  END IF;

  IF COALESCE(v_sub.trial_exports_used, 0) + p_count > COALESCE(v_sub.trial_exports_limit, 500) THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_exports_exhausted', 'used', COALESCE(v_sub.trial_exports_used, 0), 'limit', COALESCE(v_sub.trial_exports_limit, 500));
  END IF;

  v_new_count := COALESCE(v_sub.trial_exports_used, 0) + p_count;

  UPDATE user_subscriptions
  SET trial_exports_used = v_new_count, updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('success', true, 'used', v_new_count, 'remaining', COALESCE(v_sub.trial_exports_limit, 500) - v_new_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_increment_usage(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_start date;
  v_period_end date;
BEGIN
  IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT current_period_start::date, current_period_end::date
  INTO v_period_start, v_period_end
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  LIMIT 1;

  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  END IF;

  INSERT INTO subscription_usage (user_id, period_start, period_end)
  VALUES (p_user_id, v_period_start, v_period_end)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  IF p_usage_type = 'exports' THEN
    UPDATE subscription_usage
    SET exports_count = exports_count + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_usage_type = 'skip_traces' THEN
    UPDATE subscription_usage
    SET skip_traces_count = skip_traces_count + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_usage_type = 'api_calls' THEN
    UPDATE subscription_usage
    SET api_calls_count = api_calls_count + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSE
    RETURN false;
  END IF;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_job_status(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_contacts_count int;
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_jurisdiction_intelligence()
 RETURNS TABLE(target_id uuid, jurisdiction_name text, state text, county text, population integer, target_type text, portal_difficulty_score integer, total_requests bigint, fulfilled_count bigint, rejected_count bigint, needs_review_count bigint, no_portal_count bigint, fulfillment_rate numeric, rejection_rate numeric, avg_response_days numeric, avg_data_quality numeric, avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, redaction_pct numeric, hostility_score numeric, jis numeric, speed_tier text, rejection_tier text, fee_risk text, redaction_pattern text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  FROM scored
$function$
;

CREATE OR REPLACE FUNCTION public.fn_jurisdiction_stats()
 RETURNS TABLE(jurisdiction_id uuid, jurisdiction_name text, city text, state text, enforcement_profile jsonb, property_count bigint, avg_score numeric, distressed_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_new_violation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_severity text;
  v_priority text;
BEGIN
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map violation enforcement priority → distress severity
  -- Using a defensive lookup since enforcement_priority column may vary
  BEGIN
    v_priority := COALESCE(NEW.enforcement_priority, 'standard');
  EXCEPTION WHEN undefined_column THEN
    v_priority := 'standard';
  END;

  v_severity := CASE v_priority
    WHEN 'critical' THEN 'critical'
    WHEN 'high' THEN 'warning'
    ELSE 'info'
  END;

  INSERT INTO public.distress_events (
    property_id, event_type, severity, delta, source
  ) VALUES (
    NEW.property_id,
    'new_violation',
    v_severity,
    jsonb_build_object(
      'violation_id', NEW.id,
      'violation_type', NEW.violation_type,
      'priority', v_priority
    ),
    'violation_trigger'
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_snapscore_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delta integer;
  v_severity text;
BEGIN
  -- Only fire when snap_score actually changed and both values are present
  IF NEW.snap_score IS NULL OR OLD.snap_score IS NULL THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.snap_score - OLD.snap_score;

  -- Threshold: ≥15 in either direction
  IF abs(v_delta) < 15 THEN
    RETURN NEW;
  END IF;

  -- Severity based on magnitude + direction
  v_severity := CASE
    WHEN abs(v_delta) >= 30 THEN 'critical'
    WHEN abs(v_delta) >= 20 THEN 'warning'
    ELSE 'info'
  END;

  INSERT INTO public.distress_events (
    property_id, event_type, severity, delta, source
  ) VALUES (
    NEW.id,
    'snapscore_change',
    v_severity,
    jsonb_build_object(
      'before', OLD.snap_score,
      'after', NEW.snap_score,
      'delta', v_delta,
      'direction', CASE WHEN v_delta > 0 THEN 'up' ELSE 'down' END
    ),
    'snapscore_trigger'
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_map_markers(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_limit integer DEFAULT 50000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_data_tier text;
  v_items jsonb;
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_map_markers_by_category(p_category text, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_limit integer DEFAULT 10000)
 RETURNS TABLE(id uuid, latitude numeric, longitude numeric, snap_score integer, address text, city text, state text, enforcement_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_keywords text[];
  v_user_id uuid := auth.uid();
  v_data_tier text;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get data_tier from subscription
  SELECT sp.data_tier
  INTO v_data_tier
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;
  
  -- Default to basic if no subscription
  IF v_data_tier IS NULL THEN
    v_data_tier := 'basic';
  END IF;
  
  -- Map category to keywords
  v_keywords := CASE p_category
    WHEN 'exterior' THEN ARRAY['Exterior']
    WHEN 'structural' THEN ARRAY['Structural']
    WHEN 'safety' THEN ARRAY['Safety', 'Fire']
    WHEN 'zoning' THEN ARRAY['Zoning']
    WHEN 'maintenance' THEN ARRAY['Rubbish', 'Grass', 'Trash', 'Debris', 'Weed', 'Dumping', 'Waste', 'Snow']
    WHEN 'interior' THEN ARRAY['Interior', 'Plumbing', 'HVAC', 'Furnace', '305.3', '305.6', '605.3', '403.', '504.', '506.', '605.']
    WHEN 'vacancy' THEN ARRAY['Vacancy', 'Vacant']
    WHEN 'other' THEN ARRAY['Unknown', 'Other', 'Complaint']
    ELSE ARRAY[initcap(p_category)]
  END;
  
  IF v_data_tier = 'basic' THEN
    -- Basic tier: only code_violation
    RETURN QUERY
    SELECT 
      p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state, p.enforcement_type
    FROM properties p
    WHERE 
      p.latitude IS NOT NULL 
      AND p.longitude IS NOT NULL
      AND p.enforcement_type = 'code_violation'
      AND EXISTS (
        SELECT 1 FROM unnest(v_keywords) AS kw 
        WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
      )
      AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    ORDER BY p.snap_score DESC NULLS LAST
    LIMIT p_limit;
  ELSE
    -- Premium/Enterprise: all properties
    RETURN QUERY
    SELECT 
      p.id, p.latitude, p.longitude, p.snap_score, p.address, p.city, p.state, p.enforcement_type
    FROM properties p
    WHERE 
      p.latitude IS NOT NULL 
      AND p.longitude IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(v_keywords) AS kw 
        WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%'
      )
      AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    ORDER BY p.snap_score DESC NULLS LAST
    LIMIT p_limit;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_map_markers_in_bounds(p_min_lat numeric, p_max_lat numeric, p_min_lng numeric, p_max_lng numeric, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_last_seen_days integer DEFAULT NULL::integer, p_open_violations_only boolean DEFAULT false, p_multiple_violations_only boolean DEFAULT false, p_repeat_offender_only boolean DEFAULT false, p_limit integer DEFAULT 60000)
 RETURNS TABLE(id uuid, latitude numeric, longitude numeric, snap_score integer, address text, city text, state text, enforcement_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff_date timestamptz;
BEGIN
  IF p_last_seen_days IS NOT NULL AND p_last_seen_days > 0 THEN
    v_cutoff_date := NOW() - (p_last_seen_days || ' days')::interval;
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.latitude,
    p.longitude,
    p.snap_score,
    p.address,
    p.city,
    p.state,
    p.enforcement_type
  FROM properties p
  WHERE 
    p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.latitude >= p_min_lat
    AND p.latitude <= p_max_lat
    AND p.longitude >= p_min_lng
    AND p.longitude <= p_max_lng
    AND p.latitude != 0
    AND p.longitude != 0
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_category IS NULL OR p_category = ANY(p.violation_types))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    AND (p_search IS NULL OR p_search = '' OR
         p.address ILIKE '%' || p_search || '%' OR
         p.city ILIKE '%' || p_search || '%' OR
         p.state ILIKE '%' || p_search || '%' OR
         p.county ILIKE '%' || p_search || '%' OR
         p.zip ILIKE '%' || p_search || '%')
    AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
  ORDER BY p.snap_score DESC NULLS LAST
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_normalize_violation_type(raw_type text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  t TEXT;
BEGIN
  IF raw_type IS NULL OR TRIM(raw_type) = '' THEN
    RETURN 'Unknown';
  END IF;
  
  t := LOWER(TRIM(raw_type));
  
  -- ========== ALREADY CATEGORIZED ==========
  IF t IN ('exterior', 'safety', 'zoning', 'structural', 'vacancy', 'utility', 'fire') THEN
    RETURN INITCAP(t);
  END IF;

  -- ========== STRUCTURAL ==========
  IF t ~ '(structur|foundation|roof leak|roof damage|collapse|unsafe structure|condemned|load.?bearing|305\.[3-6]|304\.4|302\.7|accessory structure|deck|porch|balcony|stair|walking surface|304\.10|dangerous building|building code|imminent danger|major repair|foundation crack|interior housing)' THEN
    RETURN 'Structural';
  END IF;
  
  -- ========== FIRE ==========
  IF t ~ '(fire|burn|smoke|charred|flammable vegetation|704\.6|smoke alarm|fire alarm|fire damage|fire marshal|arson)' THEN
    RETURN 'Fire';
  END IF;
  
  -- ========== UTILITY ==========
  IF t ~ '(utilit|electric|plumbing|sewage|hvac|furnace|heating|water disconnect|water shutoff|no water|no electric|utility disconnect|605\.[0-9]|602\.|603\.|504\.|505\.|506\.|furnace report|energy|stormwater|lighting|stagnant water|watercourse|illicit discharge|spill|403\.2|bathroom|toilet|ventilation)' THEN
    RETURN 'Utility';
  END IF;

  -- ========== VACANCY ==========
  IF t ~ '(vacant|vacancy|boarded|unoccup|abandon|registration|condemnation|unfit|closing of vacant|109\.[0-9]|placarded)' THEN
    RETURN 'Vacancy';
  END IF;

  -- ========== SAFETY ==========
  IF t ~ '(safety|hazard|danger|unsafe|egress|handrail|guardrail|railing|luminaire|wiring|circuit|carbon monoxide|health|attractive nuisance|nuisance affecting|rodent|vermin|sanitar|animal carcass|dead.*dying|carcass)' THEN
    RETURN 'Safety';
  END IF;

  -- ========== ZONING ==========
  IF t ~ '(zoning|parking|setback|permit|unpermitted|variance|land use|occupancy|right of way|obstruction|illegal sign|signage|illegal construction|without permit|w/out permit|lafayette development code|construction work without|clear vision|parking setback|agricultural use|zoning.?land|code enforcement|home occupation|short term rental|municipal code|carts out)' THEN
    RETURN 'Zoning';
  END IF;

  -- ========== EXTERIOR ==========
  IF t ~ '(exterior|siding|paint|peeling|fascia|soffit|window|door|gutter|downspout|trim|corrosion|304\.[0-9]|protective treatment|weather tight|frame|screen|facade|ipmc 304|ipmc 308|cco |rubbish|garbage|accumulation|landscaping)' THEN
    RETURN 'Exterior';
  END IF;

  -- ========== MAINTENANCE (mapped to Exterior) ==========
  IF t ~ '(weed|grass|overgrown|vegetation|trash|debris|litter|junk|mowing|clean.?up|ce-cl|solid waste|excessive trash|trash.*right.*way|trash.*property|trash.*recycle|dumping|illegal dumping|tree removal|snow.*ice|property maintenance|property inspection|code compliance|inspection|ce inspection|nuisance|blight|maintenance standard|inoperable vehicle|vehicle|restricted vehicle|complaint|miscellaneous|environmental)' THEN
    RETURN 'Exterior';
  END IF;

  -- ========== 2-LETTER CODES ==========
  IF t IN ('hg') THEN RETURN 'Exterior'; END IF;
  IF t IN ('ha') THEN RETURN 'Safety'; END IF;
  IF t IN ('is') THEN RETURN 'Exterior'; END IF;
  IF t IN ('tr') THEN RETURN 'Exterior'; END IF;
  IF t IN ('e4', 'e1', 'e2') THEN RETURN 'Exterior'; END IF;
  IF t IN ('rr') THEN RETURN 'Structural'; END IF;
  IF t IN ('fm') THEN RETURN 'Exterior'; END IF;
  IF t IN ('gc') THEN RETURN 'Exterior'; END IF;
  IF t IN ('an') THEN RETURN 'Safety'; END IF;
  IF t IN ('bi') THEN RETURN 'Structural'; END IF;
  IF t IN ('ls') THEN RETURN 'Zoning'; END IF;
  IF t IN ('mo') THEN RETURN 'Exterior'; END IF;
  IF t IN ('ot') THEN RETURN 'Exterior'; END IF;
  IF t IN ('iv') THEN RETURN 'Zoning'; END IF;
  IF t IN ('jv') THEN RETURN 'Zoning'; END IF;
  IF t IN ('sc') THEN RETURN 'Safety'; END IF;
  IF t IN ('1a', '1c', '1d') THEN RETURN 'Exterior'; END IF;
  
  -- ========== COMBO CODES ==========
  IF t ~ '^(e[0-9]+ ?)+$' THEN RETURN 'Exterior'; END IF;
  IF t ~ '^([a-z]{2} )+[a-z]{2}$' THEN RETURN 'Exterior'; END IF;
  IF t ~ 'hg|tr|fm|gc|mo' THEN RETURN 'Exterior'; END IF;
  IF t ~ 'ha|an' THEN RETURN 'Safety'; END IF;

  -- ========== IPMC CODES ==========
  IF t ~ '^ipmc 30[2-4]' THEN RETURN 'Exterior'; END IF;
  IF t ~ '^ipmc 305' THEN RETURN 'Structural'; END IF;
  IF t ~ '^ipmc [4-6]' THEN RETURN 'Utility'; END IF;
  IF t ~ '^ipmc 7' THEN RETURN 'Fire'; END IF;
  IF t ~ '^cco ' THEN RETURN 'Exterior'; END IF;

  -- ========== CATCH-ALL ==========
  RETURN 'Unknown';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_normalize_violation_types_batch(p_batch_size integer DEFAULT 5000)
 RETURNS TABLE(processed integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  -- Find properties that have un-normalized violation_types
  -- (contain values not in our standard set)
  WITH properties_to_fix AS (
    SELECT p.id
    FROM properties p
    WHERE p.violation_types IS NOT NULL 
      AND array_length(p.violation_types, 1) > 0
      AND EXISTS (
        SELECT 1 FROM unnest(p.violation_types) vt
        WHERE vt NOT IN ('Exterior', 'Safety', 'Zoning', 'Structural', 'Vacancy', 'Utility', 'Fire', 'Unknown')
      )
    LIMIT p_batch_size
  ),
  normalized AS (
    SELECT 
      ptf.id,
      ARRAY(
        SELECT DISTINCT fn_normalize_violation_type(vt)
        FROM unnest(
          (SELECT violation_types FROM properties WHERE id = ptf.id)
        ) AS vt
        WHERE fn_normalize_violation_type(vt) != 'Unknown'
      ) AS new_types
    FROM properties_to_fix ptf
  )
  UPDATE properties p
  SET 
    violation_types = CASE 
      WHEN array_length(n.new_types, 1) > 0 THEN n.new_types
      ELSE ARRAY['Unknown']::TEXT[]
    END,
    updated_at = NOW()
  FROM normalized n
  WHERE p.id = n.id;
  
  GET DIAGNOSTICS v_processed = ROW_COUNT;
  
  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM properties p
  WHERE p.violation_types IS NOT NULL 
    AND array_length(p.violation_types, 1) > 0
    AND EXISTS (
      SELECT 1 FROM unnest(p.violation_types) vt
      WHERE vt NOT IN ('Exterior', 'Safety', 'Zoning', 'Structural', 'Vacancy', 'Utility', 'Fire', 'Unknown')
    );
  
  RETURN QUERY SELECT v_processed, v_remaining;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_opportunity_funnel()
 RETURNS TABLE(opportunity_class text, property_count bigint, avg_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_properties_by_bbox(p_west numeric, p_south numeric, p_east numeric, p_north numeric, p_score_gte integer DEFAULT NULL::integer, p_last_seen_lte integer DEFAULT NULL::integer, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT 
      id, address, city, state, zip, 
      latitude, longitude,
      snap_score, snap_insight, 
      updated_at, photo_url
    FROM properties
    WHERE geom && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
      AND (p_score_gte IS NULL OR snap_score >= p_score_gte)
      AND (
        p_last_seen_lte IS NULL
        OR (CURRENT_DATE - COALESCE(updated_at::date, updated_at::date)) <= p_last_seen_lte
      )
    ORDER BY snap_score DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'items', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) 
      FROM (
        SELECT * FROM filtered 
        OFFSET p_offset 
        LIMIT p_limit
      ) t
    ),
    'total', (SELECT count(*) FROM filtered),
    'bbox', jsonb_build_array(p_west, p_south, p_east, p_north)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_properties_by_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_states integer;
  v_allowed_states text[];
  v_items jsonb;
  v_has_state_filter boolean := false;
  v_has_subscription boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'error', 'Authentication required'
    );
  END IF;

  -- Get state limit from subscription
  SELECT sp.max_states
  INTO v_max_states
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  v_has_subscription := (v_max_states IS NOT NULL);

  -- For limited plans, get user's allowed states
  IF v_has_subscription AND v_max_states > 0 THEN
    SELECT ARRAY_AGG(UPPER(state))
    INTO v_allowed_states
    FROM user_allowed_states
    WHERE user_id = v_user_id;
    
    v_has_state_filter := (v_allowed_states IS NOT NULL AND array_length(v_allowed_states, 1) > 0);
  END IF;

  -- Show all if no subscription, enterprise, or no states selected
  IF NOT v_has_subscription OR v_max_states = 0 OR NOT v_has_state_filter THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id,
        p.address,
        p.city,
        p.state,
        p.zip,
        p.snap_score,
        p.latitude,
        p.longitude,
        p.total_violations,
        p.distress_signals,
        p.opportunity_class
      FROM properties p
      WHERE p.latitude IS NOT NULL 
        AND p.longitude IS NOT NULL
        AND p.latitude BETWEEN p_min_lat AND p_max_lat
        AND p.longitude BETWEEN p_min_lng AND p_max_lng
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) props;
  ELSE
    -- Limited: filter by allowed states (case-insensitive)
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id,
        p.address,
        p.city,
        p.state,
        p.zip,
        p.snap_score,
        p.latitude,
        p.longitude,
        p.total_violations,
        p.distress_signals,
        p.opportunity_class
      FROM properties p
      WHERE p.latitude IS NOT NULL 
        AND p.longitude IS NOT NULL
        AND p.latitude BETWEEN p_min_lat AND p_max_lat
        AND p.longitude BETWEEN p_min_lng AND p_max_lng
        AND UPPER(p.state) = ANY(v_allowed_states)
      ORDER BY p.snap_score DESC NULLS LAST
      LIMIT p_limit
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'allowed_states', COALESCE(v_allowed_states, ARRAY[]::text[]),
    'has_state_filter', v_has_state_filter
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_properties_by_bbox(p_min_lng numeric, p_min_lat numeric, p_max_lng numeric, p_max_lat numeric, p_score_min integer DEFAULT NULL::integer, p_last_seen_after date DEFAULT NULL::date, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_counties integer;
  v_allowed_counties text[];
  v_total bigint;
  v_items jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'error', 'Authentication required'
    );
  END IF;

  -- Get county limit from subscription
  SELECT sp.max_counties
  INTO v_max_counties
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- Default to starter plan limit
  IF v_max_counties IS NULL THEN
    SELECT max_counties INTO v_max_counties
    FROM subscription_plans WHERE name = 'starter' LIMIT 1;
    IF v_max_counties IS NULL THEN v_max_counties := 5; END IF;
  END IF;

  -- Get allowed counties for limited plans
  IF v_max_counties > 0 THEN
    SELECT ARRAY_AGG(DISTINCT c.county_name || '|' || c.state)
    INTO v_allowed_counties
    FROM (
      SELECT county_name, state FROM counties
      WHERE assigned_to IS NOT NULL
      ORDER BY last_upload_date DESC NULLS LAST, created_at
      LIMIT v_max_counties
    ) c;
    
    IF v_allowed_counties IS NULL OR array_length(v_allowed_counties, 1) IS NULL THEN
      SELECT ARRAY_AGG(DISTINCT p.county || '|' || p.state)
      INTO v_allowed_counties
      FROM (
        SELECT DISTINCT county, state FROM properties
        WHERE county IS NOT NULL
        ORDER BY county, state LIMIT v_max_counties
      ) p;
    END IF;
  END IF;

  -- Query with county filtering
  IF v_max_counties = -1 THEN
    SELECT COUNT(*), jsonb_agg(row_to_json(props)::jsonb)
    INTO v_total, v_items
    FROM (
      SELECT id, address, city, state, zip, county, snap_score, latitude, longitude,
             total_violations, open_violations, violation_types, distress_signals,
             opportunity_class, repeat_offender, escalated
      FROM properties
      WHERE latitude BETWEEN p_min_lat AND p_max_lat
        AND longitude BETWEEN p_min_lng AND p_max_lng
        AND (p_score_min IS NULL OR snap_score >= p_score_min)
        AND (p_last_seen_after IS NULL OR newest_violation_date >= p_last_seen_after)
      ORDER BY snap_score DESC NULLS LAST
      LIMIT 2000
    ) props;
  ELSE
    SELECT COUNT(*), jsonb_agg(row_to_json(props)::jsonb)
    INTO v_total, v_items
    FROM (
      SELECT id, address, city, state, zip, county, snap_score, latitude, longitude,
             total_violations, open_violations, violation_types, distress_signals,
             opportunity_class, repeat_offender, escalated
      FROM properties
      WHERE latitude BETWEEN p_min_lat AND p_max_lat
        AND longitude BETWEEN p_min_lng AND p_max_lng
        AND (p_score_min IS NULL OR snap_score >= p_score_min)
        AND (p_last_seen_after IS NULL OR newest_violation_date >= p_last_seen_after)
        AND (
          v_allowed_counties IS NULL 
          OR array_length(v_allowed_counties, 1) IS NULL
          OR (county || '|' || state) = ANY(v_allowed_counties)
        )
      ORDER BY snap_score DESC NULLS LAST
      LIMIT 2000
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'bbox', jsonb_build_object(
      'min_lng', p_min_lng, 'min_lat', p_min_lat,
      'max_lng', p_max_lng, 'max_lat', p_max_lat
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_properties_by_category(p_category text, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_last_seen_days integer DEFAULT NULL::integer, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_sort_by text DEFAULT 'recently_updated'::text, p_open_violations_only boolean DEFAULT false, p_multiple_violations_only boolean DEFAULT false, p_repeat_offender_only boolean DEFAULT false, p_random_seed text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_keywords text[];
  v_offset int;
  v_items jsonb;
  v_total bigint;
  v_is_water boolean := (p_category = 'water_disconnection');
  v_seed text;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_seed := COALESCE(p_random_seed, COALESCE(auth.uid()::text, 'default'));
  
  IF NOT v_is_water THEN
    v_keywords := CASE p_category
      WHEN 'exterior' THEN ARRAY['Exterior']
      WHEN 'structural' THEN ARRAY['Structural']
      WHEN 'safety' THEN ARRAY['Safety', 'Fire']
      WHEN 'zoning' THEN ARRAY['Zoning']
      WHEN 'maintenance' THEN ARRAY['Rubbish', 'Grass', 'Trash', 'Debris', 'Weed', 'Dumping', 'Waste', 'Snow']
      WHEN 'interior' THEN ARRAY['Interior', 'Plumbing', 'HVAC', 'Furnace', '305.3', '305.6', '605.3', '403.', '504.', '506.', '605.']
      WHEN 'vacancy' THEN ARRAY['Vacancy', 'Vacant']
      WHEN 'other' THEN ARRAY['Unknown', 'Other', 'Complaint']
      ELSE ARRAY[initcap(p_category)]
    END;
  END IF;
  
  SELECT COUNT(*) INTO v_total
  FROM properties p
  WHERE 
    CASE WHEN v_is_water THEN p.enforcement_type = 'water_shutoff'
    ELSE EXISTS (SELECT 1 FROM unnest(v_keywords) kw WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%')
    END
    AND (p_state IS NULL OR p.state ILIKE p_state)
    AND (p_city IS NULL OR p.city ILIKE p_city)
    AND (p_search IS NULL OR (p.address ILIKE '%'||p_search||'%' OR p.city ILIKE '%'||p_search||'%' OR p.state ILIKE '%'||p_search||'%' OR p.zip ILIKE '%'||p_search||'%'))
    AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
    AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
    AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
    AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
    AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
    AND (NOT p_repeat_offender_only OR p.repeat_offender = true);
  
  SELECT jsonb_agg(row_to_json(t))
  INTO v_items
  FROM (
    SELECT 
      p.id, p.address, p.city, p.state, p.zip, p.county,
      p.snap_score, p.snap_insight, p.latitude, p.longitude,
      p.total_violations, p.open_violations, p.repeat_offender,
      p.oldest_violation_date, p.newest_violation_date,
      p.avg_days_open, p.opportunity_class, p.enforcement_type,
      p.violation_types, p.distress_signals,
      p.updated_at, p.created_at
    FROM properties p
    WHERE 
      CASE WHEN v_is_water THEN p.enforcement_type = 'water_shutoff'
      ELSE EXISTS (SELECT 1 FROM unnest(v_keywords) kw WHERE array_to_string(p.violation_types, ' ') ILIKE '%' || kw || '%')
      END
      AND (p_state IS NULL OR p.state ILIKE p_state)
      AND (p_city IS NULL OR p.city ILIKE p_city)
      AND (p_search IS NULL OR (p.address ILIKE '%'||p_search||'%' OR p.city ILIKE '%'||p_search||'%' OR p.state ILIKE '%'||p_search||'%' OR p.zip ILIKE '%'||p_search||'%'))
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (p_last_seen_days IS NULL OR p.updated_at >= NOW() - (p_last_seen_days || ' days')::interval)
      AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
      AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
      AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
    ORDER BY 
      CASE WHEN p_sort_by = 'recently_updated' OR p_sort_by IS NULL THEN p.newest_violation_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'snap_score' THEN p.snap_score END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'newest_violation' THEN p.newest_violation_date END DESC NULLS LAST,
      md5(p.id::text || v_seed),
      p.id
    LIMIT p_page_size
    OFFSET v_offset
  ) t;
  
  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_properties_paged(p_page integer, p_page_size integer, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_last_seen_days integer DEFAULT NULL::integer, p_sort_by text DEFAULT 'snap_score'::text, p_open_violations_only boolean DEFAULT false, p_multiple_violations_only boolean DEFAULT false, p_repeat_offender_only boolean DEFAULT false, p_random_seed text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_offset integer;
  v_items jsonb;
  v_total bigint;
  v_data_tier text := 'full';
  v_cutoff_date timestamptz;
  v_has_filters boolean;
  v_seed text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', p_page,
      'page_size', p_page_size,
      'has_subscription', false,
      'data_tier', null,
      'error', 'Authentication required'
    );
  END IF;

  v_seed := COALESCE(p_random_seed, v_user_id::text);
  v_offset := (p_page - 1) * p_page_size;
  
  IF p_last_seen_days IS NOT NULL THEN
    v_cutoff_date := NOW() - (p_last_seen_days || ' days')::interval;
  END IF;
  
  v_has_filters := (p_state IS NOT NULL) OR (p_city IS NOT NULL) OR 
                   (p_search IS NOT NULL) OR (p_snap_min IS NOT NULL) OR 
                   (p_snap_max IS NOT NULL) OR (p_last_seen_days IS NOT NULL) OR
                   p_open_violations_only OR p_multiple_violations_only OR p_repeat_offender_only;

  IF NOT v_has_filters THEN
    SELECT reltuples::bigint INTO v_total
    FROM pg_class WHERE relname = 'properties';
    IF v_total IS NULL OR v_total < 0 THEN
      v_total := 0;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_total
    FROM properties p
    WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
      AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
      AND (p_search IS NULL OR 
           p.address ILIKE '%' || p_search || '%' OR
           p.city ILIKE '%' || p_search || '%' OR
           p.state ILIKE '%' || p_search || '%' OR
           p.county ILIKE '%' || p_search || '%' OR
           p.zip ILIKE '%' || p_search || '%')
      AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
      AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
      AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
      AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
      AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
      AND (NOT p_repeat_offender_only OR p.repeat_offender = true);
  END IF;

  IF p_sort_by = 'snap_score' THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
        p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
        p.repeat_offender, p.multi_department, p.escalated,
        p.opportunity_class, p.enforcement_type, p.violation_types,
        p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
      FROM properties p
      WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
        AND (p_search IS NULL OR 
             p.address ILIKE '%' || p_search || '%' OR
             p.city ILIKE '%' || p_search || '%' OR
             p.state ILIKE '%' || p_search || '%' OR
             p.county ILIKE '%' || p_search || '%' OR
             p.zip ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
        AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.snap_score DESC NULLS LAST, p.total_violations DESC NULLS LAST, md5(p.id::text || v_seed)
      LIMIT p_page_size OFFSET v_offset
    ) props;

  ELSIF p_sort_by = 'newest_violation' THEN
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
        p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
        p.repeat_offender, p.multi_department, p.escalated,
        p.opportunity_class, p.enforcement_type, p.violation_types,
        p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
      FROM properties p
      WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
        AND (p_search IS NULL OR 
             p.address ILIKE '%' || p_search || '%' OR
             p.city ILIKE '%' || p_search || '%' OR
             p.state ILIKE '%' || p_search || '%' OR
             p.county ILIKE '%' || p_search || '%' OR
             p.zip ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
        AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.newest_violation_date DESC NULLS LAST, md5(p.id::text || v_seed)
      LIMIT p_page_size OFFSET v_offset
    ) props;

  ELSE
    SELECT jsonb_agg(row_to_json(props)::jsonb)
    INTO v_items
    FROM (
      SELECT 
        p.id, p.address, p.city, p.state, p.zip, p.county,
        p.snap_score, p.snap_insight, p.total_violations, p.open_violations,
        p.oldest_violation_date, p.newest_violation_date, p.avg_days_open,
        p.repeat_offender, p.multi_department, p.escalated,
        p.opportunity_class, p.enforcement_type, p.violation_types,
        p.distress_signals, p.latitude, p.longitude, p.updated_at, p.created_at
      FROM properties p
      WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
        AND (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
        AND (p_search IS NULL OR 
             p.address ILIKE '%' || p_search || '%' OR
             p.city ILIKE '%' || p_search || '%' OR
             p.state ILIKE '%' || p_search || '%' OR
             p.county ILIKE '%' || p_search || '%' OR
             p.zip ILIKE '%' || p_search || '%')
        AND (p_snap_min IS NULL OR p.snap_score >= p_snap_min)
        AND (p_snap_max IS NULL OR p.snap_score <= p_snap_max)
        AND (v_cutoff_date IS NULL OR p.updated_at >= v_cutoff_date)
        AND (NOT p_open_violations_only OR COALESCE(p.open_violations, 0) > 0)
        AND (NOT p_multiple_violations_only OR COALESCE(p.total_violations, 0) > 1)
        AND (NOT p_repeat_offender_only OR p.repeat_offender = true)
      ORDER BY p.updated_at DESC NULLS LAST, md5(p.id::text || v_seed)
      LIMIT p_page_size OFFSET v_offset
    ) props;
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'has_subscription', true,
    'data_tier', v_data_tier
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_properties_untraced_in_list(p_list_id uuid, p_limit integer DEFAULT 5000)
 RETURNS TABLE(property_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lp.property_id
  FROM public.list_properties lp
  LEFT JOIN public.property_contacts pc ON pc.property_id = lp.property_id
  WHERE lp.list_id = p_list_id
  GROUP BY lp.property_id
  HAVING COUNT(pc.property_id) = 0
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_record_view(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_reset_at TIMESTAMPTZ;
  v_limit INTEGER := 10;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT daily_view_count, daily_view_reset_at
  INTO v_count, v_reset_at
  FROM profiles WHERE user_id = p_user_id;

  -- Lazy daily reset: if last reset was before today, reset counter
  IF v_reset_at < date_trunc('day', now()) THEN
    UPDATE profiles
    SET daily_view_count = 1, daily_view_reset_at = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('view_count', 1, 'limit', v_limit, 'limit_reached', false);
  END IF;

  -- Increment
  UPDATE profiles
  SET daily_view_count = daily_view_count + 1
  WHERE user_id = p_user_id;

  v_count := COALESCE(v_count, 0) + 1;

  RETURN jsonb_build_object(
    'view_count', v_count,
    'limit', v_limit,
    'limit_reached', v_count >= v_limit
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_refund_credits(p_property_ids uuid[], p_job_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_qty int := 0;
  v_balance int;
BEGIN
  -- Insert refund credits with conflict protection (prevents double refunds)
  INSERT INTO credit_ledger (user_id, delta, reason, meta)
  SELECT 
    v_user_id,
    1,
    p_reason,
    jsonb_build_object('job_id', p_job_id, 'property_id', pid)
  FROM unnest(p_property_ids) AS pid
  ON CONFLICT (user_id, job_id_extracted, property_id_extracted, reason) 
  WHERE job_id_extracted IS NOT NULL AND property_id_extracted IS NOT NULL
  DO NOTHING;
  
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  
  SELECT balance INTO v_balance FROM v_user_credits WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object(
    'refunded', v_qty,
    'new_balance', v_balance
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_start_trial(p_user_id uuid, p_trial_tier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id uuid;
  v_existing record;
BEGIN
  -- Security: only the authenticated user can start their own trial
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Check for existing subscription
  SELECT id, status INTO v_existing
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trial', 'trialing', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already has active subscription or trial');
  END IF;

  -- Find plan by tier name
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_trial_tier
  LIMIT 1;

  -- Default to starter if not found
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = 'starter'
    LIMIT 1;
  END IF;

  -- Create trial subscription
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    trial_tier,
    trial_exports_used,
    trial_exports_limit,
    current_period_start,
    current_period_end
  ) VALUES (
    p_user_id,
    v_plan_id,
    'trial',
    now(),
    now() + interval '3 days',
    p_trial_tier,
    0,
    500,
    now(),
    now() + interval '3 days'
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', (SELECT id FROM user_subscriptions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1),
    'trial_ends_at', (now() + interval '3 days')::text,
    'trial_tier', p_trial_tier
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_state_response_analytics()
 RETURNS TABLE(state text, total_requests bigint, fulfilled_count bigint, avg_response_days numeric, fulfillment_rate numeric, rejection_rate numeric, avg_data_quality numeric, avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, redaction_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ORDER BY COUNT(r.id) DESC
$function$
;

CREATE OR REPLACE FUNCTION public.fn_unlock_property(p_user_id uuid, p_property_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_already_unlocked BOOLEAN;
  v_free_remaining INTEGER;
  v_credit_balance INTEGER;
  v_plan_max INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_new_exports INTEGER;
  v_auth_uid UUID;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL AND p_user_id <> v_auth_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM unlocked_properties
    WHERE user_id = p_user_id AND property_id = p_property_id
  ) INTO v_already_unlocked;

  IF v_already_unlocked THEN
    RETURN jsonb_build_object(
      'success', true,
      'source', 'already_unlocked',
      'message', 'Property already unlocked'
    );
  END IF;

  SELECT sp.max_monthly_exports, us.current_period_start::date, us.current_period_end::date
  INTO v_plan_max, v_period_start, v_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing', 'trial', 'past_due')
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF v_plan_max IS NOT NULL THEN
    IF v_period_start IS NULL THEN
      v_period_start := date_trunc('month', CURRENT_DATE)::date;
      v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    END IF;

    INSERT INTO subscription_usage (user_id, period_start, period_end)
    VALUES (p_user_id, v_period_start, v_period_end)
    ON CONFLICT (user_id, period_start) DO NOTHING;

    UPDATE subscription_usage
    SET exports_count = exports_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id
      AND period_start = v_period_start
      AND (v_plan_max = -1 OR exports_count + 1 <= v_plan_max)
    RETURNING exports_count INTO v_new_exports;

    IF v_new_exports IS NOT NULL THEN
      INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
      VALUES (p_user_id, p_property_id, 0, 'subscription');

      RETURN jsonb_build_object(
        'success', true,
        'source', 'subscription_allowance',
        'subscription_remaining', CASE
          WHEN v_plan_max = -1 THEN NULL
          ELSE v_plan_max - v_new_exports
        END,
        'credits_remaining', COALESCE((SELECT balance FROM v_user_credits WHERE user_id = p_user_id), 0),
        'free_remaining', COALESCE((SELECT free_unlocks_remaining FROM profiles WHERE user_id = p_user_id), 0)
      );
    END IF;
  END IF;

  SELECT free_unlocks_remaining INTO v_free_remaining
  FROM profiles WHERE user_id = p_user_id;

  IF v_free_remaining IS NOT NULL AND v_free_remaining > 0 THEN
    UPDATE profiles
    SET free_unlocks_remaining = free_unlocks_remaining - 1
    WHERE user_id = p_user_id;

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 0, 'free_credit');

    RETURN jsonb_build_object(
      'success', true,
      'source', 'free_credit',
      'free_remaining', v_free_remaining - 1,
      'credits_remaining', COALESCE((SELECT balance FROM v_user_credits WHERE user_id = p_user_id), 0)
    );
  END IF;

  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM v_user_credits WHERE user_id = p_user_id;

  IF v_credit_balance >= 1 THEN
    INSERT INTO credit_ledger (user_id, delta, reason, meta)
    VALUES (p_user_id, -1, 'property_unlock', jsonb_build_object('property_id', p_property_id));

    INSERT INTO unlocked_properties (user_id, property_id, credit_cost, unlock_source)
    VALUES (p_user_id, p_property_id, 1, 'credit_pack');

    RETURN jsonb_build_object(
      'success', true,
      'source', 'credit_pack',
      'credits_remaining', v_credit_balance - 1,
      'free_remaining', COALESCE((SELECT free_unlocks_remaining FROM profiles WHERE user_id = p_user_id), 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'insufficient_balance',
    'free_remaining', COALESCE(v_free_remaining, 0),
    'credits', COALESCE(v_credit_balance, 0),
    'subscription_remaining', COALESCE(
      (
        SELECT CASE
          WHEN sp.max_monthly_exports = -1 THEN NULL::integer
          ELSE GREATEST(0, sp.max_monthly_exports - COALESCE(su.exports_count, 0))
        END
        FROM user_subscriptions us
        JOIN subscription_plans sp ON sp.id = us.plan_id
        LEFT JOIN subscription_usage su
          ON su.user_id = us.user_id AND su.period_start = us.current_period_start::date
        WHERE us.user_id = p_user_id
          AND us.status IN ('active', 'trialing', 'trial', 'past_due')
        ORDER BY us.created_at DESC
        LIMIT 1
      ),
      0
    ),
    'message', 'Insufficient balance. Purchase credits or buy a single unlock to continue.'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_user_states(p_states text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_max_states integer;
  v_state_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  
  -- Get user's state limit from subscription
  SELECT sp.max_states
  INTO v_max_states
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_user_id
    AND us.status = 'active'
  LIMIT 1;
  
  -- Default to starter limit
  IF v_max_states IS NULL THEN
    v_max_states := 5;
  END IF;
  
  -- 0 means unlimited (enterprise)
  IF v_max_states > 0 THEN
    v_state_count := COALESCE(array_length(p_states, 1), 0);
    
    IF v_state_count > v_max_states THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Your plan allows %s states. You selected %s.', v_max_states, v_state_count)
      );
    END IF;
  END IF;
  
  -- Delete existing states
  DELETE FROM user_allowed_states WHERE user_id = v_user_id;
  
  -- Insert new states
  IF p_states IS NOT NULL AND array_length(p_states, 1) > 0 THEN
    INSERT INTO user_allowed_states (user_id, state)
    SELECT v_user_id, unnest(p_states);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'states', p_states);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_user_needs_state_selection()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_state_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT COUNT(*)
  INTO v_state_count
  FROM user_allowed_states
  WHERE user_id = v_user_id;
  
  RETURN v_state_count = 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_violation_counts_by_area(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS TABLE(violation_type text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_zip_pressure(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS TABLE(zip text, avg_score numeric, property_count bigint, avg_lat numeric, avg_lng numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_enforcement_insight(p_total_violations integer, p_open_violations integer, p_avg_days_open integer, p_violation_types text[], p_distress_signals text[], p_repeat_offender boolean, p_multi_department boolean, p_escalated boolean)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  parts TEXT[] := ARRAY[]::TEXT[];
  result TEXT;
  max_days INTEGER;
BEGIN
  max_days := COALESCE(p_avg_days_open, 0);
  
  -- Block A - Enforcement Scope
  IF array_length(p_violation_types, 1) >= 2 THEN
    parts := array_append(parts, 'Property is subject to enforcement actions across multiple municipal categories.');
  ELSIF COALESCE(p_total_violations, 0) >= 2 THEN
    parts := array_append(parts, 'Multiple code violations documented at this address.');
  END IF;
  
  -- Block B - Duration
  IF max_days >= 180 OR 'extended_enforcement' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Several violations have remained open for an extended period exceeding 180 days.');
  ELSIF max_days >= 90 THEN
    parts := array_append(parts, 'Open enforcement matters have persisted beyond the standard 90-day resolution period.');
  ELSIF max_days >= 60 THEN
    parts := array_append(parts, 'Active citations remain unresolved past 60 days.');
  END IF;
  
  -- Block C - Recent Activity
  IF 'recent_activity' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Recent inspection activity indicates continued municipal oversight.');
  ELSIF 'current_enforcement' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Enforcement records updated within the past 30 days.');
  END IF;
  
  -- Block D - Priority Enforcement
  IF 'utility_enforcement' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Records include utility service enforcement notices.');
  END IF;
  
  IF 'fire_citation' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Fire marshal orders or fire safety citations on file.');
  END IF;
  
  IF 'structural_citation' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Structural integrity citations documented in inspection records.');
  END IF;
  
  -- Block E - Category Specific
  IF 'vacancy_citation' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Vacancy or property abandonment citations on file.');
  END IF;
  
  -- Block F - Escalation
  IF p_escalated OR 'enforcement_escalation' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Case has been referred for legal enforcement action.');
  END IF;
  
  -- Block G - Pattern
  IF p_repeat_offender OR 'recurring_enforcement' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Property shows recurring enforcement activity pattern.');
  END IF;
  
  IF p_multi_department OR 'coordinated_enforcement' = ANY(p_distress_signals) OR 'multi_department' = ANY(p_distress_signals) THEN
    parts := array_append(parts, 'Cross-departmental enforcement coordination documented.');
  END IF;
  
  -- Fallback
  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) = 0 THEN
    IF COALESCE(p_open_violations, 0) > 0 THEN
      parts := array_append(parts, p_open_violations || ' open municipal citation' || CASE WHEN p_open_violations > 1 THEN 's' ELSE '' END || ' pending resolution.');
    ELSIF COALESCE(p_total_violations, 0) > 0 THEN
      parts := array_append(parts, p_total_violations || ' municipal citation' || CASE WHEN p_total_violations > 1 THEN 's' ELSE '' END || ' on record.');
    ELSE
      parts := array_append(parts, 'Routine maintenance citations documented.');
    END IF;
  END IF;
  
  -- Join first 3 blocks
  result := array_to_string(parts[1:3], ' ');
  
  -- Truncate if too long
  IF length(result) > 280 THEN
    result := array_to_string(parts[1:2], ' ');
    IF length(result) > 280 THEN
      result := left(parts[1], 277) || '...';
    END IF;
  END IF;
  
  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_duplicate_property_groups(batch_limit integer DEFAULT 200)
 RETURNS TABLE(winner_id uuid, loser_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT id, address, city, state,
      ROW_NUMBER() OVER (
        PARTITION BY address, city, state 
        ORDER BY COALESCE(snap_score,0) DESC, COALESCE(open_violations,0) DESC, created_at ASC
      ) AS rn
    FROM properties
    WHERE (address, city, state) IN (
      SELECT address, city, state FROM properties GROUP BY address, city, state HAVING count(*) > 1
    )
  ),
  groups AS (
    SELECT 
      (SELECT r2.id FROM ranked r2 WHERE r2.address = r.address AND r2.city = r.city AND r2.state = r.state AND r2.rn = 1) as winner_id,
      array_agg(r.id) as loser_ids,
      r.address, r.city, r.state
    FROM ranked r
    WHERE r.rn > 1
    GROUP BY r.address, r.city, r.state
  )
  SELECT g.winner_id, g.loser_ids
  FROM groups g
  LIMIT batch_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.get_error_logs_recent()
 RETURNS SETOF error_logs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM error_logs
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 100;
$function$
;

CREATE OR REPLACE FUNCTION public.get_integration_secret(p_integration_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_secret_id uuid;
  v_plain text;
begin
  select vault_secret_id into v_secret_id
  from public.user_integrations
  where id = p_integration_id;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_plain
  from vault.decrypted_secrets
  where id = v_secret_id;

  return v_plain;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_system_logs_24h()
 RETURNS SETOF system_logs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM system_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
    AND has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 500;
$function$
;

CREATE OR REPLACE FUNCTION public.get_webhook_errors_recent()
 RETURNS SETOF webhook_errors
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM webhook_errors
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 100;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_org_pipeline_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (user_id, org_id, email, full_name)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NEW.email,
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_foia_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.foia_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_foia_va()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM foia_profiles
    WHERE id = auth.uid() AND role = 'va' AND is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.list_recent_violation_events_v1(p_state text, p_city text DEFAULT NULL::text, p_county text DEFAULT NULL::text, p_days_back integer DEFAULT 30, p_limit integer DEFAULT 25)
 RETURNS TABLE(property_id uuid, address text, city text, state text, zip text, violation_count_recent bigint, most_recent_violation_date date, snapscore integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id as property_id,
    p.address,
    p.city,
    p.state,
    p.zip,
    count(v.id) filter (
      where v.opened_date >= (current_date - (p_days_back || ' days')::interval)
    ) as violation_count_recent,
    max(v.opened_date) filter (
      where v.opened_date >= (current_date - (p_days_back || ' days')::interval)
    ) as most_recent_violation_date,
    p.snap_score as snapscore
  from public.properties p
  join public.violations v on v.property_id = p.id
  where p.state = p_state
    and (p_city is null or p.city = p_city)
    and (p_county is null or p.county = p_county)
    and v.opened_date >= (current_date - (p_days_back || ' days')::interval)
    and p.snap_score is not null
  group by p.id, p.address, p.city, p.state, p.zip, p.snap_score
  having count(v.id) > 0
  order by p.snap_score desc nulls last, max(v.opened_date) desc
  limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.log_lead_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO public.lead_activities (lead_id, org_id, actor_id, activity_type, payload)
    VALUES (
      NEW.id,
      NEW.org_id,
      auth.uid(),
      'stage_change',
      jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id)
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_saved_property_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_alerts (user_id, property_id, alert_type, title, body)
  SELECT
    sp.user_id,
    NEW.property_id,
    'new_violation',
    'New violation on tracked property',
    'A new ' || COALESCE(NEW.violation_type, 'code violation') || ' was filed at a property you are tracking.'
  FROM public.saved_properties sp
  LEFT JOIN public.email_preferences ep ON ep.user_id = sp.user_id
  WHERE sp.property_id = NEW.property_id
    AND COALESCE(ep.escalation_alerts_enabled, true) = true;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_outdated_insights_batch(batch_size integer DEFAULT 5000)
 RETURNS TABLE(processed integer, remaining bigint)
 LANGUAGE plpgsql
 SET statement_timeout TO '600s'
 SET search_path TO 'public'
AS $function$
DECLARE
  v_processed INTEGER := 0;
BEGIN
  -- Update properties with investor language in snap_insight
  WITH batch AS (
    SELECT id, total_violations, open_violations, avg_days_open, 
           violation_types, distress_signals, repeat_offender, 
           multi_department, escalated
    FROM properties
    WHERE snap_insight IS NOT NULL
      AND (
        snap_insight ILIKE '%distress%' OR
        snap_insight ILIKE '%opportunity%' OR
        snap_insight ILIKE '%motivated%' OR
        snap_insight ILIKE '%acquisition%' OR
        snap_insight ILIKE '%investor%' OR
        snap_insight ILIKE '%value-add%' OR
        snap_insight ILIKE '%value add%' OR
        snap_insight ILIKE '%flip%' OR
        snap_insight ILIKE '%wholesale%' OR
        snap_insight ILIKE '%profit%' OR
        snap_insight ILIKE '%below market%' OR
        snap_insight ILIKE '%discounted%' OR
        snap_insight ILIKE '%neglect%' OR
        snap_insight ILIKE '%abandon%' OR
        snap_insight ILIKE '%repositioning%'
      )
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE properties p
  SET snap_insight = generate_enforcement_insight(
    b.total_violations,
    b.open_violations,
    b.avg_days_open,
    b.violation_types,
    b.distress_signals,
    b.repeat_offender,
    b.multi_department,
    b.escalated
  ),
  last_analyzed_at = NOW()
  FROM batch b
  WHERE p.id = b.id;
  
  GET DIAGNOSTICS v_processed = ROW_COUNT;
  
  -- Count remaining outdated
  RETURN QUERY SELECT v_processed, (
    SELECT COUNT(*) FROM properties 
    WHERE snap_insight IS NOT NULL 
      AND (
        snap_insight ILIKE '%distress%' OR
        snap_insight ILIKE '%opportunity%' OR
        snap_insight ILIKE '%motivated%' OR
        snap_insight ILIKE '%acquisition%' OR
        snap_insight ILIKE '%investor%' OR
        snap_insight ILIKE '%value-add%' OR
        snap_insight ILIKE '%value add%' OR
        snap_insight ILIKE '%flip%' OR
        snap_insight ILIKE '%wholesale%' OR
        snap_insight ILIKE '%profit%' OR
        snap_insight ILIKE '%below market%' OR
        snap_insight ILIKE '%discounted%' OR
        snap_insight ILIKE '%neglect%' OR
        snap_insight ILIKE '%abandon%' OR
        snap_insight ILIKE '%repositioning%'
      )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.pipeline_stages (org_id, name, sort_order, color, is_won, is_lost, is_default)
  VALUES
    (_org_id, 'New',            10, '#3b82f6', false, false, true),
    (_org_id, 'Researching',    20, '#8b5cf6', false, false, true),
    (_org_id, 'Contacted',      30, '#06b6d4', false, false, true),
    (_org_id, 'Negotiating',    40, '#f59e0b', false, false, true),
    (_org_id, 'Under Contract', 50, '#10b981', false, false, true),
    (_org_id, 'Closed Won',     60, '#059669', true,  false, true),
    (_org_id, 'Closed Lost',    70, '#94a3b8', false, true,  true)
  ON CONFLICT DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_property_violation_types()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_property_id uuid;
BEGIN
  -- Get the property_id from either NEW or OLD record
  IF TG_OP = 'DELETE' THEN
    target_property_id := OLD.property_id;
  ELSE
    target_property_id := NEW.property_id;
  END IF;

  -- Skip if property_id is null
  IF target_property_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update the violation_types array on the property
  UPDATE properties
  SET violation_types = COALESCE(
    (SELECT ARRAY_AGG(DISTINCT violation_type ORDER BY violation_type)
     FROM violations
     WHERE property_id = target_property_id
       AND violation_type IS NOT NULL),
    '{}'::text[]
  )
  WHERE id = target_property_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_distress_event_enroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead RECORD;
BEGIN
  FOR _lead IN
    SELECT id FROM leads
    WHERE property_id = NEW.property_id
      AND archived_at IS NULL
  LOOP
    PERFORM public.auto_enroll_lead_in_sequences(
      _lead.id, 'distress_event', NEW.event_type
    );
  END LOOP;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_lead_stage_change_enroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    PERFORM public.auto_enroll_lead_in_sequences(
      NEW.id, 'stage_change', NEW.stage_id::text
    );
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.auto_enroll_lead_in_sequences(
      NEW.id, 'stage_change', NEW.stage_id::text
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_foia_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'sent' AND COALESCE(OLD.status, '') <> 'sent' THEN
    NEW.sent_at = now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_properties_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_subscription_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;


-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clean_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_target_cooldown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger_skiptrace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_request_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocoding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_sms_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_enrichment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_proxy_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.press_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.press_rotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_bulk_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_bulk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unlocked_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_allowed_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.va_credential_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Policies
-- ============================================
CREATE POLICY "Users can view own commissions" ON public.affiliate_commissions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM affiliate_referrals ar
  WHERE ((ar.id = affiliate_commissions.referral_id) AND (ar.referrer_id = auth.uid())))));
CREATE POLICY "Users can view own referrals" ON public.affiliate_referrals AS PERMISSIVE FOR SELECT TO authenticated USING ((referrer_id = auth.uid()));
CREATE POLICY agent_runs_admin_select ON public.agent_runs AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage waitlist" ON public.beta_waitlist AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can join waitlist" ON public.beta_waitlist AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY backend_only_deny_anon ON public.buyer_purchases AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY backend_only_deny_authenticated ON public.buyer_purchases AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Users can create their own call logs" ON public.call_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own call logs" ON public.call_logs AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own call logs" ON public.call_logs AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own call logs" ON public.call_logs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY call_logs_delete ON public.call_logs AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY call_logs_insert ON public.call_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY call_logs_select ON public.call_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY call_logs_update ON public.call_logs AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Admins full access to campaign_leads" ON public.campaign_leads AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view queued campaign_leads" ON public.campaign_leads AS PERMISSIVE FOR SELECT TO authenticated USING ((status = 'queued'::text));
CREATE POLICY "Users update assigned campaign_leads" ON public.campaign_leads AS PERMISSIVE FOR UPDATE TO authenticated USING ((assigned_to = auth.uid())) WITH CHECK ((assigned_to = auth.uid()));
CREATE POLICY "Users view assigned campaign_leads" ON public.campaign_leads AS PERMISSIVE FOR SELECT TO authenticated USING ((assigned_to = auth.uid()));
CREATE POLICY backend_only_deny_anon ON public.cash_buyers AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY backend_only_deny_authenticated ON public.cash_buyers AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Anyone can read census_places" ON public.census_places AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage census_places" ON public.census_places AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view clean_leads" ON public.clean_leads AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins full access to clean_leads" ON public.clean_leads AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage all counties" ON public.counties AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admins full access to counties" ON public.counties AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "VAs can update assigned counties" ON public.counties AS PERMISSIVE FOR UPDATE TO public USING ((assigned_to = auth.uid()));
CREATE POLICY "VAs can view assigned counties" ON public.counties AS PERMISSIVE FOR SELECT TO public USING (((assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role))))));
CREATE POLICY admin_manage_cooldowns ON public.credential_target_cooldown AS PERMISSIVE FOR ALL TO authenticated USING (is_foia_admin()) WITH CHECK (is_foia_admin());
CREATE POLICY authenticated_read_cooldowns ON public.credential_target_cooldown AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Users view own credit history" ON public.credit_ledger AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY credit_ledger_user ON public.credit_ledger AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own ledger" ON public.credit_ledger_skiptrace AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can manage distress events" ON public.distress_events AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view distress events" ON public.distress_events AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "org members read drip_enrollments" ON public.drip_enrollments AS PERMISSIVE FOR SELECT TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members update drip_enrollments" ON public.drip_enrollments AS PERMISSIVE FOR UPDATE TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members write drip_enrollments" ON public.drip_enrollments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id = current_user_org_id()));
CREATE POLICY "org members delete drip_sequences" ON public.drip_sequences AS PERMISSIVE FOR DELETE TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members read drip_sequences" ON public.drip_sequences AS PERMISSIVE FOR SELECT TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members update drip_sequences" ON public.drip_sequences AS PERMISSIVE FOR UPDATE TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members write drip_sequences" ON public.drip_sequences AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id = current_user_org_id()));
CREATE POLICY "org members delete drip_steps" ON public.drip_steps AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = current_user_org_id())))));
CREATE POLICY "org members read drip_steps" ON public.drip_steps AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = current_user_org_id())))));
CREATE POLICY "org members update drip_steps" ON public.drip_steps AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = current_user_org_id())))));
CREATE POLICY "org members write drip_steps" ON public.drip_steps AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = current_user_org_id())))));
CREATE POLICY "Admins can view email analytics" ON public.email_analytics AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert their email analytics" ON public.email_analytics AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users insert own analytics" ON public.email_analytics AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users view own analytics" ON public.email_analytics AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own email preferences" ON public.email_preferences AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own email preferences" ON public.email_preferences AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own email preferences" ON public.email_preferences AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Service role can insert send log" ON public.email_send_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read send log" ON public.email_send_log AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can update send log" ON public.email_send_log AS PERMISSIVE FOR UPDATE TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can manage send state" ON public.email_send_state AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users can create their own email templates" ON public.email_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own email templates" ON public.email_templates AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own email templates" ON public.email_templates AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own email templates" ON public.email_templates AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY email_templates_delete ON public.email_templates AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY email_templates_insert ON public.email_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY email_templates_select ON public.email_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id IS NULL) OR (user_id = auth.uid())));
CREATE POLICY email_templates_update ON public.email_templates AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR UPDATE TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY enrichment_agent_jobs_admin_all ON public.enrichment_agent_jobs AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own enrichment jobs" ON public.enrichment_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view own enrichment jobs" ON public.enrichment_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY polaris_enrichment_misses_insert ON public.enrichment_misses AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY enrichment_sources_admin_all ON public.enrichment_sources AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage error_logs" ON public.error_logs AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert error_logs" ON public.error_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can insert their own events" ON public.events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view their own events" ON public.events AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY events_insert_own ON public.events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY events_select_own ON public.events AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read all export logs" ON public.export_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Users can insert own export logs" ON public.export_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own export logs" ON public.export_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY foia_assignments_delete ON public.foia_assignments AS PERMISSIVE FOR DELETE TO public USING (is_foia_admin());
CREATE POLICY foia_assignments_insert ON public.foia_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_foia_admin());
CREATE POLICY foia_assignments_select ON public.foia_assignments AS PERMISSIVE FOR SELECT TO public USING (((va_id = auth.uid()) OR is_foia_admin()));
CREATE POLICY foia_invites_delete ON public.foia_invites AS PERMISSIVE FOR DELETE TO authenticated USING (is_foia_admin());
CREATE POLICY foia_invites_insert ON public.foia_invites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_foia_admin());
CREATE POLICY foia_invites_select ON public.foia_invites AS PERMISSIVE FOR SELECT TO authenticated USING ((is_foia_admin() OR (email = current_user_email())));
CREATE POLICY foia_invites_update ON public.foia_invites AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_foia_admin() OR (email = current_user_email())));
CREATE POLICY foia_profiles_insert ON public.foia_profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY foia_profiles_select ON public.foia_profiles AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = id) OR is_foia_admin()));
CREATE POLICY foia_profiles_update ON public.foia_profiles AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid() = id) OR is_foia_admin()));
CREATE POLICY foia_request_jobs_admin_all ON public.foia_request_jobs AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY foia_requests_insert ON public.foia_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((va_id IS NOT NULL) AND (va_id = auth.uid())) OR ((requested_by IS NOT NULL) AND (requested_by = auth.uid()))));
CREATE POLICY foia_requests_select ON public.foia_requests AS PERMISSIVE FOR SELECT TO public USING (((COALESCE(va_id, requested_by) = auth.uid()) OR is_foia_admin()));
CREATE POLICY foia_requests_update ON public.foia_requests AS PERMISSIVE FOR UPDATE TO public USING (((COALESCE(va_id, requested_by) = auth.uid()) OR is_foia_admin()));
CREATE POLICY foia_responses_admin_all ON public.foia_responses AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY foia_sources_admin_all ON public.foia_sources AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert templates" ON public.foia_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Admins can update templates" ON public.foia_templates AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))));
CREATE POLICY "Authenticated users can view templates" ON public.foia_templates AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Admins can view all geocoding jobs" ON public.geocoding_jobs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert their own geocoding jobs" ON public.geocoding_jobs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = user_id));
CREATE POLICY "Users can update their geocoding jobs" ON public.geocoding_jobs AS PERMISSIVE FOR UPDATE TO public USING ((user_id = (auth.uid())::text));
CREATE POLICY "Users can view their own geocoding jobs" ON public.geocoding_jobs AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = user_id));
CREATE POLICY global_suppression_read_authenticated ON public.global_sms_suppression AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY iaction_log_org_select ON public.integration_action_log AS PERMISSIVE FOR SELECT TO public USING ((integration_id IN ( SELECT user_integrations.id
   FROM user_integrations
  WHERE (user_integrations.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))));
CREATE POLICY "Admins can manage jurisdictions" ON public.jurisdictions AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view all jurisdictions" ON public.jurisdictions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY lead_activities_org_delete ON public.lead_activities AS PERMISSIVE FOR DELETE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY lead_activities_org_insert ON public.lead_activities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY lead_activities_org_select ON public.lead_activities AS PERMISSIVE FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY lead_activity_delete ON public.lead_activity AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY lead_activity_insert ON public.lead_activity AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_activity_select ON public.lead_activity AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY lead_activity_update ON public.lead_activity AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_lists_delete ON public.lead_lists AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY lead_lists_insert ON public.lead_lists AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_lists_select ON public.lead_lists AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY lead_lists_update ON public.lead_lists AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_tag_assignments_org_all ON public.lead_tag_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND (l.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND (l.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())))))));
CREATE POLICY lead_tags_org_all ON public.lead_tags AS PERMISSIVE FOR ALL TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY leads_org_delete ON public.leads AS PERMISSIVE FOR DELETE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY leads_org_insert ON public.leads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) AND (created_by = auth.uid())));
CREATE POLICY leads_org_select ON public.leads AS PERMISSIVE FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY leads_org_update ON public.leads AS PERMISSIVE FOR UPDATE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Admins can view waitlist" ON public.list_enrichment_waitlist AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert waitlist" ON public.list_enrichment_waitlist AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY list_props_delete ON public.list_properties AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));
CREATE POLICY list_props_insert ON public.list_properties AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));
CREATE POLICY list_props_select ON public.list_properties AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));
CREATE POLICY list_props_update ON public.list_properties AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));
CREATE POLICY "Admins full access to market requests" ON public.market_requests AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own market requests" ON public.market_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own market requests" ON public.market_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Admins can manage marketing_leads" ON public.marketing_leads AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read mcp_clients" ON public.mcp_clients AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view mcp proxy logs" ON public.mcp_proxy_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read mcp_tool_calls" ON public.mcp_tool_calls AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "System can insert organizations" ON public.organizations AS PERMISSIVE FOR INSERT TO public WITH CHECK (false);
CREATE POLICY "Users can update their organization" ON public.organizations AS PERMISSIVE FOR UPDATE TO public USING ((id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can view their organization" ON public.organizations AS PERMISSIVE FOR SELECT TO public USING ((id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY owners_org_delete ON public.owners AS PERMISSIVE FOR DELETE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY owners_org_insert ON public.owners AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY owners_org_select ON public.owners AS PERMISSIVE FOR SELECT TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY owners_org_update ON public.owners AS PERMISSIVE FOR UPDATE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY parcel_attributes_authenticated_select ON public.parcel_attributes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access" ON public.pipeline_progress AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY pipeline_stages_org_delete ON public.pipeline_stages AS PERMISSIVE FOR DELETE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY pipeline_stages_org_insert ON public.pipeline_stages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY pipeline_stages_org_select ON public.pipeline_stages AS PERMISSIVE FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY pipeline_stages_org_update ON public.pipeline_stages AS PERMISSIVE FOR UPDATE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY press_accounts_delete ON public.press_accounts AS PERMISSIVE FOR DELETE TO public USING (is_foia_admin());
CREATE POLICY press_accounts_insert ON public.press_accounts AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_foia_admin());
CREATE POLICY press_accounts_select ON public.press_accounts AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY press_accounts_update ON public.press_accounts AS PERMISSIVE FOR UPDATE TO public USING (is_foia_admin());
CREATE POLICY press_rotation_delete ON public.press_rotation AS PERMISSIVE FOR DELETE TO public USING (is_foia_admin());
CREATE POLICY press_rotation_insert ON public.press_rotation AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_foia_admin());
CREATE POLICY press_rotation_select ON public.press_rotation AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY press_rotation_update ON public.press_rotation AS PERMISSIVE FOR UPDATE TO public USING (is_foia_admin());
CREATE POLICY "Users can insert their own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Authenticated users can delete properties" ON public.properties AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Authenticated users can insert properties" ON public.properties AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Authenticated users can update investor brief" ON public.properties AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY anon_read_properties ON public.properties AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY polaris_enrichment_update ON public.properties AS PERMISSIVE FOR UPDATE TO anon USING ((beds IS NULL)) WITH CHECK (true);
CREATE POLICY properties_select_auth ON public.properties AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Users can view own contacts" ON public.property_contacts AS PERMISSIVE FOR SELECT TO public USING ((created_by = auth.uid()));
CREATE POLICY property_contacts_insert ON public.property_contacts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY property_contacts_select ON public.property_contacts AS PERMISSIVE FOR SELECT TO authenticated USING ((created_by = auth.uid()));
CREATE POLICY "Admins can manage enrichment jobs" ON public.property_enrichment_jobs AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY admin_manage_rotation_alerts ON public.rotation_alerts AS PERMISSIVE FOR ALL TO authenticated USING (is_foia_admin()) WITH CHECK (is_foia_admin());
CREATE POLICY va_read_own_rotation_alerts ON public.rotation_alerts AS PERMISSIVE FOR SELECT TO authenticated USING ((va_id = auth.uid()));
CREATE POLICY "Users can delete own saved properties" ON public.saved_properties AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own saved properties" ON public.saved_properties AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view own saved properties" ON public.saved_properties AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own bulk items" ON public.skiptrace_bulk_items AS PERMISSIVE FOR SELECT TO public USING ((run_id IN ( SELECT skiptrace_bulk_runs.run_id
   FROM skiptrace_bulk_runs
  WHERE (skiptrace_bulk_runs.user_id = auth.uid()))));
CREATE POLICY "Users can view their own bulk runs" ON public.skiptrace_bulk_runs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own consent" ON public.skiptrace_consent_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own consent log" ON public.skiptrace_consent_log AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own jobs" ON public.skiptrace_jobs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own jobs" ON public.skiptrace_jobs AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own jobs" ON public.skiptrace_jobs AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "owner can read/write outcomes" ON public.skiptrace_outcomes AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM skiptrace_jobs j
  WHERE ((j.id = skiptrace_outcomes.job_id) AND (j.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM skiptrace_jobs j
  WHERE ((j.id = skiptrace_outcomes.job_id) AND (j.user_id = auth.uid())))));
CREATE POLICY "admins manage sms_messages" ON public.sms_messages AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "org members read sms_messages" ON public.sms_messages AS PERMISSIVE FOR SELECT TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members write sms_messages" ON public.sms_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id = current_user_org_id()));
CREATE POLICY "Users can create their own SMS templates" ON public.sms_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own SMS templates" ON public.sms_templates AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own SMS templates" ON public.sms_templates AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own SMS templates" ON public.sms_templates AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY sms_templates_delete ON public.sms_templates AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY sms_templates_insert ON public.sms_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY sms_templates_select ON public.sms_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id IS NULL) OR (user_id = auth.uid())));
CREATE POLICY sms_templates_update ON public.sms_templates AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "admins manage sms_threads" ON public.sms_threads AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "org members read sms_threads" ON public.sms_threads AS PERMISSIVE FOR SELECT TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members update sms_threads" ON public.sms_threads AS PERMISSIVE FOR UPDATE TO public USING ((org_id = current_user_org_id()));
CREATE POLICY "org members write sms_threads" ON public.sms_threads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id = current_user_org_id()));
CREATE POLICY "Admins view all staging" ON public.staging_uploads AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "VAs insert own uploads" ON public.staging_uploads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'va'::app_role) AND (uploaded_by = auth.uid())));
CREATE POLICY "VAs view own uploads" ON public.staging_uploads AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'va'::app_role) AND (uploaded_by = auth.uid())));
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY "Service role manages usage" ON public.subscription_usage AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));
CREATE POLICY "Users can view own usage" ON public.subscription_usage AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own usage" ON public.subscription_usage AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY subscription_usage_select_own ON public.subscription_usage AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY suppression_org_delete ON public.suppression_list AS PERMISSIVE FOR DELETE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY suppression_org_insert ON public.suppression_list AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY suppression_org_select ON public.suppression_list AS PERMISSIVE FOR SELECT TO public USING (((org_id IS NULL) OR (org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
CREATE POLICY suppression_org_update ON public.suppression_list AS PERMISSIVE FOR UPDATE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Admins can read system_logs" ON public.system_logs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can insert system_logs" ON public.system_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY targets_insert ON public.targets AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_foia_admin());
CREATE POLICY targets_select ON public.targets AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY targets_update ON public.targets AS PERMISSIVE FOR UPDATE TO public USING (is_foia_admin());
CREATE POLICY va_rate_portal_difficulty ON public.targets AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid())))));
CREATE POLICY va_update_target_foia_url ON public.targets AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid())))));
CREATE POLICY "Admins can read all transactions" ON public.transactions AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own transactions" ON public.transactions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own unlocks" ON public.unlocked_properties AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Admins view all history" ON public.upload_history AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "VAs view own history" ON public.upload_history AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'va'::app_role) AND (uploaded_by = auth.uid())));
CREATE POLICY "Admins can view all upload jobs" ON public.upload_jobs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create own upload jobs" ON public.upload_jobs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own upload jobs" ON public.upload_jobs AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own upload jobs" ON public.upload_jobs AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert staging data" ON public.upload_staging AS PERMISSIVE FOR INSERT TO public WITH CHECK ((job_id IN ( SELECT upload_jobs.id
   FROM upload_jobs
  WHERE (upload_jobs.user_id = auth.uid()))));
CREATE POLICY "Users can view own staging data" ON public.upload_staging AS PERMISSIVE FOR SELECT TO public USING ((job_id IN ( SELECT upload_jobs.id
   FROM upload_jobs
  WHERE (upload_jobs.user_id = auth.uid()))));
CREATE POLICY activation_own_insert ON public.user_activation_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY activation_own_select ON public.user_activation_events AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read all activity" ON public.user_activity_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own activity" ON public.user_activity_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Service role can insert alerts" ON public.user_alerts AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Users can delete own alerts" ON public.user_alerts AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can update own alerts" ON public.user_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view own alerts" ON public.user_alerts AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can delete their own states" ON public.user_allowed_states AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own states" ON public.user_allowed_states AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own states" ON public.user_allowed_states AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY user_integrations_org_delete ON public.user_integrations AS PERMISSIVE FOR DELETE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY user_integrations_org_insert ON public.user_integrations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY user_integrations_org_select ON public.user_integrations AS PERMISSIVE FOR SELECT TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY user_integrations_org_update ON public.user_integrations AS PERMISSIVE FOR UPDATE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Admins can create invitations" ON public.user_invitations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all invitations" ON public.user_invitations AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.user_profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own profile" ON public.user_profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own profile" ON public.user_profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admins can delete roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update roles" ON public.user_roles AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Service role manages subscriptions" ON public.user_subscriptions AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));
CREATE POLICY "Users can view their own subscriptions" ON public.user_subscriptions AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY admin_manage_va_credential_slots ON public.va_credential_slots AS PERMISSIVE FOR ALL TO authenticated USING (is_foia_admin()) WITH CHECK (is_foia_admin());
CREATE POLICY va_read_own_credential_slots ON public.va_credential_slots AS PERMISSIVE FOR SELECT TO authenticated USING ((va_id = auth.uid()));
CREATE POLICY "Authenticated users can delete violations" ON public.violations AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Authenticated users can insert violations" ON public.violations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY anon_read_violations ON public.violations AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY violations_select_auth ON public.violations AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Admins can manage webhook_errors" ON public.webhook_errors AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role can insert webhook_errors" ON public.webhook_errors AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Admins can read webhook_events" ON public.webhook_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role only" ON public.webhook_events AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
