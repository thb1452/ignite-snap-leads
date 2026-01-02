-- Create a materialized view for distinct cities/states to speed up filter loading
-- This will be much faster than scanning the entire properties table

-- First create a function to get distinct states
CREATE OR REPLACE FUNCTION fn_distinct_states()
RETURNS TABLE(state text) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT UPPER(p.state) as state
  FROM properties p
  WHERE p.state IS NOT NULL 
    AND LENGTH(TRIM(p.state)) = 2
  ORDER BY state;
$$;

-- Create a function to get distinct cities, optionally filtered by state
CREATE OR REPLACE FUNCTION fn_distinct_cities(p_state text DEFAULT NULL)
RETURNS TABLE(city text) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT 
    INITCAP(TRIM(p.city)) as city
  FROM properties p
  WHERE p.city IS NOT NULL 
    AND LENGTH(TRIM(p.city)) >= 2
    AND LENGTH(TRIM(p.city)) <= 50
    AND TRIM(p.city) ~ '^[a-zA-Z]'
    AND TRIM(p.city) !~ '^\d+$'
    AND TRIM(p.city) !~ '\s\d{5}$'
    AND TRIM(p.city) !~ '^\d{1,2}[-/]\d{1,2}'
    AND TRIM(p.city) !~ '^#'
    AND LOWER(TRIM(p.city)) NOT LIKE '%county%'
    AND LOWER(TRIM(p.city)) != 'unknown'
    AND (p_state IS NULL OR UPPER(p.state) = UPPER(p_state))
  ORDER BY city;
$$;