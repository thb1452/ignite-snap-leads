-- GIN index on investor_insight_brief JSONB column
-- Enables efficient queries like: find all properties with recommended_action = 'IMMEDIATE OUTREACH'
CREATE INDEX IF NOT EXISTS idx_properties_investor_insight_brief_gin
  ON properties USING gin (investor_insight_brief);
