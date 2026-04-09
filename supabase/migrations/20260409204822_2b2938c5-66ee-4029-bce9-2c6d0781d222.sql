
-- Strip "Noted: ..." sections from insights
UPDATE properties
SET snap_insight = trim(regexp_replace(snap_insight, '\s*Noted:\s*"[^"]*"\.?\s*', ' ', 'g'))
WHERE snap_insight ILIKE '%Noted:%';
