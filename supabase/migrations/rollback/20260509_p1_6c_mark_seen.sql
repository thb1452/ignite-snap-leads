-- =============================================================================
-- P1.6c mark-seen RPC — ROLLBACK
-- =============================================================================
-- Drops the fn_mark_my_watchlist_events_seen function.
--
-- WARNING: After rollback, the deployed WatchlistChangeRibbon component
-- will fail when calling supabase.rpc("fn_mark_my_watchlist_events_seen")
-- but the failure is silently caught (.catch(() => {})) so the user
-- experience is unaffected: the click still navigates to /saved, just
-- without server-side mark-seen. Recommended to revert both this
-- migration and the ribbon's onClick wiring together via git revert.
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260509_p1_6c_mark_seen.sql
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_mark_my_watchlist_events_seen();

COMMIT;
