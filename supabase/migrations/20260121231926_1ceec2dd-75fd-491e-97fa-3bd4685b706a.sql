-- Fix materialized view permissions (missing SELECT/read permission)
GRANT SELECT ON mv_distinct_cities TO authenticated, anon;
GRANT SELECT ON mv_distinct_states TO authenticated, anon;

-- Add indexes to speed up fn_properties_paged queries on 271k properties
CREATE INDEX IF NOT EXISTS idx_properties_snap_score_desc ON properties (snap_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties (state);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties (city);
CREATE INDEX IF NOT EXISTS idx_properties_county_state ON properties (county, state);
CREATE INDEX IF NOT EXISTS idx_properties_updated_at ON properties (updated_at DESC);

-- Composite index for common filter+sort pattern
CREATE INDEX IF NOT EXISTS idx_properties_state_city_snap ON properties (state, city, snap_score DESC NULLS LAST);