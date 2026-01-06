-- ============================================================================
-- Add Missing Indexes for Performance Optimization
-- Date: 2026-01-05
--
-- Addresses findings from database performance audit:
-- 1. Missing index on county column (used for filtering)
-- 2. Missing index on violations.violation_type (used in queries and exports)
-- 3. Missing GIN index on properties.violation_types array
-- ============================================================================

-- 1. Add index on county for case-insensitive filtering
-- Used in properties.ts:105 for county filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_county_lower
ON properties(lower(county));

-- 2. Add index on violations.violation_type
-- Used in FilterControls.tsx, Leads.tsx, and export functions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_violations_violation_type
ON violations(violation_type);

-- 3. Add GIN index on properties.violation_types array
-- Enables efficient array containment queries (@> operator)
-- Used in properties.ts:149 for violation type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_violation_types_gin
ON properties USING GIN(violation_types);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_properties_county_lower IS
'Supports case-insensitive county filtering. Created 2026-01-05 per performance audit.';

COMMENT ON INDEX idx_violations_violation_type IS
'Supports violation type filtering and joins. Created 2026-01-05 per performance audit.';

COMMENT ON INDEX idx_properties_violation_types_gin IS
'Supports array containment queries on violation_types. Created 2026-01-05 per performance audit.';
