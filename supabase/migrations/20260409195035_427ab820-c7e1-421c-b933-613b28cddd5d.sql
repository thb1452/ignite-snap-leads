
-- Add index to speed up city lookups filtered by state
CREATE INDEX IF NOT EXISTS idx_properties_upper_state_city
ON properties (upper(state), city);

-- Optimize fn_distinct_cities: use simpler filtering and set timeout
CREATE OR REPLACE FUNCTION public.fn_distinct_cities(p_state text DEFAULT NULL)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SET statement_timeout = '8s'
AS $$
  SELECT DISTINCT INITCAP(p.city) as city
  FROM properties p
  WHERE (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
    AND LENGTH(p.city) >= 3
    AND p.city !~ '^\d'
  ORDER BY city;
$$;

-- Optimize fn_category_property_counts: single-pass scan
CREATE OR REPLACE FUNCTION public.fn_category_property_counts(
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS TABLE(category_id text, category_label text, property_count bigint)
LANGUAGE sql
STABLE
SET statement_timeout = '8s'
AS $$
  WITH filtered AS (
    SELECT violation_types, enforcement_type
    FROM properties
    WHERE (p_state IS NULL OR UPPER(state) = UPPER(p_state))
      AND (p_city IS NULL OR LOWER(city) = LOWER(p_city))
  )
  SELECT v.category_id, v.category_label, COALESCE(c.cnt, 0)::bigint AS property_count
  FROM (VALUES
    ('exterior',  'Exterior Issues'),
    ('safety',    'Safety Issues'),
    ('structural','Structural Issues'),
    ('zoning',    'Zoning Issues'),
    ('vacancy',   'Vacancy Issues'),
    ('utility',   'Utility Issues'),
    ('water_disconnection', 'Water Disconnection')
  ) AS v(category_id, category_label)
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM filtered f WHERE
      CASE v.category_id
        WHEN 'exterior'   THEN f.violation_types && ARRAY['Exterior','Yard','Weeds','Weeds & Rubbish','Lawn','Fence','Paint','Siding']
        WHEN 'safety'     THEN f.violation_types && ARRAY['Safety','Fire','Hazard','Electrical','Gas']
        WHEN 'structural' THEN f.violation_types && ARRAY['Structural','Foundation','Roof','Wall','Building']
        WHEN 'zoning'     THEN f.violation_types && ARRAY['Zoning','Permit','Unpermitted','Unpermitted Construction','Land Use']
        WHEN 'vacancy'    THEN f.violation_types && ARRAY['Vacancy','Vacant','Abandoned','Boarded']
        WHEN 'utility'    THEN f.violation_types && ARRAY['Utility','Water','Sewer','Plumbing','Electric']
        WHEN 'water_disconnection' THEN f.enforcement_type = 'water_shutoff'
        ELSE false
      END
  ) c ON true;
$$;
