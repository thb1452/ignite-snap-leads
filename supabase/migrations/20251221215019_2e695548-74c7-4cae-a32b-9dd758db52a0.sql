-- Create a function to get dashboard stats efficiently
CREATE OR REPLACE FUNCTION public.fn_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_leads', (SELECT COUNT(*) FROM properties),
    'hot_leads', (SELECT COUNT(*) FROM properties WHERE snap_score >= 80),
    'avg_snap_score', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score IS NOT NULL),
    'distressed_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 70),
    'value_add_count', (SELECT COUNT(*) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
    'watch_count', (SELECT COUNT(*) FROM properties WHERE snap_score < 40 OR snap_score IS NULL),
    'distressed_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 70),
    'value_add_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score >= 40 AND snap_score < 70),
    'watch_avg', (SELECT COALESCE(ROUND(AVG(snap_score)), 0) FROM properties WHERE snap_score < 40 AND snap_score IS NOT NULL)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Create a function to get opportunity funnel stats
CREATE OR REPLACE FUNCTION public.fn_opportunity_funnel()
RETURNS TABLE(
  opportunity_class TEXT,
  property_count BIGINT,
  avg_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'distressed'::TEXT as opportunity_class,
    COUNT(*)::BIGINT as property_count,
    COALESCE(ROUND(AVG(snap_score)), 0) as avg_score
  FROM properties 
  WHERE snap_score >= 70
  
  UNION ALL
  
  SELECT 
    'value_add'::TEXT,
    COUNT(*)::BIGINT,
    COALESCE(ROUND(AVG(snap_score)), 0)
  FROM properties 
  WHERE snap_score >= 40 AND snap_score < 70
  
  UNION ALL
  
  SELECT 
    'watch'::TEXT,
    COUNT(*)::BIGINT,
    COALESCE(ROUND(AVG(snap_score)), 0)
  FROM properties 
  WHERE snap_score < 40 OR snap_score IS NULL;
END;
$$;

-- Create a function to get jurisdiction stats efficiently
CREATE OR REPLACE FUNCTION public.fn_jurisdiction_stats()
RETURNS TABLE(
  jurisdiction_id UUID,
  jurisdiction_name TEXT,
  city TEXT,
  state TEXT,
  enforcement_profile JSONB,
  property_count BIGINT,
  avg_score NUMERIC,
  distressed_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as jurisdiction_id,
    j.name as jurisdiction_name,
    j.city,
    j.state,
    COALESCE(j.enforcement_profile, '{"strictness": "unknown", "avg_violations_per_property": 0, "score_multiplier": 1.0}'::jsonb) as enforcement_profile,
    COUNT(p.id)::BIGINT as property_count,
    COALESCE(ROUND(AVG(p.snap_score)), 0) as avg_score,
    COUNT(CASE WHEN p.snap_score >= 70 THEN 1 END)::BIGINT as distressed_count
  FROM jurisdictions j
  LEFT JOIN properties p ON p.jurisdiction_id = j.id
  GROUP BY j.id, j.name, j.city, j.state, j.enforcement_profile
  HAVING COUNT(p.id) > 0
  ORDER BY COUNT(p.id) DESC;
END;
$$;