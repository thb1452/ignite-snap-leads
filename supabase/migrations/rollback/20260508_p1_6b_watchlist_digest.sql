-- =============================================================================
-- P1.6b Watchlist Digest Helper — ROLLBACK
-- =============================================================================
-- Reverses 20260508030000_p1_6b_watchlist_digest_helper.sql.
--
-- Idempotent. Does NOT touch any tables, the cron schedule, or other
-- existing functions.
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260508_p1_6b_watchlist_digest.sql
--
-- WARNING: The deployed weekly-digest function calls
-- fn_top_watchlist_events_for_user. Rolling back this SQL alone will cause
-- the digest to log a warning per user and fall through to the system-wide
-- email path (the worker is defensive — see getUserWatchlistEvents catch).
-- That fallback IS the previous behavior, so users will still receive the
-- old digest format. To complete the rollback cleanly, also revert the
-- worker commit:
--
--   git revert <merge-sha-of-p1.6b>
--   supabase functions deploy weekly-digest
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_top_watchlist_events_for_user(uuid, int, int);

COMMIT;
