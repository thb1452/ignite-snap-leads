
UPDATE properties
SET snap_insight = regexp_replace(snap_insight, '\s*CALL NOW\s*$', ' PASS')
WHERE open_violations = 0 AND snap_score = 0 AND snap_insight ~ 'CALL NOW\s*$';
