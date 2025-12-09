-- Add property intelligence columns to properties table
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS total_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS open_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS oldest_violation_date DATE,
ADD COLUMN IF NOT EXISTS newest_violation_date DATE,
ADD COLUMN IF NOT EXISTS avg_days_open INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS violation_types TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS repeat_offender BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS multi_department BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS distress_signals TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS opportunity_class TEXT DEFAULT 'watch',
ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;

-- Add enforcement profile to jurisdictions table
ALTER TABLE public.jurisdictions
ADD COLUMN IF NOT EXISTS enforcement_profile JSONB DEFAULT '{
  "strictness": "unknown",
  "avg_violations_per_property": 0,
  "avg_days_to_close": 0,
  "total_properties_cited": 0,
  "score_multiplier": 1.0
}'::jsonb;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_properties_snap_score ON properties(snap_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_properties_opportunity_class ON properties(opportunity_class);
CREATE INDEX IF NOT EXISTS idx_properties_jurisdiction_score ON properties(jurisdiction_id, snap_score DESC);