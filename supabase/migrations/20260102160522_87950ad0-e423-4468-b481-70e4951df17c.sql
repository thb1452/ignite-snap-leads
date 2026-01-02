-- Recreate mv_distinct_cities with better regex that allows valid city patterns
DROP MATERIALIZED VIEW IF EXISTS mv_distinct_cities;

CREATE MATERIALIZED VIEW mv_distinct_cities AS
SELECT DISTINCT city, state
FROM properties
WHERE city IS NOT NULL 
  AND state IS NOT NULL
  AND LENGTH(state) = 2
  AND state ~ '^[A-Z]{2}$'
  -- Allow: Title case, hyphenated, apostrophes (Winston-Salem, McKinney, O'Brien, Bois D'arc)
  AND city ~ '^[A-Z][a-zA-Z''\-]+([\s\-][A-Z]?[a-zA-Z''\-]+)*$'
  AND LENGTH(city) BETWEEN 3 AND 30
  -- Exclude garbage patterns
  AND city !~ '#'
  AND city !~ '^\d'
  AND city !~ '\.'
  AND city !~ '\)'
  AND city !~ '\('
  AND city !~* '(violation|debris|trash|dump|truck|trailer|building|property|parked|stored|believe|constitute|address|moved|burning|tenant|sealed|attic|permission|county$|street|avenue|boulevard|highway)'
  AND city NOT IN ('Unknown', 'Additional', 'Antonio', 'Beach', 'Llc')
ORDER BY state, city;

CREATE INDEX idx_mv_cities_state ON mv_distinct_cities(state);
CREATE INDEX idx_mv_cities_city ON mv_distinct_cities(city);

REFRESH MATERIALIZED VIEW mv_distinct_cities;