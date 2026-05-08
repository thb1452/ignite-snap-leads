-- =============================================================================
-- P1.5 Watchlist Fan-out — ROLLBACK
-- =============================================================================
-- Reverses both 20260508010000_p1_5_watchlist_fanout_schema.sql and
-- 20260508010001_p1_5_watchlist_fanout_trigger.sql in one safe pass.
--
-- Idempotent (IF EXISTS everywhere). Does NOT touch P1 (#161) tables,
-- distress_events, violations, properties, or any pre-existing infrastructure.
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260508_p1_5_watchlist_fanout.sql
--
-- WARNING: dropping watchlist_intelligence_events destroys all per-user
-- event history. saved_markets entries are user-owned and also destroyed.
-- =============================================================================

BEGIN;

-- ── 1. Drop trigger first so no further enqueues happen ───────────────────
DROP TRIGGER IF EXISTS trg_enqueue_watchlist_fanout ON public.signal_deltas;

-- ── 2. Drop functions ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_enqueue_watchlist_fanout_on_delta();

DROP FUNCTION IF EXISTS public.enqueue_watchlist_fanout(jsonb);
DROP FUNCTION IF EXISTS public.read_watchlist_fanout_batch(int, int);
DROP FUNCTION IF EXISTS public.delete_watchlist_fanout(bigint);
DROP FUNCTION IF EXISTS public.move_watchlist_fanout_to_dlq(bigint, jsonb);

-- ── 3. Drop view ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_watchlist_events_last_24h;

-- ── 4. Drop tables ────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.watchlist_intelligence_events CASCADE;
DROP TABLE IF EXISTS public.user_signal_preferences      CASCADE;
DROP TABLE IF EXISTS public.saved_markets                CASCADE;

-- ── 5. Revert agent_runs.job_table CHECK to P1 state ──────────────────────
-- Keeps the P1 'pgmq:signal_delta_processing' value but drops the P1.5
-- 'pgmq:watchlist_event_fanout' value.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%watchlist_event_fanout%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', v_constraint_name);
    -- Reapply P1 set (signal_delta_processing kept, watchlist_event_fanout removed)
    ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_job_table_check
      CHECK (job_table IN (
        'enrichment_agent_jobs',
        'foia_request_jobs',
        'pgmq:signal_delta_processing'
      ));
  END IF;
END $$;

-- ── 6. Drop pgmq queues ───────────────────────────────────────────────────
DO $$ BEGIN PERFORM pgmq.drop_queue('watchlist_event_fanout');     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.drop_queue('watchlist_event_fanout_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 7. Wipe watchlist_fanout_worker rows from agent_runs ──────────────────
DELETE FROM public.agent_runs WHERE agent_name = 'watchlist_fanout_worker';

COMMIT;

-- Note: the watchlist-fanout-worker edge function is left in place. Removing
-- it requires `supabase functions delete watchlist-fanout-worker` separately.
