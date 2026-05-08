-- =============================================================================
-- P1.6c: mark-my-watchlist-events-seen RPC
-- =============================================================================
-- Adds a single SECURITY DEFINER function that marks all of the calling
-- user's unread, undismissed watchlist_intelligence_events as seen.
--
-- Called by the in-app ribbon (P1.6c) when the user clicks "View →".
-- Drains the ribbon on engagement and prevents the weekly digest from
-- re-surfacing already-viewed events.
--
-- Scope:
--   - SECURITY DEFINER lets the function bypass the user's INSERT/UPDATE
--     RLS policies (which is fine because we restrict by auth.uid()
--     inside the body — a user can only ever mark THEIR OWN events).
--   - GRANT EXECUTE to authenticated only; service_role doesn't need it.
--
-- Strict scope:
--   - one new SQL function; no schema change
--   - no AI / no SnapScore / no billing/auth/export changes
--   - additive — coexists with existing "user can UPDATE own events"
--     policy on watchlist_intelligence_events from P1.5
--
-- Refs: docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §11 (Loop 2)
-- Rollback: supabase/migrations/rollback/20260509_p1_6c_mark_seen.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_mark_my_watchlist_events_seen()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_user_id IS NULL THEN
    -- Caller is unauthenticated; nothing to mark.
    RETURN 0;
  END IF;

  UPDATE public.watchlist_intelligence_events
  SET seen_at = now()
  WHERE user_id = v_user_id
    AND seen_at IS NULL
    AND dismissed_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mark_my_watchlist_events_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mark_my_watchlist_events_seen() TO authenticated;

COMMENT ON FUNCTION public.fn_mark_my_watchlist_events_seen() IS
  'Marks the calling user''s unread/undismissed watchlist_intelligence_events
   as seen (seen_at = now()). SECURITY DEFINER but scoped to auth.uid() in
   the body — a user can only ever mark their OWN events. Returns the
   number of rows updated. P1.6c retention loop.';
