-- =============================================================================
-- P1.5: Watchlist Fan-out — Trigger (commit 2 / 2)
-- =============================================================================
-- Adds a single trigger on signal_deltas INSERT that enqueues a
-- watchlist_event_fanout pgmq message. The body is intentionally tiny —
-- a single PERFORM enqueue_watchlist_fanout(...). All the actual matching
-- (saved_property / list / saved_market) happens in the worker.
--
-- COEXISTENCE: this is a NEW trigger on signal_deltas (a P1 table). No
-- existing triggers exist on signal_deltas, so no name collision.
--
-- See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §6.
-- =============================================================================

-- ── Trigger function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_enqueue_watchlist_fanout_on_delta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Single tiny enqueue. Worker handles all matching, dedup, and writes.
  PERFORM public.enqueue_watchlist_fanout(jsonb_build_object(
    'signal_delta_id', NEW.id,
    'property_id',     NEW.property_id,
    'delta_type',      NEW.delta_type::text,
    'severity',        NEW.severity,
    'detected_at',     NEW.detected_at
  ));
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_enqueue_watchlist_fanout_on_delta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_watchlist_fanout_on_delta() TO service_role;

COMMENT ON FUNCTION public.fn_enqueue_watchlist_fanout_on_delta() IS
  'Trigger function. Single pgmq.send via enqueue_watchlist_fanout wrapper.
   No business logic in the trigger; matching happens in the worker.';

-- ── Trigger ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_enqueue_watchlist_fanout ON public.signal_deltas;

CREATE TRIGGER trg_enqueue_watchlist_fanout
  AFTER INSERT ON public.signal_deltas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enqueue_watchlist_fanout_on_delta();

COMMENT ON TRIGGER trg_enqueue_watchlist_fanout ON public.signal_deltas IS
  'Enqueues a watchlist_event_fanout pgmq message on every signal_delta
   INSERT. Tiny body. Worker reads back the delta + does all matching.';
