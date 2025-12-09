-- Create views for dashboard stats

-- View for opportunity funnel
CREATE OR REPLACE VIEW v_opportunity_funnel AS
SELECT 
  CASE 
    WHEN snap_score >= 70 THEN 'distressed'
    WHEN snap_score >= 40 THEN 'value_add'
    ELSE 'watch'
  END as opportunity_class,
  COUNT(*) as property_count,
  ROUND(AVG(snap_score)) as avg_score
FROM properties
WHERE snap_score IS NOT NULL
GROUP BY 1;

-- View for hot properties
CREATE OR REPLACE VIEW v_hot_properties AS
SELECT 
  id,
  address,
  city,
  state,
  snap_score,
  snap_insight,
  distress_signals,
  total_violations,
  oldest_violation_date,
  escalated,
  multi_department
FROM properties
WHERE snap_score IS NOT NULL AND snap_score >= 70
ORDER BY snap_score DESC
LIMIT 50;

-- View for jurisdiction stats
CREATE OR REPLACE VIEW v_jurisdiction_stats AS
SELECT 
  j.id as jurisdiction_id,
  j.name as jurisdiction_name,
  j.city,
  j.state,
  j.enforcement_profile,
  COUNT(DISTINCT p.id) as property_count,
  ROUND(AVG(p.snap_score)) as avg_score,
  COUNT(DISTINCT p.id) FILTER (WHERE p.snap_score >= 70) as distressed_count
FROM jurisdictions j
LEFT JOIN properties p ON p.jurisdiction_id = j.id
GROUP BY j.id, j.name, j.city, j.state, j.enforcement_profile;