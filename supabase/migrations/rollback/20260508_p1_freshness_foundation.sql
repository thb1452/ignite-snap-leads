-- =============================================================================
-- P1 Freshness Foundation — ROLLBACK
-- =============================================================================
-- Reverses both 20260508000000_p1_freshness_foundation_schema.sql and
-- 20260508000001_p1_freshness_foundation_trigger.sql in a single safe pass.
--
-- Run order matters: drop trigger → drop functions → drop views → drop tables
-- → drop enums → revert agent_runs CHECK constraint → drop pgmq queues.
--
-- This rollback is IDEMPOTENT (uses IF EXISTS everywhere) and DOES NOT touch
-- distress_events, violations, properties, or any pre-existing infrastructure.
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260508_p1_freshness_foundation.sql
--
-- WARNING: dropping signal_deltas / property_snapshots / violation_events
-- destroys all accumulated freshness data. Inserted rows cannot be recovered
-- after this script runs.
-- =============================================================================

BEGIN;

-- ── 1. Drop trigger first so no further enqueues happen ───────────────────
DROP TRIGGER IF EXISTS trg_enqueue_signal_delta_processing ON public.violations;

-- ── 2. Drop functions (trigger first, then classifier, then RPC wrappers) ─
DROP FUNCTION IF EXISTS public.fn_enqueue_signal_delta_on_violation_change();
DROP FUNCTION IF EXISTS public.fn_classify_deltas(jsonb, jsonb);

DROP FUNCTION IF EXISTS public.enqueue_signal_delta(jsonb);
DROP FUNCTION IF EXISTS public.read_signal_delta_batch(int, int);
DROP FUNCTION IF EXISTS public.delete_signal_delta(bigint);
DROP FUNCTION IF EXISTS public.move_signal_delta_to_dlq(bigint, jsonb);

-- ── 3. Drop views ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_property_timeline;
DROP VIEW IF EXISTS public.v_signal_deltas_last_hour;
DROP VIEW IF EXISTS public.v_property_snapshots_last_hour;

-- ── 4. Drop tables ─────────────────────────────────────────────────────────
-- Order: signal_deltas → property_snapshots → violation_events → jurisdiction_freshness
-- (no FKs between them, but keeps ordering predictable)
DROP TABLE IF EXISTS public.signal_deltas CASCADE;
DROP TABLE IF EXISTS public.property_snapshots CASCADE;
DROP TABLE IF EXISTS public.violation_events CASCADE;
DROP TABLE IF EXISTS public.jurisdiction_freshness CASCADE;

-- ── 5. Drop enums ──────────────────────────────────────────────────────────
DROP TYPE IF EXISTS public.signal_delta_type;
DROP TYPE IF EXISTS public.violation_event_type;
DROP TYPE IF EXISTS public.jurisdiction_staleness_state;

-- ── 6. Revert agent_runs.job_table CHECK constraint to original values ────
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%signal_delta_processing%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_job_table_check
      CHECK (job_table IN ('enrichment_agent_jobs','foia_request_jobs'));
  END IF;
END $$;

-- ── 7. Drop pgmq queues (drops underlying tables) ─────────────────────────
DO $$ BEGIN PERFORM pgmq.drop_queue('signal_delta_processing'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.drop_queue('signal_delta_processing_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 8. Drop any agent_runs rows for this worker ───────────────────────────
-- Optional cleanup; lets the agent_runs table return to its pre-P1 state.
DELETE FROM public.agent_runs WHERE agent_name = 'signal_delta_worker';

COMMIT;

-- Note: the signal-delta-worker edge function is left in place. Removing it
-- requires a separate `supabase functions delete signal-delta-worker` call;
-- it cannot be done from a SQL migration.
