-- Fix fn_distinct_cities to use index-friendly comparison instead of ILIKE
CREATE OR REPLACE FUNCTION fn_distinct_cities(p_state TEXT DEFAULT NULL)
RETURNS TABLE(city TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT INITCAP(p.city) as city
  FROM properties p
  WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
    AND LENGTH(p.city) >= 3
    AND p.city !~* '^\d'
    AND p.city !~* '\b(ave|blvd|dr|rd|ct|cir|ln|st|pl|way|ter|hwy|pkwy|trail)\b'
    AND p.city !~* '(traffic|sign|damage|violation|complaint|code|permit|abandoned|illegal|inspection)'
    AND p.city !~* '^\w{1,2}\s'
  ORDER BY city;
$$;

-- Fix fn_category_property_counts to use index-friendly comparison and estimated counts
CREATE OR REPLACE FUNCTION fn_category_property_counts(p_state TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL)
RETURNS TABLE(category_id TEXT, category_label TEXT, property_count BIGINT)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 'exterior'::TEXT, 'Exterior Issues'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Exterior','Yard','Weeds','Weeds & Rubbish','Lawn','Fence','Paint','Siding']
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  UNION ALL
  SELECT 'safety'::TEXT, 'Safety Issues'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Safety','Fire','Hazard','Electrical','Gas']
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  UNION ALL
  SELECT 'structural'::TEXT, 'Structural Issues'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Structural','Foundation','Roof','Wall','Building']
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  UNION ALL
  SELECT 'zoning'::TEXT, 'Zoning Issues'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Zoning','Permit','Unpermitted','Unpermitted Construction','Land Use']
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  UNION ALL
  SELECT 'vacancy'::TEXT, 'Vacancy Issues'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Vacancy','Vacant','Abandoned','Boarded']
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  UNION ALL
  SELECT 'utility'::TEXT, 'Utility Issues'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE violation_types && ARRAY['Utility','Water','Sewer','Plumbing','Electric']
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  UNION ALL
  SELECT 'water_disconnection'::TEXT, 'Water Disconnection'::TEXT, COUNT(*)::BIGINT
  FROM properties
  WHERE enforcement_type = 'water_shutoff'
    AND (p_state IS NULL OR UPPER(state) = UPPER(p_state))
    AND (p_city IS NULL OR LOWER(city) = LOWER(p_city));
END;
$$;