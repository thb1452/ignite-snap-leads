-- Fix search path on backfill function
ALTER FUNCTION backfill_violation_dates_batch(int) SET search_path = public;