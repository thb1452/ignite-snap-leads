-- Fix search_path for the new functions
ALTER FUNCTION generate_enforcement_insight SET search_path = public;
ALTER FUNCTION backfill_insights_batch SET search_path = public;
ALTER FUNCTION refresh_outdated_insights_batch SET search_path = public;