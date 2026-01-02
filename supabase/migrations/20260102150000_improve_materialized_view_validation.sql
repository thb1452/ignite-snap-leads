-- ===================================================================
-- Improve materialized view validation to prevent garbage data
-- ===================================================================
-- Replace the weak validation in mv_distinct_cities with comprehensive
-- garbage filtering that matches our CSV upload validation

-- Drop and recreate mv_distinct_cities with enhanced validation
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities CASCADE;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT
  initcap(trim(city)) as city,
  upper(trim(state)) as state
FROM properties
WHERE city IS NOT NULL
  -- Basic length validation
  AND length(trim(city)) >= 2
  AND length(trim(city)) <= 50

  -- CRITICAL: Reject street addresses (numbers + street suffixes)
  AND city !~ '\d+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|pkwy|parkway|cir|circle)'

  -- Reject if starts with numbers
  AND city !~ '^\d+'

  -- Reject all numbers
  AND city !~ '^\d+$'

  -- Reject no letters at all
  AND city !~ '^[^a-zA-Z]*$'

  -- Reject dates (MM/DD/YYYY, YYYY-MM-DD)
  AND city !~ '\d{1,2}/\d{1,2}/\d{2,4}'
  AND city !~ '\d{4}-\d{2}-\d{2}'

  -- Reject zip codes
  AND city !~ '^\d{5}(-\d{4})?$'

  -- Reject multi-sentence text (notes)
  AND city !~ '\.\s+[A-Z]'

  -- Reject special characters (field headers, notes)
  AND city NOT LIKE '%:%'
  AND city NOT LIKE '%;%'
  AND city NOT LIKE '%(%'
  AND city NOT LIKE '%)%'
  AND city NOT LIKE '%[%'
  AND city NOT LIKE '%]%'
  AND city NOT LIKE '%#%'
  AND city NOT LIKE '%@%'
  AND city NOT LIKE '%*%'
  AND city NOT LIKE '%&%'

  -- Reject field headers
  AND city NOT ILIKE 'property address'
  AND city NOT ILIKE 'case number'
  AND city NOT ILIKE 'file%number%'
  AND city NOT ILIKE 'violation%type%'
  AND city NOT ILIKE 'description'
  AND city NOT ILIKE 'location'
  AND city NOT ILIKE 'address'
  AND city NOT ILIKE 'status'
  AND city NOT ILIKE 'date%opened%'
  AND city NOT ILIKE 'date%closed%'

  -- Reject violation keywords
  AND city NOT ILIKE '%violation%'
  AND city NOT ILIKE '%debris%'
  AND city NOT ILIKE '%trash%'
  AND city NOT ILIKE '%weeds%'
  AND city NOT ILIKE '%overgrown%'
  AND city NOT ILIKE '%illegal%'
  AND city NOT ILIKE '%unpermitted%'
  AND city NOT ILIKE '%hazard%'
  AND city NOT ILIKE '%unsafe%'
  AND city NOT ILIKE '%repair%'
  AND city NOT ILIKE '%maintain%'
  AND city NOT ILIKE '%fence%'
  AND city NOT ILIKE '%yard%'
  AND city NOT ILIKE '%building%'
  AND city NOT ILIKE '%structure%'
  AND city NOT ILIKE '%vehicle%'
  AND city NOT ILIKE '%junk%'
  AND city NOT ILIKE '%abandoned%'
  AND city NOT ILIKE '%permit%'
  AND city NOT ILIKE '%inspection%'
  AND city NOT ILIKE '%citation%'

  -- Reject instruction words
  AND city NOT ILIKE '%please%'
  AND city NOT ILIKE '%must%'
  AND city NOT ILIKE '%should%'
  AND city NOT ILIKE '%shall%'
  AND city NOT ILIKE '%required%'
  AND city NOT ILIKE '%notify%'

  -- Reject property parts
  AND city NOT ILIKE '%backyard%'
  AND city NOT ILIKE '%front%yard%'
  AND city NOT ILIKE '%porch%'
  AND city NOT ILIKE '%roof%'
  AND city NOT ILIKE '%window%'

  -- Only allow city names with mostly letters
  AND city ~ '^[A-Za-z\s\-''.]+$'

ORDER BY city;

-- Recreate indexes
CREATE UNIQUE INDEX idx_mv_distinct_cities_city_state ON mv_distinct_cities(city, state);
CREATE INDEX idx_mv_distinct_cities_state ON mv_distinct_cities(state);

-- Grant access
GRANT SELECT ON mv_distinct_cities TO authenticated, anon;

-- Add comment
COMMENT ON MATERIALIZED VIEW mv_distinct_cities IS 'Distinct cities with comprehensive garbage filtering - rejects street addresses, violation descriptions, field headers, and invalid data';

-- Also improve mv_distinct_states (less critical but good to be thorough)
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_states CASCADE;

CREATE MATERIALIZED VIEW mv_distinct_states AS
SELECT DISTINCT upper(trim(state)) as state
FROM properties
WHERE state IS NOT NULL
  AND length(trim(state)) = 2
  AND state ~ '^[A-Za-z]+$'
  -- Reject common garbage patterns
  AND state NOT IN ('00', '99', 'XX', 'NA', 'N/A', '--')
ORDER BY state;

-- Recreate index
CREATE UNIQUE INDEX idx_mv_distinct_states_state ON mv_distinct_states(state);

-- Grant access
GRANT SELECT ON mv_distinct_states TO authenticated, anon;

-- Add comment
COMMENT ON MATERIALIZED VIEW mv_distinct_states IS 'Distinct US states (2-letter codes) with validation';

-- Recreate the RPC functions (they were dropped CASCADE)
CREATE OR REPLACE FUNCTION fn_distinct_states()
RETURNS TABLE(state text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT state FROM mv_distinct_states ORDER BY state;
$$;

CREATE OR REPLACE FUNCTION fn_distinct_cities(p_state text DEFAULT NULL)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT city
  FROM mv_distinct_cities
  WHERE (p_state IS NULL OR mv_distinct_cities.state = upper(p_state))
  ORDER BY city
  LIMIT 1000;
$$;
