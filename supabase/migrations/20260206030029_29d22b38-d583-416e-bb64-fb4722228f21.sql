
-- Recreate fn_category_property_counts with all categories
CREATE OR REPLACE FUNCTION public.fn_category_property_counts(
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
  category_id TEXT,
  category_label TEXT,
  property_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Exterior Issues
  SELECT 
    'exterior'::TEXT,
    'Exterior Issues'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Exterior', 'Yard', 'Weeds', 'Weeds & Rubbish', 'Lawn', 'Fence', 'Paint', 'Siding']
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city)
  
  UNION ALL
  
  -- Safety Issues
  SELECT 
    'safety'::TEXT,
    'Safety Issues'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Safety', 'Fire', 'Hazard', 'Electrical', 'Gas']
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city)
  
  UNION ALL
  
  -- Structural Issues
  SELECT 
    'structural'::TEXT,
    'Structural Issues'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Structural', 'Foundation', 'Roof', 'Wall', 'Building']
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city)
  
  UNION ALL
  
  -- Zoning Issues
  SELECT 
    'zoning'::TEXT,
    'Zoning Issues'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Zoning', 'Permit', 'Unpermitted', 'Unpermitted Construction', 'Land Use']
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city)
  
  UNION ALL
  
  -- Vacancy Issues
  SELECT 
    'vacancy'::TEXT,
    'Vacancy Issues'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Vacancy', 'Vacant', 'Abandoned', 'Boarded']
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city)
  
  UNION ALL
  
  -- Utility Issues
  SELECT 
    'utility'::TEXT,
    'Utility Issues'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Utility', 'Water', 'Sewer', 'Plumbing', 'Electric']
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city)
  
  UNION ALL
  
  -- Water Disconnection (from enforcement_type, not violation_types)
  SELECT 
    'water_disconnection'::TEXT,
    'Water Disconnection'::TEXT,
    COUNT(*)::BIGINT
  FROM properties
  WHERE enforcement_type = 'water_shutoff'
    AND (p_state IS NULL OR state ILIKE p_state)
    AND (p_city IS NULL OR city ILIKE p_city);
END;
$$;
