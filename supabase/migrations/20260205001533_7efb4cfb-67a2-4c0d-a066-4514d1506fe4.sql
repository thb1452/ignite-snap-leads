-- Create partial index for efficient NULL insight queries
-- This prevents statement timeouts when scanning 200k+ NULL rows
CREATE INDEX IF NOT EXISTS idx_properties_snap_insight_null 
ON properties(id) 
WHERE snap_insight IS NULL;

-- Create additional index for priority ordering during backfill
CREATE INDEX IF NOT EXISTS idx_properties_missing_insight_priority 
ON properties(snap_score DESC NULLS LAST, id) 
WHERE snap_insight IS NULL;