
CREATE OR REPLACE FUNCTION public.fn_distinct_city_counts()
RETURNS TABLE(city text, state text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT TRIM(p.city) AS city, UPPER(TRIM(p.state)) AS state, COUNT(*) AS cnt
  FROM properties p
  WHERE p.city IS NOT NULL AND p.state IS NOT NULL
  GROUP BY TRIM(p.city), UPPER(TRIM(p.state))
  ORDER BY cnt DESC;
$$;
