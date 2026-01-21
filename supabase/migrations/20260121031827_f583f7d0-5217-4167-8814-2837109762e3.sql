-- 1. Fix functions with missing search_path
CREATE OR REPLACE FUNCTION public.fn_distinct_cities(p_state text DEFAULT NULL::text)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT DISTINCT city 
  FROM mv_distinct_cities
  WHERE (p_state IS NULL OR mv_distinct_cities.state = upper(p_state))
  ORDER BY city
  LIMIT 1000;
$function$;

CREATE OR REPLACE FUNCTION public.fn_distinct_states()
RETURNS TABLE(state text)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT state FROM mv_distinct_states ORDER BY state;
$function$;

-- 2. Secure materialized views by revoking API access
REVOKE SELECT ON public.mv_distinct_cities FROM anon, authenticated;
REVOKE SELECT ON public.mv_distinct_states FROM anon, authenticated;

-- Grant access through functions only (which are already accessible)
GRANT EXECUTE ON FUNCTION public.fn_distinct_cities(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_distinct_states() TO authenticated;