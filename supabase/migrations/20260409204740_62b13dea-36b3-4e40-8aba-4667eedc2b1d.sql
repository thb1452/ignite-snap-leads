
-- Fix PASS → OPPORTUNITY for properties with open violations (batch 1)
UPDATE properties
SET snap_insight = regexp_replace(snap_insight, '\s*PASS\s*$', ' OPPORTUNITY')
WHERE id IN (
  SELECT id FROM properties
  WHERE open_violations > 0 AND snap_insight LIKE '%PASS'
  LIMIT 5000
);
