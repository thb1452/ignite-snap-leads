-- =============================================================================
-- P1.6a Saved-Market Filter Matcher — ROLLBACK
-- =============================================================================
-- Reverses 20260508020000_p1_6a_saved_market_matcher.sql.
--
-- Idempotent. Does NOT touch P1.5 fan-out worker (which would error if it
-- tried to call the dropped functions — see notes below).
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260508_p1_6a_saved_market_matcher.sql
--
-- WARNING: After this rolls back, the deployed watchlist-fanout-worker will
-- fail when calling fn_find_saved_market_matches because that RPC is gone.
-- To complete the rollback safely:
--   1. Either redeploy a worker version *without* the saved_market step
--      (revert the commit 2 worker change), OR
--   2. Recreate the SQL functions and roll back fully later.
-- The recommended path is to revert both the worker commit and the SQL
-- migration in the same operation.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_find_saved_market_matches(jsonb, text);
DROP FUNCTION IF EXISTS public.fn_property_matches_filter(jsonb, jsonb);

COMMIT;
