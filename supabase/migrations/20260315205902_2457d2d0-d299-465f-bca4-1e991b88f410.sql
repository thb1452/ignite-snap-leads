
CREATE OR REPLACE FUNCTION public.fn_bulk_match_properties(
  p_addresses text[]
)
RETURNS TABLE(
  input_address text,
  property_id uuid,
  address text,
  city text,
  state text,
  zip text,
  snap_score integer,
  open_violations integer,
  violation_types text[],
  last_enforcement_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (lower(trim(p.address)))
    lower(trim(p.address)) as input_address,
    p.id as property_id,
    p.address,
    p.city,
    p.state,
    p.zip,
    p.snap_score,
    p.open_violations,
    p.violation_types,
    p.last_enforcement_date
  FROM properties p
  WHERE lower(trim(p.address)) = ANY(p_addresses)
  ORDER BY lower(trim(p.address)), p.snap_score DESC NULLS LAST;
END;
$$;
