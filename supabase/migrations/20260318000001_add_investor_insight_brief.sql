-- Add investor_insight_brief JSONB column to properties table
-- Used to cache AI-generated investor briefs (24h TTL enforced client-side)
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS investor_insight_brief jsonb DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN properties.investor_insight_brief IS 'Cached AI investor brief JSON: {enforcement_summary, distress_indicators, recommended_action, generated_at, property_snap_score}';
