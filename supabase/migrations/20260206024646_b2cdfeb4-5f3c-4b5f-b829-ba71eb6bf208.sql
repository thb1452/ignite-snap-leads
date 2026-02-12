-- Update fn_category_property_counts to include water_disconnection category for enterprise users
CREATE OR REPLACE FUNCTION public.fn_category_property_counts(
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS TABLE(category_id text, category_label text, property_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  
  IF v_data_tier = 'basic' THEN
    -- Basic tier: only count code_violation properties
    RETURN QUERY
    WITH category_counts AS (
      SELECT 
        'exterior' as cat_id, 'Exterior Issues' as cat_label,
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Exterior%') as cnt
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'safety', 'Safety Hazards',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Safety%' 
                           OR array_to_string(violation_types, ' ') ILIKE '%Fire%')
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'zoning', 'Zoning',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Zoning%')
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'structural', 'Structural',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Structural%')
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'vacancy', 'Vacancy',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Vacan%')
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'maintenance', 'Maintenance',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE ANY(ARRAY['%Rubbish%', '%Grass%', '%Trash%', '%Debris%', '%Weed%', '%Dumping%', '%Waste%', '%Snow%']))
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'interior', 'Interior',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE ANY(ARRAY['%Interior%', '%Plumbing%', '%HVAC%', '%Furnace%', '%305.3%', '%305.6%', '%605.3%', '%403.%', '%504.%', '%506.%']))
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'other', 'Other',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Unknown%'
                           OR array_to_string(violation_types, ' ') ILIKE '%Other%'
                           OR array_to_string(violation_types, ' ') ILIKE '%Complaint%')
      FROM properties
      WHERE enforcement_type = 'code_violation'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
    )
    SELECT cat_id, cat_label, cnt
    FROM category_counts
    WHERE cnt > 0
    ORDER BY cnt DESC;
  ELSE
    -- Premium/Enterprise: count all properties INCLUDING water_disconnection
    RETURN QUERY
    WITH category_counts AS (
      SELECT 
        'exterior' as cat_id, 'Exterior Issues' as cat_label,
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Exterior%') as cnt
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'safety', 'Safety Hazards',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Safety%' 
                           OR array_to_string(violation_types, ' ') ILIKE '%Fire%')
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'zoning', 'Zoning',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Zoning%')
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'structural', 'Structural',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Structural%')
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'vacancy', 'Vacancy',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Vacan%')
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'maintenance', 'Maintenance',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE ANY(ARRAY['%Rubbish%', '%Grass%', '%Trash%', '%Debris%', '%Weed%', '%Dumping%', '%Waste%', '%Snow%']))
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'interior', 'Interior',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE ANY(ARRAY['%Interior%', '%Plumbing%', '%HVAC%', '%Furnace%', '%305.3%', '%305.6%', '%605.3%', '%403.%', '%504.%', '%506.%']))
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'water_disconnection', 'Water Disconnection',
        COUNT(*) 
      FROM properties
      WHERE enforcement_type = 'water_shutoff'
        AND (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
      UNION ALL
      SELECT 
        'other', 'Other',
        COUNT(*) FILTER (WHERE array_to_string(violation_types, ' ') ILIKE '%Unknown%'
                           OR array_to_string(violation_types, ' ') ILIKE '%Other%'
                           OR array_to_string(violation_types, ' ') ILIKE '%Complaint%')
      FROM properties
      WHERE (p_state IS NULL OR state ILIKE p_state)
        AND (p_city IS NULL OR city ILIKE p_city)
    )
    SELECT cat_id, cat_label, cnt
    FROM category_counts
    WHERE cnt > 0
    ORDER BY cnt DESC;
  END IF;
END;
$$;