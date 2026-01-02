
-- Recreate cities view excluding street-like patterns more aggressively
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  AND city ~ '^[A-Z][a-z]+(\s[A-Z][a-z]+)*$'  -- Title Case
  AND LENGTH(city) BETWEEN 2 AND 25
  -- Exclude street patterns (case insensitive match)
  AND city !~* '\y(st|dr|rd|ln|blvd|way|ave|trl|ct|cir|loop|road|place|lane|court|circle|drive|trail|boulevard|avenue|street|hwy|highway|pkwy|parkway|terr|terrace)\y'
  -- Exclude directional/ordinal patterns  
  AND city !~* '\y(north|south|east|west|central|upper|lower|old|new)\s'
  -- Exclude common non-city words
  AND city !~* '^(and|the|or|but|if|at|to|in|on|for|with|without|my|your|their|this|that|it|she|he|they|we|you|i|a|an)\y'
  -- Exclude anything with "road" in the full name
  AND city !~* 'road'
ORDER BY state, city;

CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

REFRESH MATERIALIZED VIEW mv_distinct_cities;
