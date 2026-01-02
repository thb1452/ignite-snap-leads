
-- Add explicit blacklist for known garbage
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  AND city ~ '^[A-Z][a-z]+(\s[A-Z][a-z]+)*$'
  AND LENGTH(city) BETWEEN 3 AND 25
  -- Exclude street patterns
  AND city !~* '\y(st|dr|rd|ln|blvd|way|ave|trl|ct|cir|loop|road|place|lane|court|circle|drive|trail|boulevard|avenue|street|hwy|highway|pkwy|parkway|terr|terrace)\y'
  -- Exclude non-city starting words
  AND city !~* '^(and|the|or|but|if|at|to|in|on|for|with|without|my|their|this|that|it|she|he|they|we|you|additional|attic|sealed|from)\s'
  AND city !~* 'sealed|attic|permission'
  -- Exclude malformed patterns
  AND city !~ '^Ave[a-z]'
  AND city !~ '^Avu[a-z]'
  AND city !~* 'county$'
  -- Explicit blacklist of known garbage
  AND city NOT IN ('Additional', 'Antonio', 'Anvoerth Baldwin', 'Beach')
ORDER BY state, city;

CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

REFRESH MATERIALIZED VIEW mv_distinct_cities;
