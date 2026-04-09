
-- Rewrite fn_distinct_cities to use the materialized view
CREATE OR REPLACE FUNCTION public.fn_distinct_cities(p_state text DEFAULT NULL)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SET statement_timeout = '8s'
AS $$
  SELECT DISTINCT INITCAP(mv.city) AS city
  FROM mv_distinct_cities mv
  WHERE (p_state IS NULL OR UPPER(mv.state) = UPPER(p_state))
    AND LENGTH(mv.city) >= 3
    AND mv.city !~ '^\d'
  ORDER BY city;
$$;

-- Rewrite fn_category_property_counts to be fast
-- When no filters are applied, we sample with a LIMIT to avoid full scan
CREATE OR REPLACE FUNCTION public.fn_category_property_counts(
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS TABLE(category_id text, category_label text, property_count bigint)
LANGUAGE plpgsql
STABLE
SET statement_timeout = '10s'
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

-- Refresh the materialized view to ensure it's current
REFRESH MATERIALIZED VIEW mv_distinct_cities;
