-- ============================================================================
-- Partial index for backfill scans on unprocessed properties.
--
-- The backfill_property_aggregates_batch function exclusively queries:
--   WHERE total_violations IS NULL
-- Without a partial index, every batch call does a full sequential scan
-- through the entire properties table to find NULL rows. With 471K+ rows
-- that's significant I/O for each of the ~472 batches needed to complete.
--
-- This mirrors the existing idx_properties_snap_insight_null pattern.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_properties_total_violations_null
ON properties(id)
WHERE total_violations IS NULL;
