-- =============================================================================
-- P2.0 AI Orchestration Foundation — ROLLBACK
-- =============================================================================
-- Reverses 20260509020000_p2_0_ai_orchestration_schema.sql.
-- Idempotent. Safe because no consumers exist yet (orchestrator lands in P2.1+).
--
-- Usage:
--   psql $TARGET_DB_URL -f supabase/migrations/rollback/20260509_p2_0_ai_orchestration_schema.sql
--
-- WARNING: dropping ai_brief_generations destroys all generation audit
-- history. Won't matter today (table is empty) — keep an eye on it once
-- the orchestrator starts writing.
-- =============================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_ai_budget_status;
DROP VIEW IF EXISTS public.v_ai_cost_by_model_30d;
DROP VIEW IF EXISTS public.v_ai_cost_by_trigger_30d;

DROP FUNCTION IF EXISTS public.fn_record_ai_consumption(public.ai_budget_scope, uuid, int, numeric);
DROP FUNCTION IF EXISTS public.fn_can_consume_ai(public.ai_budget_scope, uuid, int, numeric);
DROP FUNCTION IF EXISTS public.fn_current_month_key();

DROP TABLE IF EXISTS public.ai_brief_generations CASCADE;
DROP TABLE IF EXISTS public.ai_budget_envelopes CASCADE;

DROP TYPE IF EXISTS public.ai_brief_confidence_band;
DROP TYPE IF EXISTS public.ai_budget_hard_action;
DROP TYPE IF EXISTS public.ai_budget_scope;
DROP TYPE IF EXISTS public.ai_generation_trigger;

-- Revert agent_runs.job_table CHECK to remove 'ai_orchestrator'
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%ai_orchestrator%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', v_constraint_name);
    -- Restore the previous P1.5 + P1.6a set
    ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_job_table_check
      CHECK (job_table IN (
        'enrichment_agent_jobs',
        'foia_request_jobs',
        'pgmq:signal_delta_processing',
        'pgmq:watchlist_event_fanout'
      ));
  END IF;
END $$;

DELETE FROM public.agent_runs WHERE agent_name = 'ai_orchestrator';

COMMIT;
