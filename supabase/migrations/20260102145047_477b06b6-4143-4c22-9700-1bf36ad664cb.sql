-- Create materialized views for instant filter dropdown loading
-- These cache the distinct values and can be refreshed periodically

-- Materialized view for distinct states
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_distinct_states AS
SELECT DISTINCT upper(state) as state 
FROM properties 
WHERE state IS NOT NULL 
  AND length(trim(state)) = 2 
  AND state ~ '^[A-Za-z]+$'
ORDER BY state;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_distinct_states_state ON mv_distinct_states(state);

-- Materialized view for distinct cities (with state for filtering)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_distinct_cities AS
SELECT DISTINCT 
  initcap(trim(city)) as city,
  upper(trim(state)) as state
FROM properties 
WHERE city IS NOT NULL 
  AND length(trim(city)) >= 2
  AND city !~ '^\d+$'
  AND city !~ '^[^a-zA-Z]*$'
ORDER BY city;

-- Create indexes for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_distinct_cities_city_state ON mv_distinct_cities(city, state);
CREATE INDEX IF NOT EXISTS idx_mv_distinct_cities_state ON mv_distinct_cities(state);

-- Replace the slow functions with fast ones that use materialized views
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

-- Grant access
GRANT SELECT ON mv_distinct_states TO authenticated, anon;
GRANT SELECT ON mv_distinct_cities TO authenticated, anon;