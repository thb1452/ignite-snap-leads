-- Create a faster deterministic insight generator directly in SQL
-- This avoids the Edge Function overhead and can process 10k+ rows at once

CREATE OR REPLACE FUNCTION generate_enforcement_insight(
  p_total_violations INTEGER,
  p_open_violations INTEGER,
  p_avg_days_open INTEGER,
  p_violation_types TEXT[],
  p_distress_signals TEXT[],
  p_repeat_offender BOOLEAN,
  p_multi_department BOOLEAN,
  p_escalated BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql
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

-- Create fast batch backfill function that processes directly in DB
CREATE OR REPLACE FUNCTION backfill_insights_batch(batch_size INTEGER DEFAULT 5000)
RETURNS TABLE(processed INTEGER, remaining BIGINT)
LANGUAGE plpgsql
SET statement_timeout = '600s'
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

-- Create function to refresh outdated investor-language insights
CREATE OR REPLACE FUNCTION refresh_outdated_insights_batch(batch_size INTEGER DEFAULT 5000)
RETURNS TABLE(processed INTEGER, remaining BIGINT)
LANGUAGE plpgsql
SET statement_timeout = '600s'
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