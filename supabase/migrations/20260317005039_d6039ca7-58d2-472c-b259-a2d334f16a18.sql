
-- Score the 51 unscored properties that have violations using the existing scoring logic
-- This applies the v7.1 SnapScore formula directly
WITH scored AS (
  SELECT 
    p.id,
    LEAST(100, GREATEST(0,
      -- Base: volume scoring (progressive scaling)
      CASE 
        WHEN COALESCE(p.total_violations, 0) >= 10 THEN 40
        WHEN COALESCE(p.total_violations, 0) >= 5 THEN 30
        WHEN COALESCE(p.total_violations, 0) >= 3 THEN 20
        WHEN COALESCE(p.total_violations, 0) >= 1 THEN 10
        ELSE 0
      END
      -- Open violations bonus
      + CASE WHEN COALESCE(p.open_violations, 0) > 0 THEN 25 ELSE 0 END
      -- Recency bonus (based on newest_violation_date or last_enforcement_date)
      + CASE 
          WHEN COALESCE(p.newest_violation_date, p.last_enforcement_date::date) >= CURRENT_DATE - INTERVAL '30 days' THEN 20
          WHEN COALESCE(p.newest_violation_date, p.last_enforcement_date::date) >= CURRENT_DATE - INTERVAL '90 days' THEN 15
          WHEN COALESCE(p.newest_violation_date, p.last_enforcement_date::date) >= CURRENT_DATE - INTERVAL '180 days' THEN 10
          WHEN COALESCE(p.newest_violation_date, p.last_enforcement_date::date) >= CURRENT_DATE - INTERVAL '365 days' THEN 5
          ELSE 0
        END
      -- Repeat offender bonus
      + CASE WHEN p.repeat_offender = true THEN 10 ELSE 0 END
      -- Escalation bonus
      + CASE WHEN p.escalated = true THEN 15 ELSE 0 END
      -- Multi-department bonus
      + CASE WHEN p.multi_department = true THEN 5 ELSE 0 END
    )) AS computed_score
  FROM properties p
  WHERE p.snap_score IS NULL AND COALESCE(p.total_violations, 0) > 0
)
UPDATE properties
SET 
  snap_score = scored.computed_score,
  updated_at = NOW()
FROM scored
WHERE properties.id = scored.id;
