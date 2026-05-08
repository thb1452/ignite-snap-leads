-- =============================================================================
-- P1.6b: Watchlist Digest Helper (commit 1 / 2)
-- =============================================================================
-- Adds a single STABLE SECURITY DEFINER function that returns the top unseen
-- watchlist_intelligence_events for a user, joined to properties for the
-- email-rendering fields the digest needs.
--
-- Schema-only, additive. Used by the rewritten weekly-digest in commit 2,
-- and reusable from a future admin ribbon (P1.6c).
--
-- Strict scope:
--   - no new tables / columns / triggers
--   - no AI / no SnapScore changes
--   - no billing/unlock/export changes
--   - additive only
--
-- See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §11 (Loop 1 — Watchlist
-- event loop).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_top_watchlist_events_for_user(
  p_user_id     uuid,
  p_window_days int DEFAULT 7,
  p_limit       int DEFAULT 5
) RETURNS TABLE (
  event_id        uuid,
  signal_delta_id uuid,
  property_id     uuid,
  address         text,
  city            text,
  state           text,
  snap_score      int,
  delta_type      text,
  severity        smallint,
  source          text,
  created_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wie.id              AS event_id,
    wie.signal_delta_id,
    wie.property_id,
    p.address,
    p.city,
    p.state,
    p.snap_score,
    wie.delta_type::text AS delta_type,
    wie.severity,
    wie.source,
    wie.created_at
  FROM public.watchlist_intelligence_events wie
  JOIN public.properties p ON p.id = wie.property_id
  WHERE wie.user_id = p_user_id
    AND wie.created_at >= now() - (GREATEST(p_window_days, 1) || ' days')::interval
    AND wie.seen_at      IS NULL
    AND wie.dismissed_at IS NULL
  ORDER BY wie.severity DESC, wie.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_top_watchlist_events_for_user(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_top_watchlist_events_for_user(uuid, int, int) TO service_role;

COMMENT ON FUNCTION public.fn_top_watchlist_events_for_user(uuid, int, int) IS
  'Returns top unseen, undismissed watchlist events for a user in the last
   N days, sorted by severity DESC then created_at DESC. SECURITY DEFINER
   so the digest worker (service_role) can call it cleanly. Reusable from
   admin contexts; the user-facing UI should use the RLS-scoped table read
   directly, not this function.';
