-- Create GIN index for fast array containment queries on violation_types
-- This dramatically speeds up array operations
CREATE INDEX IF NOT EXISTS idx_properties_violation_types_gin 
ON properties USING GIN (violation_types);