-- Drop existing function and replace with batched version
DROP FUNCTION IF EXISTS public.fn_add_filtered_to_list(UUID, TEXT, TEXT, INT, INT, UUID, TEXT, INT);

-- Create optimized function that uses batching
CREATE OR REPLACE FUNCTION public.fn_add_filtered_to_list(
  p_list_id UUID,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_min_score INT DEFAULT NULL,
  p_max_score INT DEFAULT NULL,
  p_jurisdiction_id UUID DEFAULT NULL,
  p_enforcement_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
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

-- Create index to speed up property filtering by state (most common filter)
CREATE INDEX IF NOT EXISTS idx_properties_state_score 
ON properties (state, snap_score DESC NULLS LAST);

-- Create unique constraint on list_properties for ON CONFLICT to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'list_properties_list_id_property_id_key'
  ) THEN
    ALTER TABLE list_properties ADD CONSTRAINT list_properties_list_id_property_id_key 
    UNIQUE (list_id, property_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;