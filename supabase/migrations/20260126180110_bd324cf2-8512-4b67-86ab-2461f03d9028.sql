-- RPC to add all properties matching filters to a list (server-side bulk insert)
-- Returns the count of properties added

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
AS $$
DECLARE
  v_user_id UUID;
  v_inserted INT;
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

  -- Count matching properties first
  SELECT COUNT(*) INTO v_total_matching
  FROM properties p
  WHERE (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
    AND (p_state IS NULL OR LOWER(p.state) = LOWER(p_state))
    AND (p_min_score IS NULL OR p.snap_score >= p_min_score)
    AND (p_max_score IS NULL OR p.snap_score <= p_max_score)
    AND (p_jurisdiction_id IS NULL OR p.jurisdiction_id = p_jurisdiction_id)
    AND (p_enforcement_type IS NULL OR p.enforcement_type = p_enforcement_type)
    AND (v_data_tier = 'premium' OR p.enforcement_type = 'code_violation');

  -- Insert properties matching filters (with deduplication)
  WITH matching_properties AS (
    SELECT p.id
    FROM properties p
    WHERE (p_city IS NULL OR LOWER(p.city) = LOWER(p_city))
      AND (p_state IS NULL OR LOWER(p.state) = LOWER(p_state))
      AND (p_min_score IS NULL OR p.snap_score >= p_min_score)
      AND (p_max_score IS NULL OR p.snap_score <= p_max_score)
      AND (p_jurisdiction_id IS NULL OR p.jurisdiction_id = p_jurisdiction_id)
      AND (p_enforcement_type IS NULL OR p.enforcement_type = p_enforcement_type)
      AND (v_data_tier = 'premium' OR p.enforcement_type = 'code_violation')
    ORDER BY p.snap_score DESC NULLS LAST
    LIMIT p_limit
  )
  INSERT INTO list_properties (list_id, property_id, created_by)
  SELECT p_list_id, mp.id, v_user_id
  FROM matching_properties mp
  WHERE NOT EXISTS (
    SELECT 1 FROM list_properties lp 
    WHERE lp.list_id = p_list_id AND lp.property_id = mp.id
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'inserted', v_inserted,
    'total_matching', v_total_matching,
    'limit_applied', p_limit
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.fn_add_filtered_to_list TO authenticated;

-- Add index on list_properties for faster lookups
CREATE INDEX IF NOT EXISTS idx_list_properties_list_id ON list_properties(list_id);
CREATE INDEX IF NOT EXISTS idx_list_properties_property_id ON list_properties(property_id);

-- Function to get list with property count
CREATE OR REPLACE FUNCTION public.fn_get_user_lists()
RETURNS TABLE (
  id UUID,
  name TEXT,
  created_at TIMESTAMPTZ,
  property_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.fn_get_user_lists TO authenticated;

-- Function to get properties in a list with pagination
CREATE OR REPLACE FUNCTION public.fn_get_list_properties(
  p_list_id UUID,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.fn_get_list_properties TO authenticated;