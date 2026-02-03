
-- Create a function to get accurate property counts by category
-- This returns how many properties match each category (not violation counts)
CREATE OR REPLACE FUNCTION public.fn_category_property_counts(
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS TABLE (
  category_id text,
  category_label text,
  property_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
END;
$$;
