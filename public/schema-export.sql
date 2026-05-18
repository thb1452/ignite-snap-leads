--
-- PostgreSQL database dump
--

\restrict Xqp1UHxpulw1OQVN2yTmArp2L9oeiXmsJOzpFdFvccfSUeMAZZ8UrsFUToJbZ7X

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'va',
    'user'
);


--
-- Name: accept_invitation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_invitation(p_token text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: auto_enroll_lead_in_sequences(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_enroll_lead_in_sequences(_lead_id uuid, _trigger_type text, _match_value text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: backfill_insights_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_insights_batch(batch_size integer DEFAULT 5000) RETURNS TABLE(processed integer, remaining bigint)
    LANGUAGE plpgsql
    SET statement_timeout TO '600s'
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: backfill_property_aggregates_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_property_aggregates_batch(p_batch_size integer DEFAULT 5000) RETURNS TABLE(processed integer, updated integer, remaining integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: backfill_violation_dates_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_violation_dates_batch(p_batch_size integer DEFAULT 5000) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: batch_normalize_violation_types(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch_normalize_violation_types(batch_size integer DEFAULT 1000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: bulk_upsert_violations(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_upsert_violations(p_violations jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: check_foia_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_foia_invite(p_token text) RETURNS TABLE(email text, accepted boolean, expires_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT fi.email, fi.accepted, fi.expires_at
  FROM public.foia_invites fi
  WHERE fi.token = p_token
    AND fi.expires_at > now()
  LIMIT 1;
$$;


--
-- Name: claim_due_drip_enrollments(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_due_drip_enrollments(_limit integer DEFAULT 50) RETURNS TABLE(id uuid, org_id uuid, lead_id uuid, sequence_id uuid, current_step integer, to_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: complete_foia_signup(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_foia_signup(p_user_id uuid, p_email text, p_full_name text, p_role text DEFAULT 'va'::text, p_token text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: consume_credit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_credit(p_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: current_user_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_email() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;


--
-- Name: current_user_org_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_org_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: delete_email(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_email(queue_name text, message_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;


--
-- Name: enqueue_email(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_email(queue_name text, payload jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;


--
-- Name: fn_add_filtered_to_list(uuid, text, text, integer, integer, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_add_filtered_to_list(p_list_id uuid, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_min_score integer DEFAULT NULL::integer, p_max_score integer DEFAULT NULL::integer, p_jurisdiction_id uuid DEFAULT NULL::uuid, p_enforcement_type text DEFAULT NULL::text, p_limit integer DEFAULT 25000) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '120s'
    AS $$
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
$$;


--
-- Name: fn_backfill_zips_by_city_centroids(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_backfill_zips_by_city_centroids(p_city text, p_state text, p_batch_size integer DEFAULT 500) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_backfill_zips_by_city_mode(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_backfill_zips_by_city_mode(p_city text, p_state text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_backfill_zips_nearest_neighbor(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_backfill_zips_nearest_neighbor(p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_batch_size integer DEFAULT 500) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_bulk_insert_properties(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_bulk_insert_properties(p_properties jsonb) RETURNS TABLE(address text, city text, state text, zip text, property_id uuid, was_created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_bulk_match_properties(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_bulk_match_properties(p_addresses text[]) RETURNS TABLE(input_address text, property_id uuid, address text, city text, state text, zip text, snap_score integer, open_violations integer, violation_types text[], last_enforcement_date timestamp with time zone, snap_insight text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: fn_bulk_run_inc(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_bulk_run_inc(p_run_id text, p_field text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_field = 'succeeded' THEN
    UPDATE skiptrace_bulk_runs SET succeeded = succeeded + 1 WHERE run_id = p_run_id;
  ELSIF p_field = 'failed' THEN
    UPDATE skiptrace_bulk_runs SET failed = failed + 1 WHERE run_id = p_run_id;
  END IF;
END;
$$;


--
-- Name: fn_category_property_counts(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_category_property_counts(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text) RETURNS TABLE(category_id text, category_label text, property_count bigint)
    LANGUAGE plpgsql STABLE
    SET statement_timeout TO '10s'
    AS $$
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
$$;


--
-- Name: fn_charge_credits(uuid[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_charge_credits(p_property_ids uuid[], p_job_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_check_county_limit(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_county_limit(p_amount integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_check_enrichment_limit(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_enrichment_limit(p_user_id uuid, p_address_count integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_check_subscription_limit(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_subscription_limit(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_check_unlocked_batch(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_unlocked_batch(p_user_id uuid, p_property_ids uuid[]) RETURNS TABLE(property_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT up.property_id
  FROM unlocked_properties up
  WHERE up.user_id = p_user_id
    AND up.property_id = ANY(p_property_ids);
$$;


--
-- Name: fn_consume_credit(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_consume_credit(p_reason text, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: fn_consume_enrichment_usage(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_consume_enrichment_usage(p_user_id uuid, p_address_count integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_consume_usage(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_consume_usage(p_usage_type text, p_amount integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Delegate to atomic implementation
  RETURN fn_consume_usage_atomic(p_usage_type, p_amount);
END;
$$;


--
-- Name: fn_consume_usage_atomic(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_consume_usage_atomic(p_usage_type text, p_amount integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_dashboard_stats() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_data_health_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_data_health_report() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_distinct_cities(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_distinct_cities(p_state text DEFAULT NULL::text) RETURNS TABLE(city text)
    LANGUAGE sql STABLE
    SET statement_timeout TO '8s'
    AS $$
  SELECT DISTINCT INITCAP(mv.city) AS city
  FROM mv_distinct_cities mv
  WHERE (p_state IS NULL OR UPPER(mv.state) = UPPER(p_state))
    AND LENGTH(mv.city) >= 3
    AND mv.city !~ '^\d'
  ORDER BY city;
$$;


--
-- Name: fn_distinct_city_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_distinct_city_counts() RETURNS TABLE(city text, state text, cnt bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT TRIM(p.city) AS city, UPPER(TRIM(p.state)) AS state, COUNT(*) AS cnt
  FROM properties p
  WHERE p.city IS NOT NULL AND p.state IS NOT NULL
  GROUP BY TRIM(p.city), UPPER(TRIM(p.state))
  ORDER BY cnt DESC;
$$;


--
-- Name: fn_distinct_states(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_distinct_states() RETURNS TABLE(state text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT state FROM mv_distinct_states ORDER BY state;
$$;


--
-- Name: fn_export_properties_batch(uuid[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_export_properties_batch(p_property_ids uuid[], p_enforce_code_violation_only boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_fix_city_names(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_fix_city_names(mappings jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '120s'
    AS $$
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
$$;


--
-- Name: fn_fulfillment_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_fulfillment_overview() RETURNS TABLE(total_fulfilled bigint, with_file bigint, file_upload_rate numeric, avg_quality numeric, format_csv bigint, format_pdf bigint, format_image bigint, format_mixed bigint, format_other bigint, avg_response_days numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, total_fees numeric, redacted_count bigint, avg_estimated_rows numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_get_current_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_current_usage(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_get_list_properties(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_list_properties(p_list_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_get_trial_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_trial_status(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_get_unlock_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_unlock_count(p_property_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COUNT(*)::INTEGER FROM unlocked_properties WHERE property_id = p_property_id;
$$;


--
-- Name: fn_get_user_allowed_states(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_user_allowed_states(p_user_id uuid DEFAULT NULL::uuid) RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_get_user_lists(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_user_lists() RETURNS TABLE(id uuid, name text, created_at timestamp with time zone, property_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_get_user_subscription(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_user_subscription(p_user_id uuid DEFAULT auth.uid()) RETURNS TABLE(subscription_id uuid, user_id uuid, plan_id uuid, plan_name text, display_name text, status text, current_period_start timestamp with time zone, current_period_end timestamp with time zone, max_monthly_exports integer, max_counties integer, max_user_seats integer, max_skip_traces_per_month integer, has_advanced_filters boolean, has_violation_filtering boolean, has_rolling_intelligence boolean, has_escalation_alerts boolean, has_api_access boolean, stripe_subscription_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_increment_trial_exports(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_increment_trial_exports(p_user_id uuid, p_count integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_increment_usage(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_increment_usage(p_usage_type text, p_amount integer DEFAULT 1, p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_job_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_job_status(p_job_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_jurisdiction_intelligence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_jurisdiction_intelligence() RETURNS TABLE(target_id uuid, jurisdiction_name text, state text, county text, population integer, target_type text, portal_difficulty_score integer, total_requests bigint, fulfilled_count bigint, rejected_count bigint, needs_review_count bigint, no_portal_count bigint, fulfillment_rate numeric, rejection_rate numeric, avg_response_days numeric, avg_data_quality numeric, avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, redaction_pct numeric, hostility_score numeric, jis numeric, speed_tier text, rejection_tier text, fee_risk text, redaction_pattern text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_jurisdiction_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_jurisdiction_stats() RETURNS TABLE(jurisdiction_id uuid, jurisdiction_name text, city text, state text, enforcement_profile jsonb, property_count bigint, avg_score numeric, distressed_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_log_new_violation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_log_new_violation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_log_snapscore_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_log_snapscore_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_map_markers(text, text, text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_map_markers(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_limit integer DEFAULT 50000) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_map_markers_by_category(text, text, text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_map_markers_by_category(p_category text, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_limit integer DEFAULT 10000) RETURNS TABLE(id uuid, latitude numeric, longitude numeric, snap_score integer, address text, city text, state text, enforcement_type text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_map_markers_in_bounds(numeric, numeric, numeric, numeric, text, text, text, integer, integer, text, integer, boolean, boolean, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_map_markers_in_bounds(p_min_lat numeric, p_max_lat numeric, p_min_lng numeric, p_max_lng numeric, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_last_seen_days integer DEFAULT NULL::integer, p_open_violations_only boolean DEFAULT false, p_multiple_violations_only boolean DEFAULT false, p_repeat_offender_only boolean DEFAULT false, p_limit integer DEFAULT 60000) RETURNS TABLE(id uuid, latitude numeric, longitude numeric, snap_score integer, address text, city text, state text, enforcement_type text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_normalize_violation_type(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_normalize_violation_type(raw_type text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: fn_normalize_violation_types_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_normalize_violation_types_batch(p_batch_size integer DEFAULT 5000) RETURNS TABLE(processed integer, remaining integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_opportunity_funnel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_opportunity_funnel() RETURNS TABLE(opportunity_class text, property_count bigint, avg_score numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_properties_by_bbox(double precision, double precision, double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_properties_by_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer DEFAULT 1000) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_properties_by_bbox(numeric, numeric, numeric, numeric, integer, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_properties_by_bbox(p_min_lng numeric, p_min_lat numeric, p_max_lng numeric, p_max_lat numeric, p_score_min integer DEFAULT NULL::integer, p_last_seen_after date DEFAULT NULL::date, p_source text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_properties_by_bbox(numeric, numeric, numeric, numeric, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_properties_by_bbox(p_west numeric, p_south numeric, p_east numeric, p_north numeric, p_score_gte integer DEFAULT NULL::integer, p_last_seen_lte integer DEFAULT NULL::integer, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_properties_by_category(text, text, text, text, integer, integer, integer, integer, integer, text, boolean, boolean, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_properties_by_category(p_category text, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_last_seen_days integer DEFAULT NULL::integer, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_sort_by text DEFAULT 'recently_updated'::text, p_open_violations_only boolean DEFAULT false, p_multiple_violations_only boolean DEFAULT false, p_repeat_offender_only boolean DEFAULT false, p_random_seed text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_properties_paged(integer, integer, text, text, text, integer, integer, integer, text, boolean, boolean, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_properties_paged(p_page integer, p_page_size integer, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_snap_min integer DEFAULT NULL::integer, p_snap_max integer DEFAULT NULL::integer, p_last_seen_days integer DEFAULT NULL::integer, p_sort_by text DEFAULT 'snap_score'::text, p_open_violations_only boolean DEFAULT false, p_multiple_violations_only boolean DEFAULT false, p_repeat_offender_only boolean DEFAULT false, p_random_seed text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_properties_untraced_in_list(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_properties_untraced_in_list(p_list_id uuid, p_limit integer DEFAULT 5000) RETURNS TABLE(property_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT lp.property_id
  FROM public.list_properties lp
  LEFT JOIN public.property_contacts pc ON pc.property_id = lp.property_id
  WHERE lp.list_id = p_list_id
  GROUP BY lp.property_id
  HAVING COUNT(pc.property_id) = 0
  LIMIT p_limit;
$$;


--
-- Name: fn_record_view(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_record_view(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_refund_credits(uuid[], uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_refund_credits(p_property_ids uuid[], p_job_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_start_trial(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_start_trial(p_user_id uuid, p_trial_tier text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_state_response_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_state_response_analytics() RETURNS TABLE(state text, total_requests bigint, fulfilled_count bigint, avg_response_days numeric, fulfillment_rate numeric, rejection_rate numeric, avg_data_quality numeric, avg_fee_amount numeric, fee_incidence_rate numeric, avg_fee_nonzero numeric, redaction_pct numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_unlock_property(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_unlock_property(p_user_id uuid, p_property_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_update_user_states(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_user_states(p_states text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_user_needs_state_selection(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_user_needs_state_selection() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_violation_counts_by_area(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_violation_counts_by_area(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text) RETURNS TABLE(violation_type text, count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: fn_zip_pressure(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_zip_pressure(p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text) RETURNS TABLE(zip text, avg_score numeric, property_count bigint, avg_lat numeric, avg_lng numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: generate_enforcement_insight(integer, integer, integer, text[], text[], boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_enforcement_insight(p_total_violations integer, p_open_violations integer, p_avg_days_open integer, p_violation_types text[], p_distress_signals text[], p_repeat_offender boolean, p_multi_department boolean, p_escalated boolean) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_duplicate_property_groups(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_duplicate_property_groups(batch_limit integer DEFAULT 200) RETURNS TABLE(winner_id uuid, loser_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    error_message text NOT NULL,
    error_stack text,
    component_stack text,
    url text,
    user_agent text,
    severity text DEFAULT 'error'::text NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    metadata jsonb
);


--
-- Name: get_error_logs_recent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_error_logs_recent() RETURNS SETOF public.error_logs
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT *
  FROM error_logs
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 100;
$$;


--
-- Name: get_integration_secret(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_integration_secret(p_integration_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
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
$$;


--
-- Name: system_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    source text DEFAULT 'frontend'::text NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    user_id uuid
);


--
-- Name: get_system_logs_24h(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_system_logs_24h() RETURNS SETOF public.system_logs
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT *
  FROM system_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
    AND has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 500;
$$;


--
-- Name: webhook_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_type text DEFAULT 'stripe'::text NOT NULL,
    event_type text,
    event_id text,
    error_message text NOT NULL,
    payload jsonb,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone
);


--
-- Name: get_webhook_errors_recent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_webhook_errors_recent() RETURNS SETOF public.webhook_errors
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT *
  FROM webhook_errors
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY created_at DESC
  LIMIT 100;
$$;


--
-- Name: handle_new_org_pipeline_stages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_org_pipeline_stages() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_foia_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_foia_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.foia_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


--
-- Name: is_foia_va(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_foia_va() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM foia_profiles
    WHERE id = auth.uid() AND role = 'va' AND is_active = true
  );
$$;


--
-- Name: list_recent_violation_events_v1(text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_recent_violation_events_v1(p_state text, p_city text DEFAULT NULL::text, p_county text DEFAULT NULL::text, p_days_back integer DEFAULT 30, p_limit integer DEFAULT 25) RETURNS TABLE(property_id uuid, address text, city text, state text, zip text, violation_count_recent bigint, most_recent_violation_date date, snapscore integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: log_lead_stage_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_lead_stage_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: move_to_dlq(text, text, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: notify_saved_property_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_saved_property_users() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: read_email_batch(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;


--
-- Name: refresh_outdated_insights_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_outdated_insights_batch(batch_size integer DEFAULT 5000) RETURNS TABLE(processed integer, remaining bigint)
    LANGUAGE plpgsql
    SET statement_timeout TO '600s'
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: seed_default_pipeline_stages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_pipeline_stages(_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: sync_property_violation_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_property_violation_types() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: tg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: trg_distress_event_enroll(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_distress_event_enroll() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: trg_lead_stage_change_enroll(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_lead_stage_change_enroll() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: update_foia_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_foia_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'sent' AND COALESCE(OLD.status, '') <> 'sent' THEN
    NEW.sent_at = now();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_properties_geom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_properties_geom() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_subscription_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_subscription_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: affiliate_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    amount integer NOT NULL,
    commission_rate integer DEFAULT 30 NOT NULL,
    paid_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT affiliate_commissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: affiliate_referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referred_user_id uuid NOT NULL,
    signup_at timestamp with time zone DEFAULT now() NOT NULL,
    first_purchase_at timestamp with time zone,
    commission_paid boolean DEFAULT false NOT NULL
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id bigint NOT NULL,
    agent_name text NOT NULL,
    job_table text NOT NULL,
    job_id uuid NOT NULL,
    status text NOT NULL,
    input_summary text,
    output_summary text,
    error_message text,
    duration_ms integer,
    tokens_used integer,
    cost_usd numeric(10,6),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_runs_job_table_check CHECK ((job_table = ANY (ARRAY['enrichment_agent_jobs'::text, 'foia_request_jobs'::text]))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'needs_review'::text])))
);


--
-- Name: agent_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_runs_id_seq OWNED BY public.agent_runs.id;


--
-- Name: beta_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text
);


--
-- Name: buyer_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    parcel_id text,
    property_address text NOT NULL,
    zip text,
    county_fips text DEFAULT '18097'::text NOT NULL,
    sale_date date NOT NULL,
    sale_price numeric(12,2),
    deed_type text,
    raw_grantee_name text NOT NULL,
    source text DEFAULT 'marion_county_recorder'::text,
    source_record_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid,
    phone_number text NOT NULL,
    duration integer,
    notes text,
    call_type text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT call_logs_call_type_check CHECK ((call_type = ANY (ARRAY['outbound'::text, 'inbound'::text]))),
    CONSTRAINT call_logs_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'missed'::text, 'voicemail'::text, 'busy'::text])))
);


--
-- Name: campaign_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip text,
    snap_score integer,
    enforcement_type text,
    owner_name text,
    phone text,
    status text DEFAULT 'queued'::text NOT NULL,
    assigned_to uuid,
    notes text,
    contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone_type text,
    trace_attempted_at timestamp with time zone,
    trace_source text
);


--
-- Name: cash_buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_buyers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    normalized_name text NOT NULL,
    raw_names text[] NOT NULL,
    buyer_type text NOT NULL,
    total_purchases integer DEFAULT 0 NOT NULL,
    total_spend_usd numeric(14,2) DEFAULT 0 NOT NULL,
    avg_price_usd numeric(12,2),
    first_buy_date date,
    last_buy_date date,
    primary_county_fips text DEFAULT '18097'::text NOT NULL,
    active_zips text[],
    inbiz_resolution_status text DEFAULT 'pending'::text,
    inbiz_resolved_at timestamp with time zone,
    registered_agent text,
    member_managers jsonb DEFAULT '[]'::jsonb,
    principal_address text,
    skip_traced_at timestamp with time zone,
    phones jsonb DEFAULT '[]'::jsonb,
    emails jsonb DEFAULT '[]'::jsonb,
    buyer_score numeric(5,2),
    buyer_tier text,
    is_out_of_state boolean DEFAULT false,
    is_institutional boolean DEFAULT false,
    manual_review_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_buyers_buyer_tier_check CHECK ((buyer_tier = ANY (ARRAY['a'::text, 'b'::text, 'c'::text, 'cold'::text]))),
    CONSTRAINT cash_buyers_buyer_type_check CHECK ((buyer_type = ANY (ARRAY['llc'::text, 'trust'::text, 'individual'::text, 'institutional'::text, 'unknown'::text]))),
    CONSTRAINT cash_buyers_inbiz_resolution_status_check CHECK ((inbiz_resolution_status = ANY (ARRAY['pending'::text, 'resolved'::text, 'not_found'::text, 'custodian_skip'::text, 'manual_review'::text, 'error'::text])))
);


--
-- Name: census_places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.census_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    state_fips text NOT NULL,
    state_abbr text NOT NULL,
    place_fips text NOT NULL
);


--
-- Name: clean_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clean_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    county_id uuid,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip text,
    violation_description text,
    violation_type text,
    opened_date date,
    last_updated date,
    snap_score integer,
    snap_insight text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: counties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    county_name text NOT NULL,
    state text NOT NULL,
    foia_status text,
    assigned_to uuid,
    upload_status text DEFAULT 'pending'::text,
    last_upload_date timestamp with time zone,
    list_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    foia_portal_url text,
    portal_type text DEFAULT 'web_form'::text,
    last_request_date date,
    notes text
);


--
-- Name: credential_target_cooldown; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credential_target_cooldown (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    press_account_id uuid NOT NULL,
    target_id uuid NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    job_id_extracted uuid GENERATED ALWAYS AS (((meta ->> 'job_id'::text))::uuid) STORED,
    property_id_extracted uuid GENERATED ALWAYS AS (((meta ->> 'property_id'::text))::uuid) STORED
);


--
-- Name: credit_ledger_skiptrace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger_skiptrace (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    job_id uuid,
    property_id uuid,
    delta integer NOT NULL,
    reason text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: distress_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distress_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    event_type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    delta jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'system'::text NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT distress_events_event_type_check CHECK ((event_type = ANY (ARRAY['snapscore_change'::text, 'new_violation'::text, 'water_shutoff'::text, 'lis_pendens'::text, 'tax_delinquency'::text, 'code_escalation'::text]))),
    CONSTRAINT distress_events_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);

ALTER TABLE ONLY public.distress_events REPLICA IDENTITY FULL;


--
-- Name: drip_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drip_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    sequence_id uuid NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    pause_reason text,
    to_number text,
    enrolled_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT drip_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: drip_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drip_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    trigger_type text DEFAULT 'manual'::text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drip_sequences_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'stage_change'::text, 'distress_event'::text])))
);


--
-- Name: drip_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drip_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    step_order integer NOT NULL,
    delay_hours integer DEFAULT 0 NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL,
    template_body text NOT NULL,
    branch_condition jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drip_steps_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'task'::text])))
);


--
-- Name: email_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_type text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    email_subject text,
    properties_featured integer DEFAULT 0,
    new_violations_count integer DEFAULT 0
);


--
-- Name: email_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    weekly_digest_enabled boolean DEFAULT true NOT NULL,
    digest_day integer DEFAULT 1 NOT NULL,
    digest_hour integer DEFAULT 8 NOT NULL,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    escalation_alerts_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: email_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    template_name text NOT NULL,
    recipient_email text NOT NULL,
    status text NOT NULL,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])))
);


--
-- Name: email_send_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_state (
    id integer DEFAULT 1 NOT NULL,
    retry_after_until timestamp with time zone,
    batch_size integer DEFAULT 10 NOT NULL,
    send_delay_ms integer DEFAULT 200 NOT NULL,
    auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
    transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_send_state_id_check CHECK ((id = 1))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribe_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: enrichment_agent_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichment_agent_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    priority smallint DEFAULT 5 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    source text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    locked_at timestamp with time zone,
    locked_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_attempted_at timestamp with time zone,
    CONSTRAINT enrichment_agent_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['parcel_lookup'::text, 'geocode'::text, 'owner_resolve'::text, 'flood'::text, 'census'::text]))),
    CONSTRAINT enrichment_agent_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'needs_human_review'::text])))
);


--
-- Name: enrichment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichment_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    processed_rows integer DEFAULT 0 NOT NULL,
    matched_rows integer DEFAULT 0 NOT NULL,
    addresses_charged integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: enrichment_misses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichment_misses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    attempted_at timestamp with time zone DEFAULT now(),
    source text NOT NULL,
    error_reason text,
    retry_count integer DEFAULT 0,
    next_retry_at timestamp with time zone
);


--
-- Name: enrichment_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichment_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jurisdiction text,
    county_fips text,
    state text,
    city text,
    source_name text,
    source_type text,
    source_url text,
    access_method text,
    rate_limit_notes text,
    terms_notes text,
    requires_human_review boolean DEFAULT false NOT NULL,
    status text DEFAULT 'unverified'::text NOT NULL,
    last_checked_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enrichment_sources_access_method_check CHECK (((access_method IS NULL) OR (access_method = ANY (ARRAY['manual'::text, 'api'::text, 'downloadable_file'::text, 'portal'::text, 'scrape_candidate'::text])))),
    CONSTRAINT enrichment_sources_source_type_check CHECK (((source_type IS NULL) OR (source_type = ANY (ARRAY['assessor'::text, 'parcel'::text, 'geocoder'::text, 'census'::text, 'flood'::text, 'public_record'::text])))),
    CONSTRAINT enrichment_sources_state_check CHECK (((state IS NULL) OR (length(state) = 2))),
    CONSTRAINT enrichment_sources_status_check CHECK ((status = ANY (ARRAY['unverified'::text, 'verified'::text, 'blocked'::text, 'deprecated'::text])))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    ts timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    user_id uuid,
    job_id uuid NOT NULL,
    payload jsonb
);


--
-- Name: export_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    state_filter text,
    city_filter text,
    row_count integer DEFAULT 0 NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb
);


--
-- Name: foia_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    target_id uuid NOT NULL,
    va_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: foia_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    invited_by uuid,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);


--
-- Name: foia_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'va'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT foia_profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'va'::text])))
);


--
-- Name: foia_request_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_request_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jurisdiction text,
    county_fips text,
    state text,
    city text,
    request_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    priority smallint DEFAULT 5 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    portal_url text,
    contact_email text,
    request_template text,
    request_body text,
    credential_id uuid,
    external_request_id text,
    sent_at timestamp with time zone,
    response_due_at timestamp with time zone,
    last_follow_up_at timestamp with time zone,
    idempotency_key text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT foia_request_jobs_request_type_check CHECK ((request_type = ANY (ARRAY['code_violations'::text, 'tax_delinquency'::text, 'water_shutoff'::text, 'liens'::text, 'permits'::text, 'other'::text]))),
    CONSTRAINT foia_request_jobs_state_check CHECK (((state IS NULL) OR (length(state) = 2))),
    CONSTRAINT foia_request_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'drafted'::text, 'sent'::text, 'waiting_response'::text, 'received'::text, 'failed'::text, 'needs_human_review'::text, 'completed'::text])))
);


--
-- Name: foia_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    county_id uuid,
    requested_by uuid NOT NULL,
    request_date date DEFAULT CURRENT_DATE NOT NULL,
    request_method text DEFAULT 'email'::text,
    data_years_requested text,
    status text DEFAULT 'pending'::text,
    response_date date,
    invoice_amount numeric(10,2),
    invoice_paid boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    target_id uuid,
    va_id uuid,
    press_account_id uuid,
    sent_at timestamp with time zone,
    response_received_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fulfillment_file_url text,
    fulfillment_received_at timestamp with time zone,
    data_quality_score integer,
    data_format text DEFAULT 'other'::text,
    is_snap_usable boolean DEFAULT false,
    parsed_status text DEFAULT 'raw'::text,
    fee_amount numeric,
    redaction_flag boolean DEFAULT false,
    estimated_row_count integer,
    email_used text,
    response_type text,
    upload_job_id uuid
);


--
-- Name: foia_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_job_id uuid NOT NULL,
    source text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    response_type text,
    attachment_url text,
    attachment_urls text[] DEFAULT '{}'::text[] NOT NULL,
    raw_text text,
    parsed_status text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    needs_human_review boolean DEFAULT false NOT NULL,
    classified_by_agent text,
    CONSTRAINT foia_responses_response_type_check CHECK (((response_type IS NULL) OR (response_type = ANY (ARRAY['email'::text, 'attachment'::text, 'portal_download'::text, 'link'::text, 'denial'::text, 'clarification'::text, 'invoice'::text, 'other'::text]))))
);


--
-- Name: foia_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jurisdiction text,
    state text,
    county text,
    city text,
    source_type text NOT NULL,
    portal_vendor text,
    source_url text,
    contact_email text,
    instructions text,
    requires_login boolean DEFAULT false NOT NULL,
    requires_captcha boolean DEFAULT false NOT NULL,
    automation_status text,
    commercial_use_allowed boolean DEFAULT true NOT NULL,
    last_verified_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT foia_sources_automation_status_check CHECK (((automation_status IS NULL) OR (automation_status = ANY (ARRAY['not_started'::text, 'automatable'::text, 'semi_automatable'::text, 'manual_only'::text, 'blocked'::text])))),
    CONSTRAINT foia_sources_portal_vendor_check CHECK (((portal_vendor IS NULL) OR (portal_vendor = ANY (ARRAY['NextRequest'::text, 'GovQA'::text, 'JustFOIA'::text, 'StreamlineGov'::text, 'Laserfiche'::text, 'CivicPlus'::text, 'Granicus'::text, 'unknown'::text])))),
    CONSTRAINT foia_sources_source_type_check CHECK ((source_type = ANY (ARRAY['email'::text, 'portal'::text, 'downloadable_file'::text, 'search_portal'::text, 'api'::text, 'manual'::text]))),
    CONSTRAINT foia_sources_state_check CHECK (((state IS NULL) OR (length(state) = 2)))
);


--
-- Name: foia_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foia_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    state text,
    template_text text NOT NULL,
    use_count integer DEFAULT 0,
    success_rate numeric(5,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: geocoding_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geocoding_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    total_properties integer DEFAULT 0 NOT NULL,
    geocoded_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    skipped_count integer DEFAULT 0 NOT NULL
);


--
-- Name: global_sms_suppression; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_sms_suppression (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    opted_out_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text DEFAULT 'STOP_keyword'::text NOT NULL,
    source_org_id uuid
);


--
-- Name: integration_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_action_log (
    id bigint NOT NULL,
    integration_id uuid,
    user_id uuid,
    action_type text NOT NULL,
    request_metadata jsonb,
    response_status integer,
    success boolean NOT NULL,
    error_code text,
    error_message text,
    cost_estimate_usd numeric(8,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_action_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_action_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_action_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_action_log_id_seq OWNED BY public.integration_action_log.id;


--
-- Name: jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisdictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    city text NOT NULL,
    county text,
    state text NOT NULL,
    default_zip_range text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    enforcement_profile jsonb DEFAULT '{"strictness": "unknown", "score_multiplier": 1.0, "avg_days_to_close": 0, "total_properties_cited": 0, "avg_violations_per_property": 0}'::jsonb,
    ai_summary text
);


--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    org_id uuid NOT NULL,
    actor_id uuid,
    activity_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_activities_activity_type_check CHECK ((activity_type = ANY (ARRAY['note'::text, 'call'::text, 'sms'::text, 'email'::text, 'stage_change'::text, 'distress_event'::text, 'assignment'::text, 'task'::text, 'system'::text])))
);


--
-- Name: lead_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    user_id uuid,
    status text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: lead_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: lead_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tag_assignments (
    lead_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    label text NOT NULL,
    color text DEFAULT '#64748b'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    property_id uuid NOT NULL,
    owner_id uuid,
    stage_id uuid NOT NULL,
    assigned_to uuid,
    created_by uuid NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    notes text,
    last_contacted_at timestamp with time zone,
    next_follow_up_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: list_enrichment_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_enrichment_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: list_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    list_id uuid,
    property_id uuid,
    added_at timestamp without time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: market_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    market_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone
);


--
-- Name: marketing_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    name text,
    company text,
    phone text,
    market text,
    source text,
    status text DEFAULT 'not_contacted'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    contacted_at timestamp with time zone,
    converted_at timestamp with time zone,
    revenue numeric(10,2),
    campaign_id text,
    persona text,
    last_engagement timestamp with time zone,
    engagement_score integer,
    next_follow_up timestamp with time zone,
    tags text[],
    custom_fields jsonb
);


--
-- Name: mcp_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_name text NOT NULL,
    api_key_hash text NOT NULL,
    api_key_prefix text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    rate_limit_per_minute integer DEFAULT 60 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    CONSTRAINT mcp_clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'suspended'::text])))
);


--
-- Name: mcp_proxy_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_proxy_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    operation text,
    caller_ip text,
    status_code integer,
    success boolean,
    error text,
    duration_ms integer,
    request_bytes integer
);


--
-- Name: mcp_tool_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tool_calls (
    id bigint NOT NULL,
    client_id uuid NOT NULL,
    tool_name text NOT NULL,
    operation text,
    caller_ip text,
    request_bytes integer,
    response_status integer NOT NULL,
    duration_ms integer,
    success boolean NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_tool_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mcp_tool_calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mcp_tool_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mcp_tool_calls_id_seq OWNED BY public.mcp_tool_calls.id;


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip text NOT NULL,
    latitude numeric(10,8),
    longitude numeric(11,8),
    snap_score integer,
    snap_insight text,
    photo_url text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    geom public.geometry(Point,4326),
    jurisdiction_id uuid,
    total_violations integer DEFAULT 0,
    open_violations integer DEFAULT 0,
    oldest_violation_date date,
    newest_violation_date date,
    avg_days_open integer DEFAULT 0,
    violation_types text[] DEFAULT '{}'::text[],
    repeat_offender boolean DEFAULT false,
    multi_department boolean DEFAULT false,
    escalated boolean DEFAULT false,
    distress_signals text[] DEFAULT '{}'::text[],
    opportunity_class text DEFAULT 'watch'::text,
    last_analyzed_at timestamp with time zone,
    scope text DEFAULT 'city'::text,
    county text,
    last_enforcement_date timestamp with time zone,
    enforcement_type text DEFAULT 'code_violation'::text NOT NULL,
    investor_insight_brief jsonb,
    street_number text,
    street_name text,
    beds integer,
    baths numeric(4,1),
    sqft integer,
    year_built integer,
    lot_size_sqft integer,
    enrichment_source text,
    enriched_at timestamp with time zone,
    CONSTRAINT properties_baths_check CHECK (((baths IS NULL) OR ((baths >= (0)::numeric) AND (baths <= (50)::numeric)))),
    CONSTRAINT properties_beds_check CHECK (((beds IS NULL) OR ((beds >= 0) AND (beds <= 50)))),
    CONSTRAINT properties_lot_size_check CHECK (((lot_size_sqft IS NULL) OR ((lot_size_sqft >= 0) AND (lot_size_sqft <= 100000000)))),
    CONSTRAINT properties_scope_check CHECK ((scope = ANY (ARRAY['city'::text, 'county'::text]))),
    CONSTRAINT properties_sqft_check CHECK (((sqft IS NULL) OR ((sqft >= 0) AND (sqft <= 1000000)))),
    CONSTRAINT properties_year_built_check CHECK (((year_built IS NULL) OR ((year_built >= 1700) AND (year_built <= ((EXTRACT(year FROM now()))::integer + 1)))))
);


--
-- Name: mv_distinct_cities; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_distinct_cities AS
 SELECT DISTINCT city,
    upper(state) AS state
   FROM public.properties
  WHERE ((city IS NOT NULL) AND (state IS NOT NULL) AND (length(state) = 2) AND (upper(state) ~ '^[A-Z]{2}$'::text) AND (city ~ '^[A-Z][a-zA-Z''\-]+([\s\-][A-Z]?[a-zA-Z''\-]+)*$'::text) AND ((length(city) >= 3) AND (length(city) <= 30)) AND (city !~ '#'::text) AND (city !~ '^\d'::text) AND (city !~ '\.'::text) AND (city !~ '\)'::text) AND (city !~ '\('::text) AND (city !~* '(violation|debris|trash|dump|truck|trailer|building|property|parked|stored|believe|constitute|address|moved|burning|tenant|sealed|attic|permission|county$|street|avenue|boulevard|highway)'::text) AND (city <> ALL (ARRAY['Unknown'::text, 'Additional'::text, 'Antonio'::text, 'Beach'::text, 'Llc'::text])))
  ORDER BY (upper(state)), city
  WITH NO DATA;


--
-- Name: mv_distinct_states; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_distinct_states AS
 SELECT DISTINCT state
   FROM public.properties
  WHERE ((state IS NOT NULL) AND (length(state) = 2) AND (state ~ '^[A-Z]{2}$'::text))
  ORDER BY state
  WITH NO DATA;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    credits integer DEFAULT 100,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    org_id uuid NOT NULL,
    name text,
    phones jsonb DEFAULT '[]'::jsonb,
    emails jsonb DEFAULT '[]'::jsonb,
    mailing_address text,
    confidence text,
    source text DEFAULT 'unknown'::text NOT NULL,
    raw_payload jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: parcel_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcel_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    beds numeric(3,1),
    baths numeric(3,1),
    building_sqft integer,
    lot_sqft integer,
    year_built integer,
    property_type text,
    assessed_value numeric(14,2),
    last_sale_date date,
    last_sale_amount numeric(14,2),
    owner_occupied boolean,
    owner_occupied_confidence numeric(3,2),
    flood_zone text,
    census_tract text,
    confidence_score numeric(3,2),
    verification_status text,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    enriched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parcel_attributes_confidence_score_check CHECK (((confidence_score IS NULL) OR ((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))),
    CONSTRAINT parcel_attributes_owner_occupied_confidence_check CHECK (((owner_occupied_confidence IS NULL) OR ((owner_occupied_confidence >= (0)::numeric) AND (owner_occupied_confidence <= (1)::numeric)))),
    CONSTRAINT parcel_attributes_property_type_check CHECK (((property_type IS NULL) OR (property_type = ANY (ARRAY['sfr'::text, 'condo'::text, 'multi'::text, 'land'::text, 'other'::text])))),
    CONSTRAINT parcel_attributes_verification_status_check CHECK (((verification_status IS NULL) OR (verification_status = ANY (ARRAY['verified'::text, 'estimated'::text, 'unknown'::text]))))
);


--
-- Name: pipeline_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_progress (
    run_key text NOT NULL,
    action text NOT NULL,
    state text,
    county text,
    city text,
    last_offset integer DEFAULT 0 NOT NULL,
    processed integer DEFAULT 0 NOT NULL,
    matched integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#64748b'::text NOT NULL,
    is_won boolean DEFAULT false NOT NULL,
    is_lost boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: press_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.press_accounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    domain text NOT NULL,
    email text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: press_rotation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.press_rotation (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    target_id uuid NOT NULL,
    press_account_id uuid NOT NULL,
    rotation_month text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    email text,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_beta_user boolean DEFAULT false NOT NULL,
    free_unlocks_remaining integer DEFAULT 3 NOT NULL,
    daily_view_count integer DEFAULT 0 NOT NULL,
    daily_view_reset_at timestamp with time zone DEFAULT now() NOT NULL,
    referred_by uuid
);


--
-- Name: property_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    name text,
    phone text,
    email text,
    source text,
    raw_payload jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mailing_address text
);


--
-- Name: property_enrichment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_enrichment_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    processed_rows integer DEFAULT 0 NOT NULL,
    matched_rows integer DEFAULT 0 NOT NULL,
    updated_rows integer DEFAULT 0 NOT NULL,
    unmatched_rows integer DEFAULT 0 NOT NULL,
    error_message text,
    unmatched_csv_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone
);


--
-- Name: rotation_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rotation_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    va_id uuid NOT NULL,
    old_press_account_id uuid,
    new_press_account_id uuid,
    targets_assigned integer DEFAULT 0 NOT NULL,
    reason text DEFAULT 'batch_complete'::text NOT NULL,
    acknowledged boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_on_new_violation boolean DEFAULT true NOT NULL,
    last_notified_at timestamp with time zone
);


--
-- Name: skiptrace_bulk_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skiptrace_bulk_items (
    run_id text NOT NULL,
    property_id uuid NOT NULL,
    status text,
    message text,
    duration_ms integer,
    CONSTRAINT skiptrace_bulk_items_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'success'::text, 'no_hit'::text, 'error'::text])))
);


--
-- Name: skiptrace_bulk_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skiptrace_bulk_runs (
    run_id text NOT NULL,
    user_id uuid NOT NULL,
    list_id uuid,
    total integer NOT NULL,
    queued integer DEFAULT 0 NOT NULL,
    succeeded integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    settings jsonb NOT NULL
);


--
-- Name: skiptrace_consent_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skiptrace_consent_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ip_hash text NOT NULL,
    user_agent text,
    consented_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skiptrace_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skiptrace_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_ids uuid[] NOT NULL,
    vendor text DEFAULT 'BatchData'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    counts jsonb DEFAULT '{"total": 0, "failed": 0, "succeeded": 0}'::jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    job_key text
);


--
-- Name: skiptrace_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skiptrace_outcomes (
    job_id uuid NOT NULL,
    property_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT skiptrace_outcomes_status_check CHECK ((status = ANY (ARRAY['success'::text, 'no_match'::text, 'vendor_error'::text, 'timeout'::text])))
);


--
-- Name: sms_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    org_id uuid NOT NULL,
    direction text NOT NULL,
    body text NOT NULL,
    twilio_sid text,
    status text DEFAULT 'queued'::text NOT NULL,
    error_code text,
    cost_cents integer,
    drip_enrollment_id uuid,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_messages_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text])))
);


--
-- Name: sms_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sms_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    lead_id uuid,
    property_id uuid,
    from_number text NOT NULL,
    to_number text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    last_message_preview text,
    unread_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_threads_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'closed'::text])))
);


--
-- Name: staging_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staging_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    county_id uuid,
    uploaded_by uuid,
    file_name text NOT NULL,
    total_rows integer,
    processed_rows integer DEFAULT 0,
    failed_rows integer DEFAULT 0,
    status text DEFAULT 'pending'::text,
    error_messages jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    description text,
    price_monthly_cents integer DEFAULT 0 NOT NULL,
    price_annual_cents integer DEFAULT 0 NOT NULL,
    max_monthly_exports integer DEFAULT 0 NOT NULL,
    max_counties integer DEFAULT 0 NOT NULL,
    max_user_seats integer DEFAULT 1 NOT NULL,
    max_skip_traces_per_month integer DEFAULT 0 NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    has_advanced_filters boolean DEFAULT false NOT NULL,
    has_violation_filtering boolean DEFAULT false NOT NULL,
    has_rolling_intelligence boolean DEFAULT false NOT NULL,
    has_escalation_alerts boolean DEFAULT false NOT NULL,
    has_api_access boolean DEFAULT false NOT NULL,
    has_dedicated_manager boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_states integer DEFAULT 5,
    data_tier text DEFAULT 'basic'::text NOT NULL,
    stripe_price_id text
);


--
-- Name: subscription_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    exports_count integer DEFAULT 0 NOT NULL,
    skip_traces_count integer DEFAULT 0 NOT NULL,
    api_calls_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppressed_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppressed_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])))
);


--
-- Name: suppression_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppression_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text,
    email text,
    reason text NOT NULL,
    added_by uuid,
    org_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.targets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    jurisdiction_name text NOT NULL,
    state text NOT NULL,
    county text,
    population integer,
    target_type text NOT NULL,
    foia_url text,
    url_hash text,
    source_file text,
    is_duplicate boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    portal_difficulty_score integer,
    contact_email text,
    submission_method text,
    notes text,
    contact_value text,
    credential_to_use text,
    CONSTRAINT targets_target_type_check CHECK ((target_type = ANY (ARRAY['county_foia'::text, 'city_foia'::text, 'water_shutoff'::text, 'population_list'::text])))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_payment_intent_id text,
    amount integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: unlocked_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unlocked_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    unlocked_at timestamp with time zone DEFAULT now() NOT NULL,
    credit_cost integer DEFAULT 1 NOT NULL,
    unlock_source text NOT NULL,
    CONSTRAINT unlocked_properties_unlock_source_check CHECK ((unlock_source = ANY (ARRAY['free_credit'::text, 'paid_unlock'::text, 'subscription'::text, 'credit_pack'::text])))
);


--
-- Name: upload_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    county_id uuid,
    uploaded_by uuid,
    file_name text NOT NULL,
    row_count integer,
    upload_date timestamp with time zone DEFAULT now(),
    status text NOT NULL,
    error_message text
);


--
-- Name: upload_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    file_size integer NOT NULL,
    total_rows integer,
    processed_rows integer DEFAULT 0,
    properties_created integer DEFAULT 0,
    violations_created integer DEFAULT 0,
    status text DEFAULT 'QUEUED'::text,
    error_message text,
    warnings jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    jurisdiction_id uuid,
    city text,
    county text,
    state text,
    scope text DEFAULT 'city'::text,
    bad_addresses integer DEFAULT 0,
    bad_address_samples jsonb DEFAULT '[]'::jsonb,
    properties_matched integer DEFAULT 0,
    source_type text DEFAULT 'code_violation'::text,
    violations_updated integer DEFAULT 0,
    CONSTRAINT upload_jobs_scope_check CHECK ((scope = ANY (ARRAY['city'::text, 'county'::text]))),
    CONSTRAINT upload_jobs_status_check CHECK ((status = ANY (ARRAY['QUEUED'::text, 'PARSING'::text, 'PROCESSING'::text, 'DEDUPING'::text, 'CREATING_VIOLATIONS'::text, 'FINALIZING'::text, 'COMPLETE'::text, 'FAILED'::text])))
);


--
-- Name: upload_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_staging (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    row_num integer NOT NULL,
    case_id text,
    address text NOT NULL,
    city text,
    state text,
    zip text,
    violation text NOT NULL,
    status text,
    opened_date date,
    last_updated date,
    property_id uuid,
    processed boolean DEFAULT false,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    jurisdiction_id uuid,
    raw_description text
);


--
-- Name: user_activation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    page_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid,
    alert_type text DEFAULT 'new_violation'::text NOT NULL,
    title text NOT NULL,
    body text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_allowed_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_allowed_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    service_name text NOT NULL,
    vault_secret_id uuid NOT NULL,
    display_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_validated_at timestamp with time zone,
    validation_failure_count integer DEFAULT 0 NOT NULL,
    daily_spend_cap_usd numeric(8,2),
    daily_spend_used_usd numeric(8,2) DEFAULT 0 NOT NULL,
    daily_spend_reset_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_integrations_service_name_check CHECK ((service_name = ANY (ARRAY['twilio'::text, 'telnyx'::text, 'batchdata'::text, 'tracerfy'::text, 'skipgenie'::text, 'gohighlevel'::text, 'hubspot'::text, 'podio'::text, 'resimpli'::text, 'zapier_webhook'::text]))),
    CONSTRAINT user_integrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invalid'::text, 'expired'::text, 'rate_limited'::text, 'disabled'::text])))
);


--
-- Name: user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    role public.app_role NOT NULL,
    token text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    accepted_at timestamp with time zone,
    status text DEFAULT 'pending'::text,
    CONSTRAINT user_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text])))
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credits integer DEFAULT 10 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    consented_skiptrace boolean DEFAULT false,
    onboarding_completed boolean DEFAULT false
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    status text DEFAULT 'active'::text NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_started_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    trial_tier text,
    trial_exports_used integer DEFAULT 0,
    trial_exports_limit integer DEFAULT 50,
    CONSTRAINT chk_trial_tier CHECK (((trial_tier IS NULL) OR (trial_tier = ANY (ARRAY['starter'::text, 'professional'::text, 'enterprise'::text])))),
    CONSTRAINT user_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'cancelled'::text, 'unpaid'::text, 'trialing'::text])))
);


--
-- Name: v_customer_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_customer_overview WITH (security_invoker='true') AS
 SELECT p.user_id,
    p.email,
    p.full_name,
    p.created_at AS signup_date,
    p.is_beta_user,
    p.free_unlocks_remaining,
    us.status AS subscription_status,
    us.stripe_customer_id,
    us.stripe_subscription_id,
    us.current_period_start,
    us.current_period_end,
    us.trial_started_at,
    us.trial_ends_at,
    us.trial_tier,
    sp.display_name AS plan_name,
    sp.price_monthly_cents,
    COALESCE(t.total_revenue, (0)::bigint) AS total_revenue_cents,
    COALESCE(t.transaction_count, (0)::bigint) AS transaction_count,
    t.last_transaction_at
   FROM (((public.profiles p
     LEFT JOIN public.user_subscriptions us ON ((us.user_id = p.user_id)))
     LEFT JOIN public.subscription_plans sp ON ((sp.id = us.plan_id)))
     LEFT JOIN LATERAL ( SELECT sum(tx.amount) AS total_revenue,
            count(*) AS transaction_count,
            max(tx.created_at) AS last_transaction_at
           FROM public.transactions tx
          WHERE ((tx.user_id = p.user_id) AND (tx.status = 'succeeded'::text))) t ON (true));


--
-- Name: v_enrichment_coverage_by_county; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_enrichment_coverage_by_county WITH (security_invoker='true') AS
 SELECT p.state,
    p.county,
    (count(*))::integer AS total_properties,
    (count(pa.id))::integer AS enriched_properties,
    round(((100.0 * (count(pa.id))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS coverage_pct
   FROM (public.properties p
     LEFT JOIN public.parcel_attributes pa ON ((pa.property_id = p.id)))
  WHERE (p.county IS NOT NULL)
  GROUP BY p.state, p.county;


--
-- Name: v_enrichment_queue_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_enrichment_queue_health WITH (security_invoker='true') AS
 SELECT status,
    (count(*))::integer AS job_count,
    min(created_at) FILTER (WHERE (status = 'pending'::text)) AS oldest_pending_at,
    (EXTRACT(epoch FROM (now() - min(created_at) FILTER (WHERE (status = 'pending'::text)))))::integer AS oldest_pending_age_seconds
   FROM public.enrichment_agent_jobs
  GROUP BY status;


--
-- Name: v_failed_jobs_last_24h; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_failed_jobs_last_24h WITH (security_invoker='true') AS
 SELECT 'enrichment'::text AS domain,
    (enrichment_agent_jobs.id)::text AS job_id,
    enrichment_agent_jobs.job_type AS job_subtype,
    enrichment_agent_jobs.status,
    enrichment_agent_jobs.retry_count,
    enrichment_agent_jobs.error_message,
    enrichment_agent_jobs.created_at,
    enrichment_agent_jobs.updated_at
   FROM public.enrichment_agent_jobs
  WHERE ((enrichment_agent_jobs.status = 'failed'::text) AND (enrichment_agent_jobs.updated_at > (now() - '24:00:00'::interval)))
UNION ALL
 SELECT 'foia'::text AS domain,
    (foia_request_jobs.id)::text AS job_id,
    foia_request_jobs.request_type AS job_subtype,
    foia_request_jobs.status,
    foia_request_jobs.retry_count,
    foia_request_jobs.error_message,
    foia_request_jobs.created_at,
    foia_request_jobs.updated_at
   FROM public.foia_request_jobs
  WHERE ((foia_request_jobs.status = 'failed'::text) AND (foia_request_jobs.updated_at > (now() - '24:00:00'::interval)));


--
-- Name: v_foia_queue_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_foia_queue_health WITH (security_invoker='true') AS
 SELECT status,
    (count(*))::integer AS job_count,
    min(created_at) FILTER (WHERE (status = ANY (ARRAY['pending'::text, 'drafted'::text]))) AS oldest_pending_at,
    (EXTRACT(epoch FROM (now() - min(created_at) FILTER (WHERE (status = ANY (ARRAY['pending'::text, 'drafted'::text]))))))::integer AS oldest_pending_age_seconds
   FROM public.foia_request_jobs
  GROUP BY status;


--
-- Name: v_hot_properties; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_hot_properties WITH (security_invoker='true') AS
 SELECT id,
    address,
    city,
    state,
    snap_score,
    snap_insight,
    total_violations,
    oldest_violation_date,
    escalated,
    multi_department,
    distress_signals
   FROM public.properties
  WHERE (snap_score >= 70)
  ORDER BY snap_score DESC;


--
-- Name: v_jurisdiction_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_jurisdiction_stats WITH (security_invoker='true') AS
 SELECT j.id AS jurisdiction_id,
    j.name AS jurisdiction_name,
    j.city,
    j.state,
    j.enforcement_profile,
    count(p.id) AS property_count,
    avg(p.snap_score) AS avg_score,
    count(
        CASE
            WHEN (p.snap_score >= 70) THEN 1
            ELSE NULL::integer
        END) AS distressed_count
   FROM (public.jurisdictions j
     LEFT JOIN public.properties p ON ((p.jurisdiction_id = j.id)))
  GROUP BY j.id, j.name, j.city, j.state, j.enforcement_profile;


--
-- Name: v_jurisdictions_needing_verification; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_jurisdictions_needing_verification WITH (security_invoker='true') AS
 SELECT registry,
    id,
    state,
    jurisdiction,
    city,
    source_name,
    source_type,
    status,
    last_checked_at,
    notes
   FROM ( SELECT 'enrichment'::text AS registry,
            enrichment_sources.id,
            enrichment_sources.state,
            enrichment_sources.jurisdiction,
            enrichment_sources.city,
            enrichment_sources.source_name,
            enrichment_sources.source_type,
            enrichment_sources.status,
            enrichment_sources.last_checked_at,
            enrichment_sources.notes
           FROM public.enrichment_sources
          WHERE ((enrichment_sources.status = 'unverified'::text) OR (enrichment_sources.last_checked_at IS NULL))
        UNION ALL
         SELECT 'foia'::text AS registry,
            foia_sources.id,
            foia_sources.state,
            foia_sources.jurisdiction,
            foia_sources.city,
            NULL::text AS source_name,
            foia_sources.source_type,
                CASE
                    WHEN (foia_sources.last_verified_at IS NULL) THEN 'unverified'::text
                    ELSE 'verified'::text
                END AS status,
            foia_sources.last_verified_at AS last_checked_at,
            foia_sources.notes
           FROM public.foia_sources
          WHERE (foia_sources.last_verified_at IS NULL)) sub
  ORDER BY last_checked_at NULLS FIRST;


--
-- Name: v_needs_human_review_queue; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_needs_human_review_queue WITH (security_invoker='true') AS
 SELECT domain,
    job_id,
    job_subtype,
    jurisdiction,
    state,
    error_message,
    created_at,
    updated_at
   FROM ( SELECT 'enrichment'::text AS domain,
            (enrichment_agent_jobs.id)::text AS job_id,
            enrichment_agent_jobs.job_type AS job_subtype,
            NULL::text AS jurisdiction,
            NULL::text AS state,
            enrichment_agent_jobs.error_message,
            enrichment_agent_jobs.created_at,
            enrichment_agent_jobs.updated_at
           FROM public.enrichment_agent_jobs
          WHERE (enrichment_agent_jobs.status = 'needs_human_review'::text)
        UNION ALL
         SELECT 'foia'::text AS domain,
            (foia_request_jobs.id)::text AS id,
            foia_request_jobs.request_type,
            foia_request_jobs.jurisdiction,
            foia_request_jobs.state,
            foia_request_jobs.error_message,
            foia_request_jobs.created_at,
            foia_request_jobs.updated_at
           FROM public.foia_request_jobs
          WHERE (foia_request_jobs.status = 'needs_human_review'::text)) sub
  ORDER BY created_at;


--
-- Name: v_opportunity_funnel; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_opportunity_funnel WITH (security_invoker='true') AS
 SELECT opportunity_class,
    count(*) AS property_count,
    avg(snap_score) AS avg_score
   FROM public.properties
  GROUP BY opportunity_class;


--
-- Name: v_property_contact_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_property_contact_stats WITH (security_invoker='true') AS
 SELECT property_id,
    count(*) AS contact_rows,
    count(phone) AS phones_found,
    count(email) AS emails_found
   FROM public.property_contacts
  GROUP BY property_id;


--
-- Name: v_recent_agent_runs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_recent_agent_runs WITH (security_invoker='true') AS
 SELECT id,
    agent_name,
    job_table,
    job_id,
    status,
    input_summary,
    output_summary,
    error_message,
    duration_ms,
    tokens_used,
    cost_usd,
    created_at
   FROM public.agent_runs
  ORDER BY created_at DESC
 LIMIT 100;


--
-- Name: v_stale_jurisdictions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_stale_jurisdictions WITH (security_invoker='true') AS
 WITH last_response_per_jurisdiction AS (
         SELECT j.state,
            j.jurisdiction,
            max(r.received_at) AS last_response_at
           FROM (public.foia_responses r
             JOIN public.foia_request_jobs j ON ((j.id = r.request_job_id)))
          GROUP BY j.state, j.jurisdiction
        )
 SELECT s.id AS source_id,
    s.state,
    s.jurisdiction,
    s.county,
    s.city,
    s.source_type,
    s.portal_vendor,
    l.last_response_at,
        CASE
            WHEN (l.last_response_at IS NULL) THEN NULL::numeric
            ELSE ((EXTRACT(epoch FROM (now() - l.last_response_at)) / 86400.0))::numeric(10,2)
        END AS days_since_last_response
   FROM (public.foia_sources s
     LEFT JOIN last_response_per_jurisdiction l ON (((l.state = s.state) AND (l.jurisdiction = s.jurisdiction))))
  WHERE ((l.last_response_at IS NULL) OR (l.last_response_at < (now() - '90 days'::interval)));


--
-- Name: v_user_credits; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_user_credits WITH (security_invoker='true') AS
 SELECT user_id,
    (COALESCE(sum(delta), (0)::bigint))::integer AS balance
   FROM public.credit_ledger
  GROUP BY user_id;


--
-- Name: va_credential_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.va_credential_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    va_id uuid NOT NULL,
    press_account_id uuid NOT NULL,
    slot_number integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    batch_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    case_id text,
    violation_type text NOT NULL,
    description text,
    status text NOT NULL,
    opened_date date,
    last_updated date,
    days_open integer,
    created_at timestamp without time zone DEFAULT now(),
    raw_description text,
    first_seen_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    status_changed_at timestamp with time zone,
    previous_status text,
    closed_at date
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb
);


--
-- Name: agent_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs ALTER COLUMN id SET DEFAULT nextval('public.agent_runs_id_seq'::regclass);


--
-- Name: integration_action_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_action_log ALTER COLUMN id SET DEFAULT nextval('public.integration_action_log_id_seq'::regclass);


--
-- Name: mcp_tool_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_calls ALTER COLUMN id SET DEFAULT nextval('public.mcp_tool_calls_id_seq'::regclass);


--
-- Name: affiliate_commissions affiliate_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_commissions
    ADD CONSTRAINT affiliate_commissions_pkey PRIMARY KEY (id);


--
-- Name: affiliate_referrals affiliate_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_referrals
    ADD CONSTRAINT affiliate_referrals_pkey PRIMARY KEY (id);


--
-- Name: affiliate_referrals affiliate_referrals_referred_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_referrals
    ADD CONSTRAINT affiliate_referrals_referred_user_id_key UNIQUE (referred_user_id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: beta_waitlist beta_waitlist_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_waitlist
    ADD CONSTRAINT beta_waitlist_email_key UNIQUE (email);


--
-- Name: beta_waitlist beta_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_waitlist
    ADD CONSTRAINT beta_waitlist_pkey PRIMARY KEY (id);


--
-- Name: buyer_purchases buyer_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_purchases
    ADD CONSTRAINT buyer_purchases_pkey PRIMARY KEY (id);


--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);


--
-- Name: campaign_leads campaign_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_pkey PRIMARY KEY (id);


--
-- Name: cash_buyers cash_buyers_normalized_name_primary_county_fips_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_buyers
    ADD CONSTRAINT cash_buyers_normalized_name_primary_county_fips_key UNIQUE (normalized_name, primary_county_fips);


--
-- Name: cash_buyers cash_buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_buyers
    ADD CONSTRAINT cash_buyers_pkey PRIMARY KEY (id);


--
-- Name: census_places census_places_name_state_abbr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.census_places
    ADD CONSTRAINT census_places_name_state_abbr_key UNIQUE (name, state_abbr);


--
-- Name: census_places census_places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.census_places
    ADD CONSTRAINT census_places_pkey PRIMARY KEY (id);


--
-- Name: clean_leads clean_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_leads
    ADD CONSTRAINT clean_leads_pkey PRIMARY KEY (id);


--
-- Name: counties counties_county_name_state_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counties
    ADD CONSTRAINT counties_county_name_state_key UNIQUE (county_name, state);


--
-- Name: counties counties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counties
    ADD CONSTRAINT counties_pkey PRIMARY KEY (id);


--
-- Name: credential_target_cooldown credential_target_cooldown_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_target_cooldown
    ADD CONSTRAINT credential_target_cooldown_pkey PRIMARY KEY (id);


--
-- Name: credential_target_cooldown credential_target_cooldown_press_account_id_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_target_cooldown
    ADD CONSTRAINT credential_target_cooldown_press_account_id_target_id_key UNIQUE (press_account_id, target_id);


--
-- Name: credit_ledger credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: credit_ledger_skiptrace credit_ledger_skiptrace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger_skiptrace
    ADD CONSTRAINT credit_ledger_skiptrace_pkey PRIMARY KEY (id);


--
-- Name: distress_events distress_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distress_events
    ADD CONSTRAINT distress_events_pkey PRIMARY KEY (id);


--
-- Name: drip_enrollments drip_enrollments_lead_id_sequence_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_enrollments
    ADD CONSTRAINT drip_enrollments_lead_id_sequence_id_key UNIQUE (lead_id, sequence_id);


--
-- Name: drip_enrollments drip_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_enrollments
    ADD CONSTRAINT drip_enrollments_pkey PRIMARY KEY (id);


--
-- Name: drip_sequences drip_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_sequences
    ADD CONSTRAINT drip_sequences_pkey PRIMARY KEY (id);


--
-- Name: drip_steps drip_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_steps
    ADD CONSTRAINT drip_steps_pkey PRIMARY KEY (id);


--
-- Name: drip_steps drip_steps_sequence_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_steps
    ADD CONSTRAINT drip_steps_sequence_id_step_order_key UNIQUE (sequence_id, step_order);


--
-- Name: email_analytics email_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_analytics
    ADD CONSTRAINT email_analytics_pkey PRIMARY KEY (id);


--
-- Name: email_preferences email_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_preferences
    ADD CONSTRAINT email_preferences_pkey PRIMARY KEY (id);


--
-- Name: email_preferences email_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_preferences
    ADD CONSTRAINT email_preferences_user_id_key UNIQUE (user_id);


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);


--
-- Name: email_send_state email_send_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_state
    ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);


--
-- Name: enrichment_agent_jobs enrichment_agent_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_agent_jobs
    ADD CONSTRAINT enrichment_agent_jobs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: enrichment_agent_jobs enrichment_agent_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_agent_jobs
    ADD CONSTRAINT enrichment_agent_jobs_pkey PRIMARY KEY (id);


--
-- Name: enrichment_jobs enrichment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_pkey PRIMARY KEY (id);


--
-- Name: enrichment_misses enrichment_misses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_misses
    ADD CONSTRAINT enrichment_misses_pkey PRIMARY KEY (id);


--
-- Name: enrichment_sources enrichment_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_sources
    ADD CONSTRAINT enrichment_sources_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (job_id, ts, type);


--
-- Name: export_logs export_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_logs
    ADD CONSTRAINT export_logs_pkey PRIMARY KEY (id);


--
-- Name: foia_assignments foia_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_assignments
    ADD CONSTRAINT foia_assignments_pkey PRIMARY KEY (id);


--
-- Name: foia_invites foia_invites_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_invites
    ADD CONSTRAINT foia_invites_email_key UNIQUE (email);


--
-- Name: foia_invites foia_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_invites
    ADD CONSTRAINT foia_invites_pkey PRIMARY KEY (id);


--
-- Name: foia_invites foia_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_invites
    ADD CONSTRAINT foia_invites_token_key UNIQUE (token);


--
-- Name: foia_profiles foia_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_profiles
    ADD CONSTRAINT foia_profiles_pkey PRIMARY KEY (id);


--
-- Name: foia_request_jobs foia_request_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_request_jobs
    ADD CONSTRAINT foia_request_jobs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: foia_request_jobs foia_request_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_request_jobs
    ADD CONSTRAINT foia_request_jobs_pkey PRIMARY KEY (id);


--
-- Name: foia_requests foia_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_requests
    ADD CONSTRAINT foia_requests_pkey PRIMARY KEY (id);


--
-- Name: foia_requests foia_requests_target_id_va_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_requests
    ADD CONSTRAINT foia_requests_target_id_va_id_key UNIQUE (target_id, va_id);


--
-- Name: foia_responses foia_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_responses
    ADD CONSTRAINT foia_responses_pkey PRIMARY KEY (id);


--
-- Name: foia_sources foia_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_sources
    ADD CONSTRAINT foia_sources_pkey PRIMARY KEY (id);


--
-- Name: foia_templates foia_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_templates
    ADD CONSTRAINT foia_templates_pkey PRIMARY KEY (id);


--
-- Name: geocoding_jobs geocoding_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geocoding_jobs
    ADD CONSTRAINT geocoding_jobs_pkey PRIMARY KEY (id);


--
-- Name: global_sms_suppression global_sms_suppression_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_sms_suppression
    ADD CONSTRAINT global_sms_suppression_phone_number_key UNIQUE (phone_number);


--
-- Name: global_sms_suppression global_sms_suppression_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_sms_suppression
    ADD CONSTRAINT global_sms_suppression_pkey PRIMARY KEY (id);


--
-- Name: integration_action_log integration_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_action_log
    ADD CONSTRAINT integration_action_log_pkey PRIMARY KEY (id);


--
-- Name: jurisdictions jurisdictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT jurisdictions_pkey PRIMARY KEY (id);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: lead_activity lead_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activity
    ADD CONSTRAINT lead_activity_pkey PRIMARY KEY (id);


--
-- Name: lead_lists lead_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_lists
    ADD CONSTRAINT lead_lists_pkey PRIMARY KEY (id);


--
-- Name: lead_tag_assignments lead_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_pkey PRIMARY KEY (lead_id, tag_id);


--
-- Name: lead_tags lead_tags_org_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_org_id_label_key UNIQUE (org_id, label);


--
-- Name: lead_tags lead_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_pkey PRIMARY KEY (id);


--
-- Name: leads leads_org_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_org_id_property_id_key UNIQUE (org_id, property_id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: list_enrichment_waitlist list_enrichment_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_enrichment_waitlist
    ADD CONSTRAINT list_enrichment_waitlist_pkey PRIMARY KEY (id);


--
-- Name: list_properties list_properties_list_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_properties
    ADD CONSTRAINT list_properties_list_id_property_id_key UNIQUE (list_id, property_id);


--
-- Name: list_properties list_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_properties
    ADD CONSTRAINT list_properties_pkey PRIMARY KEY (id);


--
-- Name: market_requests market_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_requests
    ADD CONSTRAINT market_requests_pkey PRIMARY KEY (id);


--
-- Name: marketing_leads marketing_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_pkey PRIMARY KEY (id);


--
-- Name: mcp_clients mcp_clients_api_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_clients
    ADD CONSTRAINT mcp_clients_api_key_hash_key UNIQUE (api_key_hash);


--
-- Name: mcp_clients mcp_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_clients
    ADD CONSTRAINT mcp_clients_pkey PRIMARY KEY (id);


--
-- Name: mcp_proxy_log mcp_proxy_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_proxy_log
    ADD CONSTRAINT mcp_proxy_log_pkey PRIMARY KEY (id);


--
-- Name: mcp_tool_calls mcp_tool_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: owners owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owners
    ADD CONSTRAINT owners_pkey PRIMARY KEY (id);


--
-- Name: parcel_attributes parcel_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_attributes
    ADD CONSTRAINT parcel_attributes_pkey PRIMARY KEY (id);


--
-- Name: pipeline_progress pipeline_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_progress
    ADD CONSTRAINT pipeline_progress_pkey PRIMARY KEY (run_key);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: press_accounts press_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_accounts
    ADD CONSTRAINT press_accounts_pkey PRIMARY KEY (id);


--
-- Name: press_rotation press_rotation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_rotation
    ADD CONSTRAINT press_rotation_pkey PRIMARY KEY (id);


--
-- Name: press_rotation press_rotation_target_id_rotation_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_rotation
    ADD CONSTRAINT press_rotation_target_id_rotation_month_key UNIQUE (target_id, rotation_month);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_contacts property_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contacts
    ADD CONSTRAINT property_contacts_pkey PRIMARY KEY (id);


--
-- Name: property_enrichment_jobs property_enrichment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_enrichment_jobs
    ADD CONSTRAINT property_enrichment_jobs_pkey PRIMARY KEY (id);


--
-- Name: rotation_alerts rotation_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotation_alerts
    ADD CONSTRAINT rotation_alerts_pkey PRIMARY KEY (id);


--
-- Name: saved_properties saved_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_properties
    ADD CONSTRAINT saved_properties_pkey PRIMARY KEY (id);


--
-- Name: saved_properties saved_properties_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_properties
    ADD CONSTRAINT saved_properties_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: skiptrace_bulk_items skiptrace_bulk_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_bulk_items
    ADD CONSTRAINT skiptrace_bulk_items_pkey PRIMARY KEY (run_id, property_id);


--
-- Name: skiptrace_bulk_runs skiptrace_bulk_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_bulk_runs
    ADD CONSTRAINT skiptrace_bulk_runs_pkey PRIMARY KEY (run_id);


--
-- Name: skiptrace_consent_log skiptrace_consent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_consent_log
    ADD CONSTRAINT skiptrace_consent_log_pkey PRIMARY KEY (id);


--
-- Name: skiptrace_jobs skiptrace_jobs_job_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_jobs
    ADD CONSTRAINT skiptrace_jobs_job_key_key UNIQUE (job_key);


--
-- Name: skiptrace_jobs skiptrace_jobs_job_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_jobs
    ADD CONSTRAINT skiptrace_jobs_job_key_unique UNIQUE (job_key);


--
-- Name: skiptrace_jobs skiptrace_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_jobs
    ADD CONSTRAINT skiptrace_jobs_pkey PRIMARY KEY (id);


--
-- Name: skiptrace_outcomes skiptrace_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_outcomes
    ADD CONSTRAINT skiptrace_outcomes_pkey PRIMARY KEY (job_id, property_id);


--
-- Name: sms_messages sms_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_pkey PRIMARY KEY (id);


--
-- Name: sms_messages sms_messages_twilio_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_twilio_sid_key UNIQUE (twilio_sid);


--
-- Name: sms_templates sms_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_templates
    ADD CONSTRAINT sms_templates_pkey PRIMARY KEY (id);


--
-- Name: sms_threads sms_threads_org_id_from_number_to_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_threads
    ADD CONSTRAINT sms_threads_org_id_from_number_to_number_key UNIQUE (org_id, from_number, to_number);


--
-- Name: sms_threads sms_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_threads
    ADD CONSTRAINT sms_threads_pkey PRIMARY KEY (id);


--
-- Name: staging_uploads staging_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staging_uploads
    ADD CONSTRAINT staging_uploads_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_name_key UNIQUE (name);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscription_usage subscription_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_pkey PRIMARY KEY (id);


--
-- Name: suppressed_emails suppressed_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppressed_emails
    ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);


--
-- Name: suppressed_emails suppressed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppressed_emails
    ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);


--
-- Name: suppression_list suppression_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppression_list
    ADD CONSTRAINT suppression_list_pkey PRIMARY KEY (id);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);


--
-- Name: targets targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_pkey PRIMARY KEY (id);


--
-- Name: targets targets_url_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_url_hash_key UNIQUE (url_hash);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: enrichment_sources uniq_enrichment_sources_natural_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_sources
    ADD CONSTRAINT uniq_enrichment_sources_natural_key UNIQUE (state, jurisdiction, source_name, source_type);


--
-- Name: foia_sources uniq_foia_sources_natural_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_sources
    ADD CONSTRAINT uniq_foia_sources_natural_key UNIQUE (state, jurisdiction, source_type, portal_vendor);


--
-- Name: parcel_attributes uniq_parcel_attributes_property_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_attributes
    ADD CONSTRAINT uniq_parcel_attributes_property_id UNIQUE (property_id);


--
-- Name: subscription_usage unique_user_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT unique_user_period UNIQUE (user_id, period_start);


--
-- Name: unlocked_properties unlocked_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unlocked_properties
    ADD CONSTRAINT unlocked_properties_pkey PRIMARY KEY (id);


--
-- Name: upload_history upload_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_history
    ADD CONSTRAINT upload_history_pkey PRIMARY KEY (id);


--
-- Name: upload_jobs upload_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_jobs
    ADD CONSTRAINT upload_jobs_pkey PRIMARY KEY (id);


--
-- Name: upload_staging upload_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_staging
    ADD CONSTRAINT upload_staging_pkey PRIMARY KEY (id);


--
-- Name: skiptrace_jobs uq_skiptrace_jobs_job_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_jobs
    ADD CONSTRAINT uq_skiptrace_jobs_job_key UNIQUE (job_key);


--
-- Name: user_activation_events user_activation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_events
    ADD CONSTRAINT user_activation_events_pkey PRIMARY KEY (id);


--
-- Name: user_activity_log user_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_pkey PRIMARY KEY (id);


--
-- Name: user_alerts user_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_alerts
    ADD CONSTRAINT user_alerts_pkey PRIMARY KEY (id);


--
-- Name: user_allowed_states user_allowed_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_allowed_states
    ADD CONSTRAINT user_allowed_states_pkey PRIMARY KEY (id);


--
-- Name: user_allowed_states user_allowed_states_user_id_state_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_allowed_states
    ADD CONSTRAINT user_allowed_states_user_id_state_key UNIQUE (user_id, state);


--
-- Name: user_integrations user_integrations_org_id_service_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_org_id_service_name_key UNIQUE (org_id, service_name);


--
-- Name: user_integrations user_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);


--
-- Name: user_invitations user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);


--
-- Name: user_invitations user_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_token_key UNIQUE (token);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: va_credential_slots va_credential_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.va_credential_slots
    ADD CONSTRAINT va_credential_slots_pkey PRIMARY KEY (id);


--
-- Name: va_credential_slots va_credential_slots_va_id_press_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.va_credential_slots
    ADD CONSTRAINT va_credential_slots_va_id_press_account_id_key UNIQUE (va_id, press_account_id);


--
-- Name: va_credential_slots va_credential_slots_va_id_slot_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.va_credential_slots
    ADD CONSTRAINT va_credential_slots_va_id_slot_number_key UNIQUE (va_id, slot_number);


--
-- Name: violations violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_pkey PRIMARY KEY (id);


--
-- Name: webhook_errors webhook_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_errors
    ADD CONSTRAINT webhook_errors_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: buyer_purchases_buyer_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_purchases_buyer_date_idx ON public.buyer_purchases USING btree (buyer_id, sale_date DESC);


--
-- Name: buyer_purchases_parcel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_purchases_parcel_idx ON public.buyer_purchases USING btree (parcel_id);


--
-- Name: buyer_purchases_zip_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_purchases_zip_date_idx ON public.buyer_purchases USING btree (zip, sale_date DESC);


--
-- Name: cash_buyers_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_buyers_pending_idx ON public.cash_buyers USING btree (inbiz_resolution_status) WHERE (inbiz_resolution_status = 'pending'::text);


--
-- Name: cash_buyers_purchases_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_buyers_purchases_idx ON public.cash_buyers USING btree (total_purchases DESC);


--
-- Name: cash_buyers_tier_lastbuy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_buyers_tier_lastbuy_idx ON public.cash_buyers USING btree (buyer_tier, last_buy_date DESC NULLS LAST);


--
-- Name: cash_buyers_zips_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_buyers_zips_idx ON public.cash_buyers USING gin (active_zips);


--
-- Name: enrichment_misses_next_retry_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrichment_misses_next_retry_at_idx ON public.enrichment_misses USING btree (next_retry_at) WHERE (next_retry_at IS NOT NULL);


--
-- Name: enrichment_misses_property_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrichment_misses_property_id_idx ON public.enrichment_misses USING btree (property_id);


--
-- Name: idx_activation_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activation_user_event ON public.user_activation_events USING btree (user_id, event_type, occurred_at DESC);


--
-- Name: idx_affiliate_referrals_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_referrals_referrer ON public.affiliate_referrals USING btree (referrer_id);


--
-- Name: idx_agent_runs_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_agent_created ON public.agent_runs USING btree (agent_name, created_at DESC);


--
-- Name: idx_agent_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_created_at ON public.agent_runs USING btree (created_at DESC);


--
-- Name: idx_agent_runs_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_job ON public.agent_runs USING btree (job_table, job_id);


--
-- Name: idx_agent_runs_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_status_created ON public.agent_runs USING btree (created_at DESC) WHERE (status = ANY (ARRAY['failed'::text, 'needs_review'::text]));


--
-- Name: idx_campaign_leads_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_leads_assigned ON public.campaign_leads USING btree (assigned_to);


--
-- Name: idx_campaign_leads_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_leads_property ON public.campaign_leads USING btree (property_id);


--
-- Name: idx_campaign_leads_snap_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_leads_snap_score ON public.campaign_leads USING btree (snap_score DESC);


--
-- Name: idx_campaign_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_leads_status ON public.campaign_leads USING btree (status);


--
-- Name: idx_consent_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_user ON public.skiptrace_consent_log USING btree (user_id, consented_at);


--
-- Name: idx_cooldown_credential_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooldown_credential_target ON public.credential_target_cooldown USING btree (press_account_id, target_id);


--
-- Name: idx_cooldown_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cooldown_used_at ON public.credential_target_cooldown USING btree (used_at);


--
-- Name: idx_counties_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counties_assigned ON public.counties USING btree (assigned_to);


--
-- Name: idx_counties_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counties_assigned_to ON public.counties USING btree (assigned_to);


--
-- Name: idx_counties_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counties_state ON public.counties USING btree (state);


--
-- Name: idx_counties_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counties_status ON public.counties USING btree (foia_status);


--
-- Name: idx_credit_ledger_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_created_at ON public.credit_ledger USING btree (created_at DESC);


--
-- Name: idx_credit_ledger_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_job ON public.credit_ledger_skiptrace USING btree (job_id);


--
-- Name: idx_credit_ledger_skiptrace_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_skiptrace_user_id ON public.credit_ledger_skiptrace USING btree (user_id);


--
-- Name: idx_credit_ledger_unique_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_credit_ledger_unique_session ON public.credit_ledger USING btree (((meta ->> 'stripe_session_id'::text))) WHERE ((meta ->> 'stripe_session_id'::text) IS NOT NULL);


--
-- Name: idx_credit_ledger_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_user ON public.credit_ledger_skiptrace USING btree (user_id);


--
-- Name: idx_credit_ledger_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_user_created ON public.credit_ledger USING btree (user_id, created_at DESC);


--
-- Name: idx_credit_ledger_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_user_id ON public.credit_ledger USING btree (user_id);


--
-- Name: idx_distress_events_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distress_events_detected ON public.distress_events USING btree (detected_at DESC);


--
-- Name: idx_distress_events_property_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distress_events_property_detected ON public.distress_events USING btree (property_id, detected_at DESC);


--
-- Name: idx_distress_events_type_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distress_events_type_severity ON public.distress_events USING btree (event_type, severity);


--
-- Name: idx_drip_enrollments_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drip_enrollments_due ON public.drip_enrollments USING btree (next_run_at) WHERE (status = 'active'::text);


--
-- Name: idx_drip_enrollments_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drip_enrollments_lead ON public.drip_enrollments USING btree (lead_id);


--
-- Name: idx_drip_enrollments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drip_enrollments_org ON public.drip_enrollments USING btree (org_id);


--
-- Name: idx_drip_sequences_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drip_sequences_org ON public.drip_sequences USING btree (org_id);


--
-- Name: idx_drip_steps_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drip_steps_sequence ON public.drip_steps USING btree (sequence_id, step_order);


--
-- Name: idx_email_analytics_user_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_analytics_user_sent ON public.email_analytics USING btree (user_id, sent_at DESC);


--
-- Name: idx_email_preferences_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_preferences_digest ON public.email_preferences USING btree (weekly_digest_enabled, digest_day, digest_hour);


--
-- Name: idx_email_send_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);


--
-- Name: idx_email_send_log_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_message ON public.email_send_log USING btree (message_id);


--
-- Name: idx_email_send_log_message_sent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);


--
-- Name: idx_email_send_log_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);


--
-- Name: idx_enrichment_agent_jobs_dequeue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_agent_jobs_dequeue ON public.enrichment_agent_jobs USING btree (status, priority DESC, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'needs_human_review'::text]));


--
-- Name: idx_enrichment_agent_jobs_locked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_agent_jobs_locked ON public.enrichment_agent_jobs USING btree (locked_at) WHERE (locked_at IS NOT NULL);


--
-- Name: idx_enrichment_agent_jobs_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_agent_jobs_property_id ON public.enrichment_agent_jobs USING btree (property_id);


--
-- Name: idx_enrichment_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_jobs_status ON public.property_enrichment_jobs USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_enrichment_jobs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_jobs_user ON public.property_enrichment_jobs USING btree (user_id, created_at DESC);


--
-- Name: idx_enrichment_sources_state_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_sources_state_jurisdiction ON public.enrichment_sources USING btree (state, jurisdiction);


--
-- Name: idx_enrichment_sources_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_sources_status ON public.enrichment_sources USING btree (status);


--
-- Name: idx_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at DESC);


--
-- Name: idx_error_logs_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_resolved ON public.error_logs USING btree (resolved, created_at DESC);


--
-- Name: idx_events_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_job ON public.events USING btree (job_id, ts);


--
-- Name: idx_export_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_logs_created_at ON public.export_logs USING btree (created_at DESC);


--
-- Name: idx_export_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_logs_user_id ON public.export_logs USING btree (user_id);


--
-- Name: idx_foia_assignments_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_assignments_target_id ON public.foia_assignments USING btree (target_id);


--
-- Name: idx_foia_assignments_va_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_assignments_va_id ON public.foia_assignments USING btree (va_id);


--
-- Name: idx_foia_request_jobs_credential; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_request_jobs_credential ON public.foia_request_jobs USING btree (credential_id) WHERE (credential_id IS NOT NULL);


--
-- Name: idx_foia_request_jobs_dequeue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_request_jobs_dequeue ON public.foia_request_jobs USING btree (status, priority DESC, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'drafted'::text, 'waiting_response'::text, 'needs_human_review'::text]));


--
-- Name: idx_foia_request_jobs_response_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_request_jobs_response_due ON public.foia_request_jobs USING btree (response_due_at) WHERE (status = 'waiting_response'::text);


--
-- Name: idx_foia_request_jobs_state_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_request_jobs_state_jurisdiction ON public.foia_request_jobs USING btree (state, jurisdiction);


--
-- Name: idx_foia_requests_county; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_county ON public.foia_requests USING btree (county_id);


--
-- Name: idx_foia_requests_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_date ON public.foia_requests USING btree (request_date);


--
-- Name: idx_foia_requests_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_requested_by ON public.foia_requests USING btree (requested_by);


--
-- Name: idx_foia_requests_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_sent_at ON public.foia_requests USING btree (sent_at);


--
-- Name: idx_foia_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_status ON public.foia_requests USING btree (status);


--
-- Name: idx_foia_requests_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_target_id ON public.foia_requests USING btree (target_id);


--
-- Name: idx_foia_requests_va_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_requests_va_id ON public.foia_requests USING btree (va_id);


--
-- Name: idx_foia_responses_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_responses_needs_review ON public.foia_responses USING btree (received_at DESC) WHERE (needs_human_review = true);


--
-- Name: idx_foia_responses_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_responses_received_at ON public.foia_responses USING btree (received_at DESC);


--
-- Name: idx_foia_responses_request_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_responses_request_job_id ON public.foia_responses USING btree (request_job_id);


--
-- Name: idx_foia_sources_automation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_sources_automation_status ON public.foia_sources USING btree (automation_status);


--
-- Name: idx_foia_sources_last_verified_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_sources_last_verified_at ON public.foia_sources USING btree (last_verified_at DESC);


--
-- Name: idx_foia_sources_state_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foia_sources_state_jurisdiction ON public.foia_sources USING btree (state, jurisdiction);


--
-- Name: idx_geocoding_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geocoding_jobs_status ON public.geocoding_jobs USING btree (status);


--
-- Name: idx_geocoding_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geocoding_jobs_user_id ON public.geocoding_jobs USING btree (user_id);


--
-- Name: idx_global_sms_suppression_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_sms_suppression_phone ON public.global_sms_suppression USING btree (phone_number);


--
-- Name: idx_iaction_log_integration_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iaction_log_integration_created ON public.integration_action_log USING btree (integration_id, created_at DESC);


--
-- Name: idx_iaction_log_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iaction_log_user_created ON public.integration_action_log USING btree (user_id, created_at DESC);


--
-- Name: idx_jobs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_user ON public.skiptrace_jobs USING btree (user_id);


--
-- Name: idx_lead_activities_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_activities_lead ON public.lead_activities USING btree (lead_id, created_at DESC);


--
-- Name: idx_lead_activities_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_activities_org ON public.lead_activities USING btree (org_id, created_at DESC);


--
-- Name: idx_lead_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_activities_type ON public.lead_activities USING btree (activity_type);


--
-- Name: idx_lead_lists_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_lists_user_id ON public.lead_lists USING btree (user_id);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned_to ON public.leads USING btree (assigned_to);


--
-- Name: idx_leads_next_follow_up; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_next_follow_up ON public.leads USING btree (next_follow_up_at) WHERE (next_follow_up_at IS NOT NULL);


--
-- Name: idx_leads_org_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_org_stage ON public.leads USING btree (org_id, stage_id);


--
-- Name: idx_leads_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_priority ON public.leads USING btree (org_id, priority DESC);


--
-- Name: idx_leads_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_property ON public.leads USING btree (property_id);


--
-- Name: idx_list_properties_list_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_properties_list_id ON public.list_properties USING btree (list_id);


--
-- Name: idx_list_properties_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_properties_property_id ON public.list_properties USING btree (property_id);


--
-- Name: idx_marketing_leads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_leads_created_at ON public.marketing_leads USING btree (created_at);


--
-- Name: idx_marketing_leads_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_leads_email ON public.marketing_leads USING btree (email);


--
-- Name: idx_marketing_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_leads_status ON public.marketing_leads USING btree (status);


--
-- Name: idx_mcp_clients_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_clients_active ON public.mcp_clients USING btree (status) WHERE (status = 'active'::text);


--
-- Name: idx_mcp_proxy_log_op_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_proxy_log_op_ts ON public.mcp_proxy_log USING btree (operation, ts DESC);


--
-- Name: idx_mcp_proxy_log_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_proxy_log_ts ON public.mcp_proxy_log USING btree (ts DESC);


--
-- Name: idx_mcp_tool_calls_client_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_client_ts ON public.mcp_tool_calls USING btree (client_id, created_at DESC);


--
-- Name: idx_mcp_tool_calls_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_tool_calls_ts ON public.mcp_tool_calls USING btree (created_at DESC);


--
-- Name: idx_mv_cities_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_cities_city ON public.mv_distinct_cities USING btree (city);


--
-- Name: idx_mv_cities_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_cities_state ON public.mv_distinct_cities USING btree (state);


--
-- Name: idx_mv_states; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_states ON public.mv_distinct_states USING btree (state);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_outcomes_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outcomes_job ON public.skiptrace_outcomes USING btree (job_id, status);


--
-- Name: idx_owners_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_owners_org_created ON public.owners USING btree (org_id, created_at DESC);


--
-- Name: idx_owners_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_owners_property_id ON public.owners USING btree (property_id);


--
-- Name: idx_parcel_attributes_enriched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcel_attributes_enriched_at ON public.parcel_attributes USING btree (enriched_at DESC NULLS LAST);


--
-- Name: idx_parcel_attributes_verification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcel_attributes_verification_status ON public.parcel_attributes USING btree (verification_status);


--
-- Name: idx_pipeline_stages_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_stages_org ON public.pipeline_stages USING btree (org_id, sort_order);


--
-- Name: idx_press_rotation_press_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_press_rotation_press_account_id ON public.press_rotation USING btree (press_account_id);


--
-- Name: idx_press_rotation_rotation_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_press_rotation_rotation_month ON public.press_rotation USING btree (rotation_month);


--
-- Name: idx_press_rotation_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_press_rotation_target_id ON public.press_rotation USING btree (target_id);


--
-- Name: idx_profiles_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_org_id ON public.profiles USING btree (org_id);


--
-- Name: idx_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);


--
-- Name: idx_properties_address_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_address_city ON public.properties USING btree (lower(address), lower(city));


--
-- Name: idx_properties_address_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_address_trgm ON public.properties USING gin (address public.gin_trgm_ops);


--
-- Name: idx_properties_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_city ON public.properties USING btree (city);


--
-- Name: idx_properties_city_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_city_lower ON public.properties USING btree (lower(city));


--
-- Name: idx_properties_city_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_city_state ON public.properties USING btree (city, state);


--
-- Name: idx_properties_county; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_county ON public.properties USING btree (county);


--
-- Name: idx_properties_county_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_county_state ON public.properties USING btree (county, state);


--
-- Name: idx_properties_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_created_at ON public.properties USING btree (created_at DESC);


--
-- Name: idx_properties_enforcement_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_enforcement_type ON public.properties USING btree (enforcement_type);


--
-- Name: idx_properties_enriched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_enriched_at ON public.properties USING btree (enriched_at) WHERE (enriched_at IS NOT NULL);


--
-- Name: idx_properties_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_geom ON public.properties USING gist (geom);


--
-- Name: idx_properties_insight_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_insight_model ON public.properties USING btree (((investor_insight_brief ->> 'model'::text)));


--
-- Name: idx_properties_investor_insight_brief; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_investor_insight_brief ON public.properties USING gin (investor_insight_brief);


--
-- Name: idx_properties_jurisdiction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_jurisdiction_id ON public.properties USING btree (jurisdiction_id);


--
-- Name: idx_properties_jurisdiction_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_jurisdiction_score ON public.properties USING btree (jurisdiction_id, snap_score DESC);


--
-- Name: idx_properties_last_enforcement_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_last_enforcement_date ON public.properties USING btree (last_enforcement_date DESC NULLS LAST);


--
-- Name: idx_properties_missing_insight_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_missing_insight_priority ON public.properties USING btree (snap_score DESC NULLS LAST, id) WHERE (snap_insight IS NULL);


--
-- Name: idx_properties_open_violations; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_open_violations ON public.properties USING btree (open_violations) WHERE (open_violations > 0);


--
-- Name: idx_properties_opportunity_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_opportunity_class ON public.properties USING btree (opportunity_class);


--
-- Name: idx_properties_repeat_offender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_repeat_offender ON public.properties USING btree (repeat_offender) WHERE (repeat_offender = true);


--
-- Name: idx_properties_snap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_snap ON public.properties USING btree (snap_score);


--
-- Name: idx_properties_snap_insight_null; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_snap_insight_null ON public.properties USING btree (id) WHERE (snap_insight IS NULL);


--
-- Name: idx_properties_snap_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_snap_score ON public.properties USING btree (snap_score);


--
-- Name: idx_properties_snap_score_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_snap_score_desc ON public.properties USING btree (snap_score DESC NULLS LAST);


--
-- Name: idx_properties_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_state ON public.properties USING btree (state);


--
-- Name: idx_properties_state_city_snap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_state_city_snap ON public.properties USING btree (state, city, snap_score DESC NULLS LAST);


--
-- Name: idx_properties_state_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_state_lower ON public.properties USING btree (lower(state));


--
-- Name: idx_properties_state_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_state_score ON public.properties USING btree (state, snap_score DESC NULLS LAST);


--
-- Name: idx_properties_state_upper; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_state_upper ON public.properties USING btree (upper(state));


--
-- Name: idx_properties_total_violations; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_total_violations ON public.properties USING btree (total_violations) WHERE (total_violations > 0);


--
-- Name: idx_properties_unique_address; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_properties_unique_address ON public.properties USING btree (lower(TRIM(BOTH FROM address)), lower(TRIM(BOTH FROM city)), lower(TRIM(BOTH FROM state)), lower(TRIM(BOTH FROM zip))) WHERE ((address IS NOT NULL) AND (city IS NOT NULL) AND (state IS NOT NULL) AND (zip IS NOT NULL));


--
-- Name: idx_properties_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_updated_at ON public.properties USING btree (updated_at);


--
-- Name: idx_properties_upper_state_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_upper_state_city ON public.properties USING btree (upper(state), city);


--
-- Name: idx_properties_violation_types_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_violation_types_gin ON public.properties USING gin (violation_types);


--
-- Name: idx_property_contacts_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_contacts_created_by ON public.property_contacts USING btree (created_by);


--
-- Name: idx_property_contacts_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_contacts_property ON public.property_contacts USING btree (property_id);


--
-- Name: idx_property_contacts_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_contacts_property_id ON public.property_contacts USING btree (property_id);


--
-- Name: idx_rotation_alerts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rotation_alerts_created ON public.rotation_alerts USING btree (created_at DESC);


--
-- Name: idx_saved_properties_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_properties_property_id ON public.saved_properties USING btree (property_id);


--
-- Name: idx_saved_properties_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_properties_user_id ON public.saved_properties USING btree (user_id);


--
-- Name: idx_skiptrace_jobs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skiptrace_jobs_created ON public.skiptrace_jobs USING btree (created_at DESC);


--
-- Name: idx_skiptrace_jobs_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skiptrace_jobs_key ON public.skiptrace_jobs USING btree (job_key);


--
-- Name: idx_skiptrace_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skiptrace_jobs_status ON public.skiptrace_jobs USING btree (status) WHERE (status = ANY (ARRAY['queued'::text, 'processing'::text]));


--
-- Name: idx_skiptrace_jobs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skiptrace_jobs_user_created ON public.skiptrace_jobs USING btree (user_id, created_at DESC);


--
-- Name: idx_skiptrace_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skiptrace_jobs_user_id ON public.skiptrace_jobs USING btree (user_id);


--
-- Name: idx_skiptrace_jobs_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skiptrace_jobs_user_status ON public.skiptrace_jobs USING btree (user_id, status);


--
-- Name: idx_sms_messages_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_messages_org ON public.sms_messages USING btree (org_id, sent_at DESC);


--
-- Name: idx_sms_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_messages_thread ON public.sms_messages USING btree (thread_id, sent_at DESC);


--
-- Name: idx_sms_threads_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_threads_lead ON public.sms_threads USING btree (lead_id);


--
-- Name: idx_sms_threads_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_threads_org ON public.sms_threads USING btree (org_id, updated_at DESC);


--
-- Name: idx_sms_threads_to_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_threads_to_number ON public.sms_threads USING btree (org_id, to_number);


--
-- Name: idx_subscription_usage_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_usage_period ON public.subscription_usage USING btree (period_start, period_end);


--
-- Name: idx_subscription_usage_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_usage_user_id ON public.subscription_usage USING btree (user_id);


--
-- Name: idx_subscription_usage_user_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_usage_user_period ON public.subscription_usage USING btree (user_id, period_start);


--
-- Name: idx_suppressed_emails_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);


--
-- Name: idx_suppression_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppression_email ON public.suppression_list USING btree (email);


--
-- Name: idx_suppression_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppression_phone ON public.suppression_list USING btree (phone_number);


--
-- Name: idx_system_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_logs_created_at ON public.system_logs USING btree (created_at DESC);


--
-- Name: idx_system_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_logs_type ON public.system_logs USING btree (type);


--
-- Name: idx_targets_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_targets_state ON public.targets USING btree (state);


--
-- Name: idx_targets_target_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_targets_target_type ON public.targets USING btree (target_type);


--
-- Name: idx_targets_url_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_targets_url_hash ON public.targets USING btree (url_hash);


--
-- Name: idx_transactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);


--
-- Name: idx_unlocked_properties_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unlocked_properties_property ON public.unlocked_properties USING btree (property_id);


--
-- Name: idx_unlocked_properties_user_property; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unlocked_properties_user_property ON public.unlocked_properties USING btree (user_id, property_id);


--
-- Name: idx_unsubscribe_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);


--
-- Name: idx_upload_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_jobs_created_at ON public.upload_jobs USING btree (created_at DESC);


--
-- Name: idx_upload_jobs_jurisdiction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_jobs_jurisdiction_id ON public.upload_jobs USING btree (jurisdiction_id);


--
-- Name: idx_upload_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_jobs_status ON public.upload_jobs USING btree (status);


--
-- Name: idx_upload_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_jobs_user_id ON public.upload_jobs USING btree (user_id);


--
-- Name: idx_upload_staging_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_staging_job_id ON public.upload_staging USING btree (job_id);


--
-- Name: idx_upload_staging_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_staging_processed ON public.upload_staging USING btree (processed);


--
-- Name: idx_user_activity_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_created_at ON public.user_activity_log USING btree (created_at DESC);


--
-- Name: idx_user_activity_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_user_id ON public.user_activity_log USING btree (user_id);


--
-- Name: idx_user_alerts_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_alerts_unread ON public.user_alerts USING btree (user_id) WHERE (is_read = false);


--
-- Name: idx_user_alerts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_alerts_user_id ON public.user_alerts USING btree (user_id, created_at DESC);


--
-- Name: idx_user_allowed_states_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_allowed_states_state ON public.user_allowed_states USING btree (state);


--
-- Name: idx_user_allowed_states_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_allowed_states_user_id ON public.user_allowed_states USING btree (user_id);


--
-- Name: idx_user_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_email ON public.user_invitations USING btree (email);


--
-- Name: idx_user_invitations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_status ON public.user_invitations USING btree (status);


--
-- Name: idx_user_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_token ON public.user_invitations USING btree (token);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_user_subscriptions_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_plan_id ON public.user_subscriptions USING btree (plan_id);


--
-- Name: idx_user_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions USING btree (status);


--
-- Name: idx_user_subscriptions_stripe_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_stripe_sub ON public.user_subscriptions USING btree (stripe_subscription_id);


--
-- Name: idx_user_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions USING btree (user_id);


--
-- Name: idx_va_credential_slots_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_va_credential_slots_active ON public.va_credential_slots USING btree (va_id, is_active);


--
-- Name: idx_violations_opened_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_opened_date ON public.violations USING btree (opened_date DESC NULLS LAST);


--
-- Name: idx_violations_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_property ON public.violations USING btree (property_id);


--
-- Name: idx_violations_property_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_property_case ON public.violations USING btree (property_id, case_id);


--
-- Name: idx_violations_property_case_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_property_case_lookup ON public.violations USING btree (property_id, case_id) WHERE (case_id IS NOT NULL);


--
-- Name: idx_violations_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_property_id ON public.violations USING btree (property_id);


--
-- Name: idx_violations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_status ON public.violations USING btree (status);


--
-- Name: idx_violations_violation_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_violation_type ON public.violations USING btree (violation_type);


--
-- Name: idx_webhook_errors_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_errors_created_at ON public.webhook_errors USING btree (created_at DESC);


--
-- Name: idx_webhook_errors_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_errors_resolved ON public.webhook_errors USING btree (resolved);


--
-- Name: idx_webhook_events_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_event_id ON public.webhook_events USING btree (event_id);


--
-- Name: idx_webhook_events_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_processed_at ON public.webhook_events USING btree (processed_at);


--
-- Name: one_active_subscription_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_active_subscription_per_user ON public.user_subscriptions USING btree (user_id) WHERE (status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text]));


--
-- Name: uniq_ledger_job_prop_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ledger_job_prop_reason ON public.credit_ledger USING btree (user_id, job_id_extracted, property_id_extracted, reason) WHERE ((job_id_extracted IS NOT NULL) AND (property_id_extracted IS NOT NULL));


--
-- Name: uniq_property_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_property_email ON public.property_contacts USING btree (property_id, email) WHERE (email IS NOT NULL);


--
-- Name: uniq_property_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_property_phone ON public.property_contacts USING btree (property_id, phone) WHERE (phone IS NOT NULL);


--
-- Name: unique_active_subscription_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_active_subscription_per_user ON public.user_subscriptions USING btree (user_id) WHERE (status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text]));


--
-- Name: unique_non_cancelled_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_non_cancelled_subscription ON public.user_subscriptions USING btree (user_id) WHERE (status <> 'cancelled'::text);


--
-- Name: uq_foia_assignments_target; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_foia_assignments_target ON public.foia_assignments USING btree (target_id);


--
-- Name: uq_foia_requests_target_va; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_foia_requests_target_va ON public.foia_requests USING btree (target_id, va_id) WHERE ((target_id IS NOT NULL) AND (va_id IS NOT NULL));


--
-- Name: ux_owners_property_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_owners_property_source ON public.owners USING btree (property_id, source);


--
-- Name: violations_property_case_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX violations_property_case_unique ON public.violations USING btree (property_id, case_id) WHERE ((property_id IS NOT NULL) AND (case_id IS NOT NULL));


--
-- Name: distress_events distress_event_auto_enroll; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER distress_event_auto_enroll AFTER INSERT ON public.distress_events FOR EACH ROW EXECUTE FUNCTION public.trg_distress_event_enroll();


--
-- Name: foia_requests foia_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER foia_requests_updated_at BEFORE UPDATE ON public.foia_requests FOR EACH ROW EXECUTE FUNCTION public.update_foia_requests_updated_at();


--
-- Name: leads lead_stage_change_auto_enroll; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_stage_change_auto_enroll AFTER INSERT OR UPDATE OF stage_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trg_lead_stage_change_enroll();


--
-- Name: drip_enrollments tg_drip_enrollments_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_drip_enrollments_updated BEFORE UPDATE ON public.drip_enrollments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: drip_sequences tg_drip_sequences_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_drip_sequences_updated BEFORE UPDATE ON public.drip_sequences FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: sms_threads tg_sms_threads_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_sms_threads_updated BEFORE UPDATE ON public.sms_threads FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: enrichment_agent_jobs trg_enrichment_agent_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enrichment_agent_jobs_updated_at BEFORE UPDATE ON public.enrichment_agent_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: enrichment_sources trg_enrichment_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enrichment_sources_updated_at BEFORE UPDATE ON public.enrichment_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: foia_request_jobs trg_foia_request_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_foia_request_jobs_updated_at BEFORE UPDATE ON public.foia_request_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: foia_responses trg_foia_responses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_foia_responses_updated_at BEFORE UPDATE ON public.foia_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: foia_sources trg_foia_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_foia_sources_updated_at BEFORE UPDATE ON public.foia_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads trg_leads_log_stage_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_log_stage_change AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_lead_stage_change();


--
-- Name: leads trg_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: violations trg_log_new_violation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_new_violation AFTER INSERT ON public.violations FOR EACH ROW EXECUTE FUNCTION public.fn_log_new_violation();


--
-- Name: properties trg_log_snapscore_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_snapscore_change AFTER UPDATE OF snap_score ON public.properties FOR EACH ROW WHEN ((old.snap_score IS DISTINCT FROM new.snap_score)) EXECUTE FUNCTION public.fn_log_snapscore_change();


--
-- Name: violations trg_notify_saved_property_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_saved_property_users AFTER INSERT ON public.violations FOR EACH ROW EXECUTE FUNCTION public.notify_saved_property_users();


--
-- Name: organizations trg_orgs_seed_pipeline_stages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orgs_seed_pipeline_stages AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_new_org_pipeline_stages();


--
-- Name: owners trg_owners_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_owners_updated_at BEFORE UPDATE ON public.owners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: parcel_attributes trg_parcel_attributes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_parcel_attributes_updated_at BEFORE UPDATE ON public.parcel_attributes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pipeline_stages trg_pipeline_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: violations trg_sync_violation_types; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_violation_types AFTER INSERT OR DELETE OR UPDATE ON public.violations FOR EACH ROW EXECUTE FUNCTION public.sync_property_violation_types();


--
-- Name: properties trg_update_properties_geom; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_properties_geom BEFORE INSERT OR UPDATE OF latitude, longitude ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_properties_geom();


--
-- Name: user_integrations trg_user_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_integrations_updated_at BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campaign_leads update_campaign_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campaign_leads_updated_at BEFORE UPDATE ON public.campaign_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cash_buyers update_cash_buyers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cash_buyers_updated_at BEFORE UPDATE ON public.cash_buyers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_preferences update_email_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_preferences_updated_at BEFORE UPDATE ON public.email_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sms_templates update_sms_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sms_templates_updated_at BEFORE UPDATE ON public.sms_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription_plans update_subscription_plans_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_subscription_plans_timestamp BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_subscription_timestamp();


--
-- Name: subscription_usage update_subscription_usage_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_subscription_usage_timestamp BEFORE UPDATE ON public.subscription_usage FOR EACH ROW EXECUTE FUNCTION public.update_subscription_timestamp();


--
-- Name: user_subscriptions update_user_subscriptions_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_subscriptions_timestamp BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_subscription_timestamp();


--
-- Name: affiliate_commissions affiliate_commissions_referral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_commissions
    ADD CONSTRAINT affiliate_commissions_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE;


--
-- Name: affiliate_commissions affiliate_commissions_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_commissions
    ADD CONSTRAINT affiliate_commissions_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: buyer_purchases buyer_purchases_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_purchases
    ADD CONSTRAINT buyer_purchases_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.cash_buyers(id) ON DELETE CASCADE;


--
-- Name: call_logs call_logs_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: campaign_leads campaign_leads_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: clean_leads clean_leads_county_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_leads
    ADD CONSTRAINT clean_leads_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id) ON DELETE SET NULL;


--
-- Name: clean_leads clean_leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_leads
    ADD CONSTRAINT clean_leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: clean_leads clean_leads_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clean_leads
    ADD CONSTRAINT clean_leads_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: counties counties_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counties
    ADD CONSTRAINT counties_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);


--
-- Name: credential_target_cooldown credential_target_cooldown_press_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_target_cooldown
    ADD CONSTRAINT credential_target_cooldown_press_account_id_fkey FOREIGN KEY (press_account_id) REFERENCES public.press_accounts(id) ON DELETE CASCADE;


--
-- Name: credential_target_cooldown credential_target_cooldown_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_target_cooldown
    ADD CONSTRAINT credential_target_cooldown_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id) ON DELETE CASCADE;


--
-- Name: credit_ledger_skiptrace credit_ledger_skiptrace_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger_skiptrace
    ADD CONSTRAINT credit_ledger_skiptrace_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.skiptrace_jobs(id) ON DELETE SET NULL;


--
-- Name: credit_ledger_skiptrace credit_ledger_skiptrace_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger_skiptrace
    ADD CONSTRAINT credit_ledger_skiptrace_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: distress_events distress_events_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distress_events
    ADD CONSTRAINT distress_events_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: drip_enrollments drip_enrollments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_enrollments
    ADD CONSTRAINT drip_enrollments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: drip_enrollments drip_enrollments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_enrollments
    ADD CONSTRAINT drip_enrollments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: drip_enrollments drip_enrollments_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_enrollments
    ADD CONSTRAINT drip_enrollments_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.drip_sequences(id) ON DELETE CASCADE;


--
-- Name: drip_sequences drip_sequences_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_sequences
    ADD CONSTRAINT drip_sequences_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: drip_steps drip_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drip_steps
    ADD CONSTRAINT drip_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.drip_sequences(id) ON DELETE CASCADE;


--
-- Name: enrichment_agent_jobs enrichment_agent_jobs_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_agent_jobs
    ADD CONSTRAINT enrichment_agent_jobs_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: enrichment_misses enrichment_misses_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_misses
    ADD CONSTRAINT enrichment_misses_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: export_logs export_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_logs
    ADD CONSTRAINT export_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: foia_assignments foia_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_assignments
    ADD CONSTRAINT foia_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.foia_profiles(id);


--
-- Name: foia_assignments foia_assignments_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_assignments
    ADD CONSTRAINT foia_assignments_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id) ON DELETE CASCADE;


--
-- Name: foia_assignments foia_assignments_va_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_assignments
    ADD CONSTRAINT foia_assignments_va_id_fkey FOREIGN KEY (va_id) REFERENCES public.foia_profiles(id) ON DELETE CASCADE;


--
-- Name: foia_invites foia_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_invites
    ADD CONSTRAINT foia_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: foia_profiles foia_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_profiles
    ADD CONSTRAINT foia_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: foia_requests foia_requests_county_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_requests
    ADD CONSTRAINT foia_requests_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id) ON DELETE SET NULL;


--
-- Name: foia_requests foia_requests_press_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_requests
    ADD CONSTRAINT foia_requests_press_account_id_fkey FOREIGN KEY (press_account_id) REFERENCES public.press_accounts(id) ON DELETE SET NULL;


--
-- Name: foia_requests foia_requests_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_requests
    ADD CONSTRAINT foia_requests_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id) ON DELETE CASCADE;


--
-- Name: foia_requests foia_requests_va_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_requests
    ADD CONSTRAINT foia_requests_va_id_fkey FOREIGN KEY (va_id) REFERENCES public.foia_profiles(id) ON DELETE CASCADE;


--
-- Name: foia_responses foia_responses_request_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foia_responses
    ADD CONSTRAINT foia_responses_request_job_id_fkey FOREIGN KEY (request_job_id) REFERENCES public.foia_request_jobs(id) ON DELETE CASCADE;


--
-- Name: integration_action_log integration_action_log_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_action_log
    ADD CONSTRAINT integration_action_log_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.user_integrations(id) ON DELETE CASCADE;


--
-- Name: integration_action_log integration_action_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_action_log
    ADD CONSTRAINT integration_action_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_activities lead_activities_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_activity lead_activity_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activity
    ADD CONSTRAINT lead_activity_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: lead_tag_assignments lead_tag_assignments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_tag_assignments lead_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.lead_tags(id) ON DELETE CASCADE;


--
-- Name: lead_tags lead_tags_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leads leads_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leads leads_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.owners(id) ON DELETE SET NULL;


--
-- Name: leads leads_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: leads leads_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT;


--
-- Name: list_properties list_properties_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_properties
    ADD CONSTRAINT list_properties_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lead_lists(id) ON DELETE CASCADE;


--
-- Name: list_properties list_properties_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_properties
    ADD CONSTRAINT list_properties_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: mcp_tool_calls mcp_tool_calls_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.mcp_clients(id) ON DELETE RESTRICT;


--
-- Name: owners owners_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owners
    ADD CONSTRAINT owners_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: owners owners_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owners
    ADD CONSTRAINT owners_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: parcel_attributes parcel_attributes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_attributes
    ADD CONSTRAINT parcel_attributes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: press_rotation press_rotation_press_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_rotation
    ADD CONSTRAINT press_rotation_press_account_id_fkey FOREIGN KEY (press_account_id) REFERENCES public.press_accounts(id) ON DELETE CASCADE;


--
-- Name: press_rotation press_rotation_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_rotation
    ADD CONSTRAINT press_rotation_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: properties properties_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id) ON DELETE SET NULL;


--
-- Name: property_contacts property_contacts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contacts
    ADD CONSTRAINT property_contacts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: rotation_alerts rotation_alerts_new_press_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotation_alerts
    ADD CONSTRAINT rotation_alerts_new_press_account_id_fkey FOREIGN KEY (new_press_account_id) REFERENCES public.press_accounts(id);


--
-- Name: rotation_alerts rotation_alerts_old_press_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotation_alerts
    ADD CONSTRAINT rotation_alerts_old_press_account_id_fkey FOREIGN KEY (old_press_account_id) REFERENCES public.press_accounts(id);


--
-- Name: rotation_alerts rotation_alerts_va_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotation_alerts
    ADD CONSTRAINT rotation_alerts_va_id_fkey FOREIGN KEY (va_id) REFERENCES public.foia_profiles(id) ON DELETE CASCADE;


--
-- Name: saved_properties saved_properties_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_properties
    ADD CONSTRAINT saved_properties_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: skiptrace_bulk_items skiptrace_bulk_items_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_bulk_items
    ADD CONSTRAINT skiptrace_bulk_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.skiptrace_bulk_runs(run_id) ON DELETE CASCADE;


--
-- Name: skiptrace_bulk_runs skiptrace_bulk_runs_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_bulk_runs
    ADD CONSTRAINT skiptrace_bulk_runs_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lead_lists(id) ON DELETE SET NULL;


--
-- Name: skiptrace_bulk_runs skiptrace_bulk_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skiptrace_bulk_runs
    ADD CONSTRAINT skiptrace_bulk_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sms_messages sms_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sms_messages sms_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.sms_threads(id) ON DELETE CASCADE;


--
-- Name: sms_threads sms_threads_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_threads
    ADD CONSTRAINT sms_threads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: sms_threads sms_threads_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_threads
    ADD CONSTRAINT sms_threads_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sms_threads sms_threads_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_threads
    ADD CONSTRAINT sms_threads_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: staging_uploads staging_uploads_county_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staging_uploads
    ADD CONSTRAINT staging_uploads_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id) ON DELETE SET NULL;


--
-- Name: staging_uploads staging_uploads_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staging_uploads
    ADD CONSTRAINT staging_uploads_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: subscription_usage subscription_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: suppression_list suppression_list_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppression_list
    ADD CONSTRAINT suppression_list_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: suppression_list suppression_list_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppression_list
    ADD CONSTRAINT suppression_list_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: unlocked_properties unlocked_properties_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unlocked_properties
    ADD CONSTRAINT unlocked_properties_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: upload_history upload_history_county_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_history
    ADD CONSTRAINT upload_history_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.counties(id) ON DELETE SET NULL;


--
-- Name: upload_history upload_history_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_history
    ADD CONSTRAINT upload_history_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: upload_jobs upload_jobs_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_jobs
    ADD CONSTRAINT upload_jobs_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id) ON DELETE SET NULL;


--
-- Name: upload_staging upload_staging_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_staging
    ADD CONSTRAINT upload_staging_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.upload_jobs(id) ON DELETE CASCADE;


--
-- Name: upload_staging upload_staging_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_staging
    ADD CONSTRAINT upload_staging_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id);


--
-- Name: user_activation_events user_activation_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activation_events
    ADD CONSTRAINT user_activation_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_alerts user_alerts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_alerts
    ADD CONSTRAINT user_alerts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: user_allowed_states user_allowed_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_allowed_states
    ADD CONSTRAINT user_allowed_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_integrations user_integrations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_integrations user_integrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_invitations user_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE RESTRICT;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: va_credential_slots va_credential_slots_press_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.va_credential_slots
    ADD CONSTRAINT va_credential_slots_press_account_id_fkey FOREIGN KEY (press_account_id) REFERENCES public.press_accounts(id) ON DELETE CASCADE;


--
-- Name: va_credential_slots va_credential_slots_va_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.va_credential_slots
    ADD CONSTRAINT va_credential_slots_va_id_fkey FOREIGN KEY (va_id) REFERENCES public.foia_profiles(id) ON DELETE CASCADE;


--
-- Name: violations violations_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: user_invitations Admins can create invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create invitations" ON public.user_invitations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: foia_templates Admins can insert templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert templates" ON public.foia_templates FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: counties Admins can manage all counties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all counties" ON public.counties USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: distress_events Admins can manage distress events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage distress events" ON public.distress_events TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: property_enrichment_jobs Admins can manage enrichment jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage enrichment jobs" ON public.property_enrichment_jobs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: error_logs Admins can manage error_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage error_logs" ON public.error_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: jurisdictions Admins can manage jurisdictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage jurisdictions" ON public.jurisdictions USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: marketing_leads Admins can manage marketing_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage marketing_leads" ON public.marketing_leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: beta_waitlist Admins can manage waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage waitlist" ON public.beta_waitlist TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_errors Admins can manage webhook_errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage webhook_errors" ON public.webhook_errors TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_activity_log Admins can read all activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all activity" ON public.user_activity_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: export_logs Admins can read all export logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all export logs" ON public.export_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: transactions Admins can read all transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all transactions" ON public.transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_logs Admins can read system_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read system_logs" ON public.system_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_events Admins can read webhook_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read webhook_events" ON public.webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: foia_templates Admins can update templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update templates" ON public.foia_templates FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: geocoding_jobs Admins can view all geocoding jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all geocoding jobs" ON public.geocoding_jobs FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_invitations Admins can view all invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all invitations" ON public.user_invitations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: upload_jobs Admins can view all upload jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all upload jobs" ON public.upload_jobs FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: clean_leads Admins can view clean_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view clean_leads" ON public.clean_leads FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_analytics Admins can view email analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view email analytics" ON public.email_analytics FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mcp_proxy_log Admins can view mcp proxy logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view mcp proxy logs" ON public.mcp_proxy_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: list_enrichment_waitlist Admins can view waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view waitlist" ON public.list_enrichment_waitlist FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: campaign_leads Admins full access to campaign_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to campaign_leads" ON public.campaign_leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: clean_leads Admins full access to clean_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to clean_leads" ON public.clean_leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: counties Admins full access to counties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to counties" ON public.counties TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: market_requests Admins full access to market requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to market requests" ON public.market_requests TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mcp_clients Admins read mcp_clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read mcp_clients" ON public.mcp_clients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mcp_tool_calls Admins read mcp_tool_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read mcp_tool_calls" ON public.mcp_tool_calls FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: upload_history Admins view all history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all history" ON public.upload_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: staging_uploads Admins view all staging; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all staging" ON public.staging_uploads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: error_logs Anyone can insert error_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert error_logs" ON public.error_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: list_enrichment_waitlist Anyone can insert waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert waitlist" ON public.list_enrichment_waitlist FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: beta_waitlist Anyone can join waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can join waitlist" ON public.beta_waitlist FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: census_places Anyone can read census_places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read census_places" ON public.census_places FOR SELECT TO authenticated USING (true);


--
-- Name: subscription_plans Anyone can view active plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT USING ((is_active = true));


--
-- Name: system_logs Authenticated can insert system_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert system_logs" ON public.system_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: properties Authenticated users can delete properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete properties" ON public.properties FOR DELETE USING ((auth.uid() IS NOT NULL));


--
-- Name: violations Authenticated users can delete violations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete violations" ON public.violations FOR DELETE USING ((auth.uid() IS NOT NULL));


--
-- Name: properties Authenticated users can insert properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert properties" ON public.properties FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: violations Authenticated users can insert violations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert violations" ON public.violations FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: properties Authenticated users can update investor brief; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update investor brief" ON public.properties FOR UPDATE TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: distress_events Authenticated users can view distress events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view distress events" ON public.distress_events FOR SELECT TO authenticated USING (true);


--
-- Name: campaign_leads Authenticated users can view queued campaign_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view queued campaign_leads" ON public.campaign_leads FOR SELECT TO authenticated USING ((status = 'queued'::text));


--
-- Name: foia_templates Authenticated users can view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view templates" ON public.foia_templates FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: user_alerts Service role can insert alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert alerts" ON public.user_alerts FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: email_send_log Service role can insert send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: suppressed_emails Service role can insert suppressed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: email_unsubscribe_tokens Service role can insert tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: webhook_errors Service role can insert webhook_errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert webhook_errors" ON public.webhook_errors FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: census_places Service role can manage census_places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage census_places" ON public.census_places TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_send_state Service role can manage send state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage send state" ON public.email_send_state USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: email_unsubscribe_tokens Service role can mark tokens as used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: email_send_log Service role can read send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: suppressed_emails Service role can read suppressed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: email_unsubscribe_tokens Service role can read tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: email_send_log Service role can update send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: pipeline_progress Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.pipeline_progress TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_subscriptions Service role manages subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages subscriptions" ON public.user_subscriptions USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: subscription_usage Service role manages usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages usage" ON public.subscription_usage USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: webhook_events Service role only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only" ON public.webhook_events USING (false) WITH CHECK (false);


--
-- Name: organizations System can insert organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert organizations" ON public.organizations FOR INSERT WITH CHECK (false);


--
-- Name: upload_jobs Users can create own upload jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own upload jobs" ON public.upload_jobs FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: sms_templates Users can create their own SMS templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own SMS templates" ON public.sms_templates FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: call_logs Users can create their own call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own call logs" ON public.call_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_templates Users can create their own email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own email templates" ON public.email_templates FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_alerts Users can delete own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own alerts" ON public.user_alerts FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_properties Users can delete own saved properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own saved properties" ON public.saved_properties FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: sms_templates Users can delete their own SMS templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own SMS templates" ON public.sms_templates FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: call_logs Users can delete their own call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own call logs" ON public.call_logs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: email_templates Users can delete their own email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own email templates" ON public.email_templates FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_allowed_states Users can delete their own states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own states" ON public.user_allowed_states FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_activity_log Users can insert own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own activity" ON public.user_activity_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: skiptrace_consent_log Users can insert own consent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own consent" ON public.skiptrace_consent_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: enrichment_jobs Users can insert own enrichment jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own enrichment jobs" ON public.enrichment_jobs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: export_logs Users can insert own export logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own export logs" ON public.export_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: skiptrace_jobs Users can insert own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own jobs" ON public.skiptrace_jobs FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: market_requests Users can insert own market requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own market requests" ON public.market_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_properties Users can insert own saved properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own saved properties" ON public.saved_properties FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: upload_staging Users can insert staging data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert staging data" ON public.upload_staging FOR INSERT WITH CHECK ((job_id IN ( SELECT upload_jobs.id
   FROM public.upload_jobs
  WHERE (upload_jobs.user_id = auth.uid()))));


--
-- Name: email_analytics Users can insert their email analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their email analytics" ON public.email_analytics FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: email_preferences Users can insert their own email preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own email preferences" ON public.email_preferences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: events Users can insert their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own events" ON public.events FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: geocoding_jobs Users can insert their own geocoding jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own geocoding jobs" ON public.geocoding_jobs FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_allowed_states Users can insert their own states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own states" ON public.user_allowed_states FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: export_logs Users can read own export logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own export logs" ON public.export_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_alerts Users can update own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own alerts" ON public.user_alerts FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: skiptrace_jobs Users can update own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own jobs" ON public.skiptrace_jobs FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: upload_jobs Users can update own upload jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own upload jobs" ON public.upload_jobs FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: geocoding_jobs Users can update their geocoding jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their geocoding jobs" ON public.geocoding_jobs FOR UPDATE USING ((user_id = (auth.uid())::text));


--
-- Name: organizations Users can update their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their organization" ON public.organizations FOR UPDATE USING ((id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: sms_templates Users can update their own SMS templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own SMS templates" ON public.sms_templates FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: call_logs Users can update their own call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own call logs" ON public.call_logs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: email_preferences Users can update their own email preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own email preferences" ON public.email_preferences FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: email_templates Users can update their own email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own email templates" ON public.email_templates FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: jurisdictions Users can view all jurisdictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all jurisdictions" ON public.jurisdictions FOR SELECT USING (true);


--
-- Name: user_alerts Users can view own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own alerts" ON public.user_alerts FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: affiliate_commissions Users can view own commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own commissions" ON public.affiliate_commissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.affiliate_referrals ar
  WHERE ((ar.id = affiliate_commissions.referral_id) AND (ar.referrer_id = auth.uid())))));


--
-- Name: skiptrace_consent_log Users can view own consent log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own consent log" ON public.skiptrace_consent_log FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: property_contacts Users can view own contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own contacts" ON public.property_contacts FOR SELECT USING ((created_by = auth.uid()));


--
-- Name: enrichment_jobs Users can view own enrichment jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own enrichment jobs" ON public.enrichment_jobs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: skiptrace_jobs Users can view own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own jobs" ON public.skiptrace_jobs FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: credit_ledger_skiptrace Users can view own ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own ledger" ON public.credit_ledger_skiptrace FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: market_requests Users can view own market requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own market requests" ON public.market_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: affiliate_referrals Users can view own referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own referrals" ON public.affiliate_referrals FOR SELECT TO authenticated USING ((referrer_id = auth.uid()));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_properties Users can view own saved properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own saved properties" ON public.saved_properties FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: upload_staging Users can view own staging data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own staging data" ON public.upload_staging FOR SELECT USING ((job_id IN ( SELECT upload_jobs.id
   FROM public.upload_jobs
  WHERE (upload_jobs.user_id = auth.uid()))));


--
-- Name: transactions Users can view own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: unlocked_properties Users can view own unlocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own unlocks" ON public.unlocked_properties FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: upload_jobs Users can view own upload jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own upload jobs" ON public.upload_jobs FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: subscription_usage Users can view own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own usage" ON public.subscription_usage FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: organizations Users can view their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their organization" ON public.organizations FOR SELECT USING ((id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: sms_templates Users can view their own SMS templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own SMS templates" ON public.sms_templates FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skiptrace_bulk_items Users can view their own bulk items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own bulk items" ON public.skiptrace_bulk_items FOR SELECT USING ((run_id IN ( SELECT skiptrace_bulk_runs.run_id
   FROM public.skiptrace_bulk_runs
  WHERE (skiptrace_bulk_runs.user_id = auth.uid()))));


--
-- Name: skiptrace_bulk_runs Users can view their own bulk runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own bulk runs" ON public.skiptrace_bulk_runs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: call_logs Users can view their own call logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own call logs" ON public.call_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: email_preferences Users can view their own email preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own email preferences" ON public.email_preferences FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: email_templates Users can view their own email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own email templates" ON public.email_templates FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: events Users can view their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own events" ON public.events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: geocoding_jobs Users can view their own geocoding jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own geocoding jobs" ON public.geocoding_jobs FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_allowed_states Users can view their own states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own states" ON public.user_allowed_states FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_subscriptions Users can view their own subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own subscriptions" ON public.user_subscriptions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: subscription_usage Users can view their own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own usage" ON public.subscription_usage FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: email_analytics Users insert own analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own analytics" ON public.email_analytics FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: campaign_leads Users update assigned campaign_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update assigned campaign_leads" ON public.campaign_leads FOR UPDATE TO authenticated USING ((assigned_to = auth.uid())) WITH CHECK ((assigned_to = auth.uid()));


--
-- Name: campaign_leads Users view assigned campaign_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view assigned campaign_leads" ON public.campaign_leads FOR SELECT TO authenticated USING ((assigned_to = auth.uid()));


--
-- Name: email_analytics Users view own analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own analytics" ON public.email_analytics FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: credit_ledger Users view own credit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own credit history" ON public.credit_ledger FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: counties VAs can update assigned counties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "VAs can update assigned counties" ON public.counties FOR UPDATE USING ((assigned_to = auth.uid()));


--
-- Name: counties VAs can view assigned counties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "VAs can view assigned counties" ON public.counties FOR SELECT USING (((assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))));


--
-- Name: staging_uploads VAs insert own uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "VAs insert own uploads" ON public.staging_uploads FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'va'::public.app_role) AND (uploaded_by = auth.uid())));


--
-- Name: upload_history VAs view own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "VAs view own history" ON public.upload_history FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'va'::public.app_role) AND (uploaded_by = auth.uid())));


--
-- Name: staging_uploads VAs view own uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "VAs view own uploads" ON public.staging_uploads FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'va'::public.app_role) AND (uploaded_by = auth.uid())));


--
-- Name: user_activation_events activation_own_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activation_own_insert ON public.user_activation_events FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_activation_events activation_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activation_own_select ON public.user_activation_events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: credential_target_cooldown admin_manage_cooldowns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_cooldowns ON public.credential_target_cooldown TO authenticated USING (public.is_foia_admin()) WITH CHECK (public.is_foia_admin());


--
-- Name: rotation_alerts admin_manage_rotation_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_rotation_alerts ON public.rotation_alerts TO authenticated USING (public.is_foia_admin()) WITH CHECK (public.is_foia_admin());


--
-- Name: va_credential_slots admin_manage_va_credential_slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_va_credential_slots ON public.va_credential_slots TO authenticated USING (public.is_foia_admin()) WITH CHECK (public.is_foia_admin());


--
-- Name: sms_messages admins manage sms_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage sms_messages" ON public.sms_messages USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sms_threads admins manage sms_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage sms_threads" ON public.sms_threads USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: affiliate_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs agent_runs_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_admin_select ON public.agent_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: properties anon_read_properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_properties ON public.properties FOR SELECT TO anon USING (true);


--
-- Name: violations anon_read_violations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_violations ON public.violations FOR SELECT TO anon USING (true);


--
-- Name: credential_target_cooldown authenticated_read_cooldowns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_cooldowns ON public.credential_target_cooldown FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- Name: buyer_purchases backend_only_deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only_deny_anon ON public.buyer_purchases TO anon USING (false) WITH CHECK (false);


--
-- Name: cash_buyers backend_only_deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only_deny_anon ON public.cash_buyers TO anon USING (false) WITH CHECK (false);


--
-- Name: buyer_purchases backend_only_deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only_deny_authenticated ON public.buyer_purchases TO authenticated USING (false) WITH CHECK (false);


--
-- Name: cash_buyers backend_only_deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only_deny_authenticated ON public.cash_buyers TO authenticated USING (false) WITH CHECK (false);


--
-- Name: beta_waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: call_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: call_logs call_logs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_logs_delete ON public.call_logs FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: call_logs call_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_logs_insert ON public.call_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: call_logs call_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_logs_select ON public.call_logs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: call_logs call_logs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_logs_update ON public.call_logs FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: campaign_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: census_places; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.census_places ENABLE ROW LEVEL SECURITY;

--
-- Name: clean_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clean_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: counties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;

--
-- Name: credential_target_cooldown; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credential_target_cooldown ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger_skiptrace; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_ledger_skiptrace ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger credit_ledger_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY credit_ledger_user ON public.credit_ledger FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: distress_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.distress_events ENABLE ROW LEVEL SECURITY;

--
-- Name: drip_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drip_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: drip_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drip_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: drip_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drip_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: email_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: email_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates email_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_delete ON public.email_templates FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: email_templates email_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_insert ON public.email_templates FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: email_templates email_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_select ON public.email_templates FOR SELECT TO authenticated USING (((user_id IS NULL) OR (user_id = auth.uid())));


--
-- Name: email_templates email_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_update ON public.email_templates FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: email_unsubscribe_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_agent_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrichment_agent_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_agent_jobs enrichment_agent_jobs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrichment_agent_jobs_admin_all ON public.enrichment_agent_jobs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: enrichment_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrichment_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_sources enrichment_sources_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrichment_sources_admin_all ON public.enrichment_sources TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_insert_own ON public.events FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: events events_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_select_own ON public.events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: export_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_assignments foia_assignments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_assignments_delete ON public.foia_assignments FOR DELETE USING (public.is_foia_admin());


--
-- Name: foia_assignments foia_assignments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_assignments_insert ON public.foia_assignments FOR INSERT WITH CHECK (public.is_foia_admin());


--
-- Name: foia_assignments foia_assignments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_assignments_select ON public.foia_assignments FOR SELECT USING (((va_id = auth.uid()) OR public.is_foia_admin()));


--
-- Name: foia_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_invites foia_invites_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_invites_delete ON public.foia_invites FOR DELETE TO authenticated USING (public.is_foia_admin());


--
-- Name: foia_invites foia_invites_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_invites_insert ON public.foia_invites FOR INSERT TO authenticated WITH CHECK (public.is_foia_admin());


--
-- Name: foia_invites foia_invites_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_invites_select ON public.foia_invites FOR SELECT TO authenticated USING ((public.is_foia_admin() OR (email = public.current_user_email())));


--
-- Name: foia_invites foia_invites_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_invites_update ON public.foia_invites FOR UPDATE TO authenticated USING ((public.is_foia_admin() OR (email = public.current_user_email())));


--
-- Name: foia_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_profiles foia_profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_profiles_insert ON public.foia_profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: foia_profiles foia_profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_profiles_select ON public.foia_profiles FOR SELECT USING (((auth.uid() = id) OR public.is_foia_admin()));


--
-- Name: foia_profiles foia_profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_profiles_update ON public.foia_profiles FOR UPDATE USING (((auth.uid() = id) OR public.is_foia_admin()));


--
-- Name: foia_request_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_request_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_request_jobs foia_request_jobs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_request_jobs_admin_all ON public.foia_request_jobs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: foia_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_requests foia_requests_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_requests_insert ON public.foia_requests FOR INSERT WITH CHECK ((((va_id IS NOT NULL) AND (va_id = auth.uid())) OR ((requested_by IS NOT NULL) AND (requested_by = auth.uid()))));


--
-- Name: foia_requests foia_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_requests_select ON public.foia_requests FOR SELECT USING (((COALESCE(va_id, requested_by) = auth.uid()) OR public.is_foia_admin()));


--
-- Name: foia_requests foia_requests_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_requests_update ON public.foia_requests FOR UPDATE USING (((COALESCE(va_id, requested_by) = auth.uid()) OR public.is_foia_admin()));


--
-- Name: foia_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_responses foia_responses_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_responses_admin_all ON public.foia_responses TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: foia_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: foia_sources foia_sources_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY foia_sources_admin_all ON public.foia_sources TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: foia_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foia_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: geocoding_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geocoding_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: global_sms_suppression; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.global_sms_suppression ENABLE ROW LEVEL SECURITY;

--
-- Name: global_sms_suppression global_suppression_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_suppression_read_authenticated ON public.global_sms_suppression FOR SELECT TO authenticated USING (true);


--
-- Name: integration_action_log iaction_log_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iaction_log_org_select ON public.integration_action_log FOR SELECT USING ((integration_id IN ( SELECT user_integrations.id
   FROM public.user_integrations
  WHERE (user_integrations.org_id IN ( SELECT profiles.org_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))));


--
-- Name: integration_action_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_action_log ENABLE ROW LEVEL SECURITY;

--
-- Name: jurisdictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_activities lead_activities_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_org_delete ON public.lead_activities FOR DELETE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: lead_activities lead_activities_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_org_insert ON public.lead_activities FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: lead_activities lead_activities_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activities_org_select ON public.lead_activities FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: lead_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_activity lead_activity_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activity_delete ON public.lead_activity FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: lead_activity lead_activity_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activity_insert ON public.lead_activity FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: lead_activity lead_activity_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activity_select ON public.lead_activity FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: lead_activity lead_activity_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_activity_update ON public.lead_activity FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: lead_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_lists lead_lists_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_delete ON public.lead_lists FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: lead_lists lead_lists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_insert ON public.lead_lists FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: lead_lists lead_lists_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_select ON public.lead_lists FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: lead_lists lead_lists_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_lists_update ON public.lead_lists FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: lead_tag_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tag_assignments lead_tag_assignments_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tag_assignments_org_all ON public.lead_tag_assignments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND (l.org_id IN ( SELECT profiles.org_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND (l.org_id IN ( SELECT profiles.org_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())))))));


--
-- Name: lead_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tags lead_tags_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tags_org_all ON public.lead_tags TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_org_delete ON public.leads FOR DELETE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: leads leads_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_org_insert ON public.leads FOR INSERT TO authenticated WITH CHECK (((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) AND (created_by = auth.uid())));


--
-- Name: leads leads_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_org_select ON public.leads FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: leads leads_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_org_update ON public.leads FOR UPDATE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: list_enrichment_waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.list_enrichment_waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: list_properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.list_properties ENABLE ROW LEVEL SECURITY;

--
-- Name: list_properties list_props_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY list_props_delete ON public.list_properties FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));


--
-- Name: list_properties list_props_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY list_props_insert ON public.list_properties FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));


--
-- Name: list_properties list_props_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY list_props_select ON public.list_properties FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));


--
-- Name: list_properties list_props_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY list_props_update ON public.list_properties FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.lead_lists l
  WHERE ((l.id = list_properties.list_id) AND (l.user_id = auth.uid())))));


--
-- Name: market_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_proxy_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_proxy_log ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: drip_sequences org members delete drip_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members delete drip_sequences" ON public.drip_sequences FOR DELETE USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_steps org members delete drip_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members delete drip_steps" ON public.drip_steps FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = public.current_user_org_id())))));


--
-- Name: drip_enrollments org members read drip_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members read drip_enrollments" ON public.drip_enrollments FOR SELECT USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_sequences org members read drip_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members read drip_sequences" ON public.drip_sequences FOR SELECT USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_steps org members read drip_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members read drip_steps" ON public.drip_steps FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = public.current_user_org_id())))));


--
-- Name: sms_messages org members read sms_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members read sms_messages" ON public.sms_messages FOR SELECT USING ((org_id = public.current_user_org_id()));


--
-- Name: sms_threads org members read sms_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members read sms_threads" ON public.sms_threads FOR SELECT USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_enrollments org members update drip_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members update drip_enrollments" ON public.drip_enrollments FOR UPDATE USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_sequences org members update drip_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members update drip_sequences" ON public.drip_sequences FOR UPDATE USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_steps org members update drip_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members update drip_steps" ON public.drip_steps FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = public.current_user_org_id())))));


--
-- Name: sms_threads org members update sms_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members update sms_threads" ON public.sms_threads FOR UPDATE USING ((org_id = public.current_user_org_id()));


--
-- Name: drip_enrollments org members write drip_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members write drip_enrollments" ON public.drip_enrollments FOR INSERT WITH CHECK ((org_id = public.current_user_org_id()));


--
-- Name: drip_sequences org members write drip_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members write drip_sequences" ON public.drip_sequences FOR INSERT WITH CHECK ((org_id = public.current_user_org_id()));


--
-- Name: drip_steps org members write drip_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members write drip_steps" ON public.drip_steps FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.drip_sequences s
  WHERE ((s.id = drip_steps.sequence_id) AND (s.org_id = public.current_user_org_id())))));


--
-- Name: sms_messages org members write sms_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members write sms_messages" ON public.sms_messages FOR INSERT WITH CHECK ((org_id = public.current_user_org_id()));


--
-- Name: sms_threads org members write sms_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org members write sms_threads" ON public.sms_threads FOR INSERT WITH CHECK ((org_id = public.current_user_org_id()));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: skiptrace_outcomes owner can read/write outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can read/write outcomes" ON public.skiptrace_outcomes USING ((EXISTS ( SELECT 1
   FROM public.skiptrace_jobs j
  WHERE ((j.id = skiptrace_outcomes.job_id) AND (j.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.skiptrace_jobs j
  WHERE ((j.id = skiptrace_outcomes.job_id) AND (j.user_id = auth.uid())))));


--
-- Name: owners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

--
-- Name: owners owners_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owners_org_delete ON public.owners FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: owners owners_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owners_org_insert ON public.owners FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: owners owners_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owners_org_select ON public.owners FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: owners owners_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owners_org_update ON public.owners FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: parcel_attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parcel_attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: parcel_attributes parcel_attributes_authenticated_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parcel_attributes_authenticated_select ON public.parcel_attributes FOR SELECT TO authenticated USING (true);


--
-- Name: pipeline_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages pipeline_stages_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_stages_org_delete ON public.pipeline_stages FOR DELETE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: pipeline_stages pipeline_stages_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_stages_org_insert ON public.pipeline_stages FOR INSERT TO authenticated WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: pipeline_stages pipeline_stages_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_stages_org_select ON public.pipeline_stages FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: pipeline_stages pipeline_stages_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_stages_org_update ON public.pipeline_stages FOR UPDATE TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: enrichment_misses polaris_enrichment_misses_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY polaris_enrichment_misses_insert ON public.enrichment_misses FOR INSERT TO anon WITH CHECK (true);


--
-- Name: properties polaris_enrichment_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY polaris_enrichment_update ON public.properties FOR UPDATE TO anon USING ((beds IS NULL)) WITH CHECK (true);


--
-- Name: press_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.press_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: press_accounts press_accounts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_accounts_delete ON public.press_accounts FOR DELETE USING (public.is_foia_admin());


--
-- Name: press_accounts press_accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_accounts_insert ON public.press_accounts FOR INSERT WITH CHECK (public.is_foia_admin());


--
-- Name: press_accounts press_accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_accounts_select ON public.press_accounts FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: press_accounts press_accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_accounts_update ON public.press_accounts FOR UPDATE USING (public.is_foia_admin());


--
-- Name: press_rotation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.press_rotation ENABLE ROW LEVEL SECURITY;

--
-- Name: press_rotation press_rotation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_rotation_delete ON public.press_rotation FOR DELETE USING (public.is_foia_admin());


--
-- Name: press_rotation press_rotation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_rotation_insert ON public.press_rotation FOR INSERT WITH CHECK (public.is_foia_admin());


--
-- Name: press_rotation press_rotation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_rotation_select ON public.press_rotation FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: press_rotation press_rotation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_rotation_update ON public.press_rotation FOR UPDATE USING (public.is_foia_admin());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: properties properties_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY properties_select_auth ON public.properties FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: property_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: property_contacts property_contacts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY property_contacts_insert ON public.property_contacts FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: property_contacts property_contacts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY property_contacts_select ON public.property_contacts FOR SELECT TO authenticated USING ((created_by = auth.uid()));


--
-- Name: property_enrichment_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_enrichment_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: rotation_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rotation_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_properties ENABLE ROW LEVEL SECURITY;

--
-- Name: skiptrace_bulk_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skiptrace_bulk_items ENABLE ROW LEVEL SECURITY;

--
-- Name: skiptrace_bulk_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skiptrace_bulk_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: skiptrace_consent_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skiptrace_consent_log ENABLE ROW LEVEL SECURITY;

--
-- Name: skiptrace_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skiptrace_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: skiptrace_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skiptrace_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_templates sms_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_templates_delete ON public.sms_templates FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: sms_templates sms_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_templates_insert ON public.sms_templates FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: sms_templates sms_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_templates_select ON public.sms_templates FOR SELECT TO authenticated USING (((user_id IS NULL) OR (user_id = auth.uid())));


--
-- Name: sms_templates sms_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_templates_update ON public.sms_templates FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: sms_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: staging_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staging_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_usage subscription_usage_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_usage_select_own ON public.subscription_usage FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: suppressed_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: suppression_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

--
-- Name: suppression_list suppression_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppression_org_delete ON public.suppression_list FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: suppression_list suppression_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppression_org_insert ON public.suppression_list FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: suppression_list suppression_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppression_org_select ON public.suppression_list FOR SELECT USING (((org_id IS NULL) OR (org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))));


--
-- Name: suppression_list suppression_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppression_org_update ON public.suppression_list FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: system_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

--
-- Name: targets targets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY targets_insert ON public.targets FOR INSERT WITH CHECK (public.is_foia_admin());


--
-- Name: targets targets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY targets_select ON public.targets FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: targets targets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY targets_update ON public.targets FOR UPDATE USING (public.is_foia_admin());


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: unlocked_properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unlocked_properties ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: user_activation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: user_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_allowed_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_allowed_states ENABLE ROW LEVEL SECURITY;

--
-- Name: user_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_integrations user_integrations_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_integrations_org_delete ON public.user_integrations FOR DELETE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_integrations user_integrations_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_integrations_org_insert ON public.user_integrations FOR INSERT WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_integrations user_integrations_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_integrations_org_select ON public.user_integrations FOR SELECT USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_integrations user_integrations_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_integrations_org_update ON public.user_integrations FOR UPDATE USING ((org_id IN ( SELECT profiles.org_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: va_credential_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.va_credential_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: targets va_rate_portal_difficulty; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY va_rate_portal_difficulty ON public.targets FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid())))));


--
-- Name: va_credential_slots va_read_own_credential_slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY va_read_own_credential_slots ON public.va_credential_slots FOR SELECT TO authenticated USING ((va_id = auth.uid()));


--
-- Name: rotation_alerts va_read_own_rotation_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY va_read_own_rotation_alerts ON public.rotation_alerts FOR SELECT TO authenticated USING ((va_id = auth.uid()));


--
-- Name: targets va_update_target_foia_url; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY va_update_target_foia_url ON public.targets FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.foia_assignments
  WHERE ((foia_assignments.target_id = targets.id) AND (foia_assignments.va_id = auth.uid())))));


--
-- Name: violations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

--
-- Name: violations violations_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY violations_select_auth ON public.violations FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: webhook_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Xqp1UHxpulw1OQVN2yTmArp2L9oeiXmsJOzpFdFvccfSUeMAZZ8UrsFUToJbZ7X

