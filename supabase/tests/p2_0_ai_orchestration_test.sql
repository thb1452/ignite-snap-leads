-- =============================================================================
-- P2.0 AI Orchestration Foundation — SQL self-test
-- =============================================================================
-- Wrapped in BEGIN/ROLLBACK; leaves no trace.
--
-- Asserts (10 blocks):
--   1. tables ai_brief_generations + ai_budget_envelopes exist
--   2. enums exist (ai_generation_trigger, ai_budget_scope,
--      ai_budget_hard_action, ai_brief_confidence_band)
--   3. natural-key uniqueness on envelopes (global vs scoped)
--   4. fn_current_month_key returns 'YYYY-MM' format
--   5. fn_can_consume_ai with no envelope returns allowed=true, reason='no_envelope'
--   6. fn_can_consume_ai under soft threshold → allowed, no warn
--   7. fn_can_consume_ai over soft threshold → allowed + warn
--   8. fn_can_consume_ai over hard cap with action='block' → allowed=false
--   9. fn_can_consume_ai with hard_action='warn' over cap → allowed + warn
--  10. fn_record_ai_consumption increments envelope; idempotent on missing row
--
-- Run via: psql $STAGING_DB_URL -f supabase/tests/p2_0_ai_orchestration_test.sql
-- =============================================================================

BEGIN;

-- ── Test 1: tables exist ──────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema='public' AND table_name='ai_brief_generations';
  ASSERT FOUND, 'Test 1 failed: ai_brief_generations missing';
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema='public' AND table_name='ai_budget_envelopes';
  ASSERT FOUND, 'Test 1 failed: ai_budget_envelopes missing';
  RAISE NOTICE 'Test 1 PASSED: both tables exist';
END $$;

-- ── Test 2: enums exist ───────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_type WHERE typname = 'ai_generation_trigger';
  ASSERT FOUND, 'Test 2 failed: ai_generation_trigger enum missing';
  PERFORM 1 FROM pg_type WHERE typname = 'ai_budget_scope';
  ASSERT FOUND, 'Test 2 failed: ai_budget_scope enum missing';
  PERFORM 1 FROM pg_type WHERE typname = 'ai_budget_hard_action';
  ASSERT FOUND, 'Test 2 failed: ai_budget_hard_action enum missing';
  PERFORM 1 FROM pg_type WHERE typname = 'ai_brief_confidence_band';
  ASSERT FOUND, 'Test 2 failed: ai_brief_confidence_band enum missing';
  RAISE NOTICE 'Test 2 PASSED: all 4 enums exist';
END $$;

-- ── Test 3: natural-key uniqueness ────────────────────────────────────────
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_unique_violation boolean := false;
BEGIN
  -- Two global rows for the same month should clash
  INSERT INTO public.ai_budget_envelopes (scope, scope_id, month, token_cap, cost_cap_usd)
  VALUES ('global', NULL, '2099-01', 100, 10);
  BEGIN
    INSERT INTO public.ai_budget_envelopes (scope, scope_id, month, token_cap, cost_cap_usd)
    VALUES ('global', NULL, '2099-01', 200, 20);
  EXCEPTION WHEN unique_violation THEN
    v_unique_violation := true;
  END;
  ASSERT v_unique_violation, 'Test 3 failed: duplicate global envelope for same month should clash';

  -- Two user rows for different scope_id same month should NOT clash
  INSERT INTO public.ai_budget_envelopes (scope, scope_id, month, token_cap, cost_cap_usd)
  VALUES ('user', v_uid, '2099-01', 100, 10);
  INSERT INTO public.ai_budget_envelopes (scope, scope_id, month, token_cap, cost_cap_usd)
  VALUES ('user', gen_random_uuid(), '2099-01', 100, 10);
  RAISE NOTICE 'Test 3 PASSED: natural keys enforced correctly';
END $$;

-- ── Test 4: fn_current_month_key shape ────────────────────────────────────
DO $$
DECLARE
  v_key text := public.fn_current_month_key();
BEGIN
  ASSERT v_key ~ '^[0-9]{4}-[0-9]{2}$',
    format('Test 4 failed: month key shape wrong: %s', v_key);
  RAISE NOTICE 'Test 4 PASSED: month key shape is YYYY-MM';
END $$;

-- ── Test 5: no envelope → allowed=true ────────────────────────────────────
DO $$
DECLARE
  v_row record;
BEGIN
  -- A scope_id that doesn't have an envelope (and no global one exists for current month either)
  SELECT * INTO v_row FROM public.fn_can_consume_ai('user', gen_random_uuid(), 100, 0.10);
  ASSERT v_row.allowed = true, 'Test 5 failed: no envelope should not block';
  RAISE NOTICE 'Test 5 PASSED: no envelope → allowed=true';
END $$;

-- ── Test 6 + 7: soft threshold ────────────────────────────────────────────
DO $$
DECLARE
  v_month text := public.fn_current_month_key();
  v_row record;
BEGIN
  -- Provision a global envelope for THIS month with a known threshold
  -- Wipe any pre-existing global row for the current month inside the rollback
  DELETE FROM public.ai_budget_envelopes WHERE scope = 'global' AND month = v_month;

  INSERT INTO public.ai_budget_envelopes
    (scope, scope_id, month, token_cap, cost_cap_usd, tokens_used, soft_threshold_pct, hard_action)
  VALUES
    ('global', NULL, v_month, 1000, 10, 700, 80, 'block');

  -- Estimate 50 tokens → would land at 750/1000 = 75% (under 80% soft)
  SELECT * INTO v_row FROM public.fn_can_consume_ai('global', NULL, 50, 0);
  ASSERT v_row.allowed = true AND v_row.warn = false,
    format('Test 6 failed: under soft → no warn, got allowed=%s warn=%s', v_row.allowed, v_row.warn);

  -- Estimate 150 tokens → would land at 850/1000 = 85% (over 80% soft, under cap)
  SELECT * INTO v_row FROM public.fn_can_consume_ai('global', NULL, 150, 0);
  ASSERT v_row.allowed = true AND v_row.warn = true,
    format('Test 7 failed: over soft → warn, got allowed=%s warn=%s reason=%s',
           v_row.allowed, v_row.warn, v_row.reason);

  RAISE NOTICE 'Tests 6 + 7 PASSED: soft threshold gating';
END $$;

-- ── Test 8: hard cap with action='block' → allowed=false ──────────────────
DO $$
DECLARE
  v_month text := public.fn_current_month_key();
  v_row record;
BEGIN
  -- Existing global envelope from tests 6+7 has 700 used, 1000 cap, action='block'
  -- Estimate 400 tokens → would land at 1100/1000 → over cap
  SELECT * INTO v_row FROM public.fn_can_consume_ai('global', NULL, 400, 0);
  ASSERT v_row.allowed = false,
    format('Test 8 failed: over cap with block → denied, got allowed=%s reason=%s',
           v_row.allowed, v_row.reason);
  ASSERT v_row.reason = 'global_token_cap_exceeded',
    format('Test 8 failed: wrong reason: %s', v_row.reason);
  RAISE NOTICE 'Test 8 PASSED: hard cap with block denies';
END $$;

-- ── Test 9: hard cap with action='warn' → allowed=true + warn ─────────────
DO $$
DECLARE
  v_month text := public.fn_current_month_key();
  v_row record;
BEGIN
  -- Mutate the envelope to 'warn'
  UPDATE public.ai_budget_envelopes
  SET hard_action = 'warn'
  WHERE scope = 'global' AND month = v_month;

  SELECT * INTO v_row FROM public.fn_can_consume_ai('global', NULL, 400, 0);
  ASSERT v_row.allowed = true AND v_row.warn = true,
    format('Test 9 failed: warn-action over cap → allowed+warn, got allowed=%s warn=%s',
           v_row.allowed, v_row.warn);
  RAISE NOTICE 'Test 9 PASSED: warn-action proceeds with warning';
END $$;

-- ── Test 10: fn_record_ai_consumption debits + tolerates missing scope ────
DO $$
DECLARE
  v_month text := public.fn_current_month_key();
  v_uid uuid := gen_random_uuid();
  v_before int;
  v_after int;
BEGIN
  SELECT tokens_used INTO v_before
  FROM public.ai_budget_envelopes
  WHERE scope = 'global' AND month = v_month;

  -- Debit 50 tokens against global; user scope_id has no envelope (silent skip)
  PERFORM public.fn_record_ai_consumption('user', v_uid, 50, 0.0125);

  SELECT tokens_used INTO v_after
  FROM public.ai_budget_envelopes
  WHERE scope = 'global' AND month = v_month;

  ASSERT v_after = v_before + 50,
    format('Test 10 failed: global tokens_used should incr by 50: before=%s after=%s', v_before, v_after);
  RAISE NOTICE 'Test 10 PASSED: consumption debits global; missing scope envelope tolerated';
END $$;

-- ── Test 11: views are queryable ──────────────────────────────────────────
DO $$
BEGIN
  PERFORM * FROM public.v_ai_cost_by_trigger_30d LIMIT 0;
  PERFORM * FROM public.v_ai_cost_by_model_30d LIMIT 0;
  PERFORM * FROM public.v_ai_budget_status LIMIT 0;
  RAISE NOTICE 'Test 11 PASSED: all 3 admin views are queryable';
END $$;

-- ── Test 12: agent_runs.job_table accepts ai_orchestrator ────────────────
DO $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.agent_runs (
    agent_name, job_table, job_id, status, input_summary
  ) VALUES (
    'ai_orchestrator',
    'ai_orchestrator',
    gen_random_uuid(),
    'started',
    'self-test'
  ) RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'Test 12 failed';
  RAISE NOTICE 'Test 12 PASSED: agent_runs.job_table accepts ai_orchestrator';
END $$;

ROLLBACK;
