
-- Generate rule-based insights for the 50 properties missing them
UPDATE properties
SET snap_insight = 
  CASE
    WHEN COALESCE(open_violations, 0) > 0 THEN
      COALESCE(open_violations, 0)::text || ' open citation' || 
      CASE WHEN open_violations > 1 THEN 's' ELSE '' END ||
      CASE WHEN array_length(violation_types, 1) > 0 
        THEN ' covering ' || array_to_string(violation_types[1:2], ' and ') 
        ELSE '' END ||
      CASE WHEN newest_violation_date IS NOT NULL 
        THEN '. Recent activity within ' || 
          CASE 
            WHEN newest_violation_date >= CURRENT_DATE - 7 THEN '7 days'
            WHEN newest_violation_date >= CURRENT_DATE - 30 THEN '30 days'
            WHEN newest_violation_date >= CURRENT_DATE - 90 THEN '90 days'
            ELSE '1 year'
          END
        ELSE '' END ||
      CASE WHEN repeat_offender THEN '. Repeat enforcement pattern (' || total_violations::text || ' total citations).' ELSE '.' END
    WHEN COALESCE(total_violations, 0) > 0 THEN
      total_violations::text || ' resolved citation' ||
      CASE WHEN total_violations > 1 THEN 's' ELSE '' END ||
      CASE WHEN array_length(violation_types, 1) > 0 
        THEN ' (' || array_to_string(violation_types[1:2], ' and ') || ')' 
        ELSE '' END ||
      ' on record.' ||
      CASE WHEN repeat_offender THEN ' Repeat enforcement pattern.' ELSE '' END
    ELSE
      'No active enforcement actions currently on file.'
  END,
  updated_at = NOW()
WHERE snap_insight IS NULL;
