
-- Drop and recreate materialized views with proper filtering for valid data

-- Drop existing views
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_states;

-- Recreate states view (filter out obvious garbage)
CREATE MATERIALIZED VIEW mv_distinct_states AS
SELECT DISTINCT state
FROM properties
WHERE state IS NOT NULL 
  AND LENGTH(state) = 2  -- Valid US state codes are 2 letters
  AND state ~ '^[A-Z]{2}$'  -- Only uppercase letters
ORDER BY state;

-- Create index on states
CREATE INDEX idx_mv_states ON mv_distinct_states(state);

-- Recreate cities view with filtering
CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  -- Filter out garbage cities:
  AND city ~ '^[A-Za-z]'  -- Must start with a letter
  AND city !~ '^#'  -- No hashtag prefixes
  AND city !~ '^\d'  -- Doesn't start with number
  AND city !~ '\d{4}'  -- No 4-digit numbers (years/addresses)
  AND city !~ '(St|Dr|Rd|Ln|Blvd|Way|Ave|Trl|Ct|Cir|Loop)$'  -- Doesn't end with street suffix
  AND LENGTH(city) BETWEEN 2 AND 25  -- Reasonable length
  AND city !~ '[\.!?"]'  -- No sentence punctuation
ORDER BY state, city;

-- Create indexes on cities
CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

-- Refresh both views
REFRESH MATERIALIZED VIEW mv_distinct_states;
REFRESH MATERIALIZED VIEW mv_distinct_cities;
