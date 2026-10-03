-- =============================================================================
-- P2.0: AI Orchestration Foundation — Schema
-- =============================================================================
-- Purpose:
-- Establishes two additive tables that the future ai-orchestrator edge
-- function (P2.1+) will consume:
--
--   1. ai_brief_generations — full audit log + cache of every AI brief
--      generation. One row per generation, keyed by (property_id,
--      prompt_version, input_hash). Lets us:
--        - skip an LLM call when the same property + same snapshot +
--          same prompt_version already produced a brief (cache hit)
--        - A/B prompt versions and roll back cleanly
--        - tell a customer exactly which generation produced the
--          brief on their property card (auditability)
--
--   2. ai_budget_envelopes — per-scope (global / org / user) monthly
--      token + cost caps. Drains atomically inside the same transaction
--      that creates an agent_runs row. Soft thresholds emit a warning;
--      hard caps block, queue, or warn depending on policy.
--
-- Plus one helper function fn_can_consume_ai(scope, scope_id, est_tokens)
-- so workers can check the envelope and atomically commit a draw in
-- one round-trip.
--
-- This migration is SCHEMA + STATELESS HELPER only. NO new edge functions,
-- NO triggers, NO consumers. The ai-orchestrator (P2.1) will be the first
-- consumer. Existing AI calls (generate-investor-brief, bulk-regenerate-briefs)
-- are NOT modified by this migration.
--
-- See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §10 + §13 + §14.
--
-- Strict scope:
--   - additive only; no schema changes to existing tables
--   - no AI calls; no LLM
--   - no SnapScore changes
--   - no billing/unlock/export changes
--   - no auth changes
--   - no public frontend changes
--   - coexists with all P1, P1.5, P1.6 work
--
-- Rollback: supabase/migrations/rollback/20260509_p2_0_ai_orchestration_schema.sql
-- =============================================================================

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.ai_generation_trigger AS ENUM (
    'user_request',
    'signal_delta',
    'backfill',
    'cron'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_budget_scope AS ENUM (
    'global',
    'org',
    'user'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_budget_hard_action AS ENUM (
    'block',
    'queue',
    'warn'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_brief_confidence_band AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── ai_brief_generations ───────────────────────────────────────────────────
-- Append-only audit + cache. One row per generation (or cache lookup-key).
-- Future: properties.latest_brief_id will reference this for fast joins.

CREATE TABLE IF NOT EXISTS public.ai_brief_generations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              uuid NOT NULL,                       -- soft FK
  prompt_version           text NOT NULL,
  model                    text NOT NULL,                       -- 'gpt-5.4-mini', 'gpt-5.4-nano', 'llama-3.3-70b', etc.
  input_hash               text NOT NULL,                       -- md5/sha of canonical input payload
  brief_text               text,                                -- nullable: pre-generation insert allowed
  structured_output        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- parsed model output (citations, tags, etc.)
  confidence_band          public.ai_brief_confidence_band,
  tokens_in                int  NOT NULL DEFAULT 0,
  tokens_out               int  NOT NULL DEFAULT 0,
  cost_usd                 numeric(10,6) NOT NULL DEFAULT 0,
  trigger                  public.ai_generation_trigger NOT NULL,
  trigger_signal_delta_id  uuid,                                -- soft FK to signal_deltas.id
  triggered_by_user_id     uuid,                                -- if trigger='user_request'
  langfuse_trace_id        text,
  agent_run_id             bigint,                              -- soft FK to agent_runs.id
  generated_at             timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Cache lookup: same property + same input + same prompt → return prior row
CREATE INDEX IF NOT EXISTS idx_ai_brief_generations_cache_key
  ON public.ai_brief_generations (property_id, input_hash, prompt_version, generated_at DESC);

-- Per-property timeline view of generation history
CREATE INDEX IF NOT EXISTS idx_ai_brief_generations_property_at
  ON public.ai_brief_generations (property_id, generated_at DESC);

-- Cost rollups by trigger / model
CREATE INDEX IF NOT EXISTS idx_ai_brief_generations_trigger_at
  ON public.ai_brief_generations (trigger, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_brief_generations_model_at
  ON public.ai_brief_generations (model, generated_at DESC);

-- Per-user trigger trail (so user-triggered generations are easy to query)
CREATE INDEX IF NOT EXISTS idx_ai_brief_generations_user_at
  ON public.ai_brief_generations (triggered_by_user_id, generated_at DESC)
  WHERE triggered_by_user_id IS NOT NULL;

ALTER TABLE public.ai_brief_generations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ai_brief_generations_admin_select"
    ON public.ai_brief_generations FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT/UPDATE is service-role only (the orchestrator). No policy required.

COMMENT ON TABLE public.ai_brief_generations IS
  'Append-only audit + cache for AI Investor Brief generations. Admin SELECT
   only; service-role writes via the ai-orchestrator (P2.1+). Lookup key:
   (property_id, input_hash, prompt_version) for cache hits. Future:
   properties.latest_brief_id will point at the latest row.';

-- ── ai_budget_envelopes ────────────────────────────────────────────────────
-- Per-scope monthly token + cost cap. Workers consult fn_can_consume_ai
-- before any LLM call; soft threshold = warn, hard cap = block/queue/warn.

CREATE TABLE IF NOT EXISTS public.ai_budget_envelopes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                public.ai_budget_scope NOT NULL,
  scope_id             uuid,                                    -- nullable when scope='global'
  month                text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),  -- 'YYYY-MM'
  token_cap            int NOT NULL CHECK (token_cap >= 0),
  cost_cap_usd         numeric(8,2) NOT NULL CHECK (cost_cap_usd >= 0),
  tokens_used          int NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  cost_used_usd        numeric(8,2) NOT NULL DEFAULT 0 CHECK (cost_used_usd >= 0),
  soft_threshold_pct   smallint NOT NULL DEFAULT 80 CHECK (soft_threshold_pct BETWEEN 1 AND 100),
  hard_action          public.ai_budget_hard_action NOT NULL DEFAULT 'queue',
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Natural key: (scope, scope_id, month). For global rows scope_id is NULL,
-- so we use a partial unique index per scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_budget_envelopes_global_natkey
  ON public.ai_budget_envelopes (month) WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_budget_envelopes_scoped_natkey
  ON public.ai_budget_envelopes (scope, scope_id, month) WHERE scope <> 'global';

CREATE INDEX IF NOT EXISTS idx_ai_budget_envelopes_month
  ON public.ai_budget_envelopes (month, scope);

DO $$ BEGIN
  CREATE TRIGGER trg_ai_budget_envelopes_updated_at
    BEFORE UPDATE ON public.ai_budget_envelopes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.ai_budget_envelopes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ai_budget_envelopes_admin_all"
    ON public.ai_budget_envelopes FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.ai_budget_envelopes IS
  'Per-scope (global/org/user) monthly token + cost cap. Drains atomically
   via fn_can_consume_ai. soft_threshold_pct → warn; hard_action governs
   what happens at 100% (block, queue, warn). Admin CRUD only; orchestrator
   writes via SECURITY DEFINER helper.';

-- ── fn_current_month_key ───────────────────────────────────────────────────
-- Returns 'YYYY-MM' for the current UTC date. STABLE.

CREATE OR REPLACE FUNCTION public.fn_current_month_key()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
$$;

COMMENT ON FUNCTION public.fn_current_month_key() IS
  'Current month key in YYYY-MM (UTC). Used by fn_can_consume_ai to find
   the active envelope row.';

-- ── fn_can_consume_ai ──────────────────────────────────────────────────────
-- Atomic budget check. SECURITY DEFINER so orchestrator (service_role) can
-- both read + UPDATE the envelope in one transaction. Returns a row with
-- the decision so the caller knows whether to proceed AND whether to warn.
--
-- Behavior:
--   - If no global envelope exists for the current month → returns
--     allowed=true, reason='no_envelope'. Provisioning is admin's job.
--   - If global envelope exists and current usage + est_tokens would
--     exceed token_cap, return allowed based on hard_action:
--       'block' → allowed=false
--       'queue' → allowed=false (caller should requeue with backoff)
--       'warn'  → allowed=true (proceed despite cap)
--   - If usage would exceed soft threshold, set warn=true.
--   - When scope!='global', also evaluate the scoped envelope; deny if
--     either scope blocks/queues. Tightest cap wins.
--
-- This function only READS the envelope; it does NOT debit. Debiting
-- happens after the LLM call returns the actual tokens used, via
-- fn_record_ai_consumption (also added in this migration).

CREATE OR REPLACE FUNCTION public.fn_can_consume_ai(
  p_scope          public.ai_budget_scope,
  p_scope_id       uuid,
  p_est_tokens     int,
  p_est_cost_usd   numeric(10,6) DEFAULT 0
) RETURNS TABLE (
  allowed            boolean,
  warn               boolean,
  reason             text,
  envelope_id        uuid,
  scope_used_pct     smallint,
  global_used_pct    smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month            text := public.fn_current_month_key();
  v_global_env       public.ai_budget_envelopes%ROWTYPE;
  v_scoped_env       public.ai_budget_envelopes%ROWTYPE;
  v_global_pct       smallint := 0;
  v_scoped_pct       smallint := 0;
  v_warn             boolean := false;
  v_allowed          boolean := true;
  v_reason           text := 'no_envelope';
  v_envelope_id      uuid := NULL;
BEGIN
  IF p_est_tokens < 0 THEN
    p_est_tokens := 0;
  END IF;

  -- Always check the global envelope first
  SELECT * INTO v_global_env
  FROM public.ai_budget_envelopes
  WHERE scope = 'global' AND month = v_month
  LIMIT 1;

  IF FOUND THEN
    v_envelope_id := v_global_env.id;
    IF v_global_env.token_cap > 0 THEN
      v_global_pct := LEAST(
        ((v_global_env.tokens_used + p_est_tokens)::numeric / v_global_env.token_cap * 100)::smallint,
        100::smallint
      );
    END IF;

    IF v_global_env.tokens_used + p_est_tokens > v_global_env.token_cap THEN
      v_reason := 'global_token_cap_exceeded';
      IF v_global_env.hard_action IN ('block', 'queue') THEN
        v_allowed := false;
        v_warn := true;
        RETURN QUERY SELECT v_allowed, v_warn, v_reason, v_envelope_id,
                            v_scoped_pct, v_global_pct;
        RETURN;
      ELSE
        v_warn := true;  -- 'warn' action proceeds with a warning
      END IF;
    ELSIF v_global_pct >= v_global_env.soft_threshold_pct THEN
      v_warn := true;
      v_reason := 'global_soft_threshold';
    ELSE
      v_reason := 'within_global_envelope';
    END IF;
  END IF;

  -- Scoped envelope (org/user) if applicable
  IF p_scope <> 'global' AND p_scope_id IS NOT NULL THEN
    SELECT * INTO v_scoped_env
    FROM public.ai_budget_envelopes
    WHERE scope = p_scope AND scope_id = p_scope_id AND month = v_month
    LIMIT 1;

    IF FOUND THEN
      IF v_envelope_id IS NULL THEN v_envelope_id := v_scoped_env.id; END IF;
      IF v_scoped_env.token_cap > 0 THEN
        v_scoped_pct := LEAST(
          ((v_scoped_env.tokens_used + p_est_tokens)::numeric / v_scoped_env.token_cap * 100)::smallint,
          100::smallint
        );
      END IF;

      IF v_scoped_env.tokens_used + p_est_tokens > v_scoped_env.token_cap THEN
        v_reason := 'scope_token_cap_exceeded';
        IF v_scoped_env.hard_action IN ('block', 'queue') THEN
          v_allowed := false;
          v_warn := true;
          RETURN QUERY SELECT v_allowed, v_warn, v_reason, v_envelope_id,
                              v_scoped_pct, v_global_pct;
          RETURN;
        ELSE
          v_warn := true;
        END IF;
      ELSIF v_scoped_pct >= v_scoped_env.soft_threshold_pct THEN
        v_warn := true;
        IF v_reason = 'within_global_envelope' OR v_reason = 'no_envelope' THEN
          v_reason := 'scope_soft_threshold';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_allowed, v_warn, v_reason, v_envelope_id,
                      v_scoped_pct, v_global_pct;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_consume_ai(public.ai_budget_scope, uuid, int, numeric)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_consume_ai(public.ai_budget_scope, uuid, int, numeric)
  TO service_role;

COMMENT ON FUNCTION public.fn_can_consume_ai(public.ai_budget_scope, uuid, int, numeric) IS
  'Pre-flight budget check for the ai-orchestrator. Reads global + (optionally)
   scoped envelope for the current month. Returns (allowed, warn, reason,
   envelope_id, scope_used_pct, global_used_pct). Does NOT debit usage —
   that happens via fn_record_ai_consumption after the actual LLM call.';

-- ── fn_record_ai_consumption ───────────────────────────────────────────────
-- Debits usage atomically against the appropriate envelopes. Called after
-- the LLM call returns (so we record actual tokens, not estimates).
--
-- - Always increments global envelope (auto-creates if missing with caller-
--   supplied defaults? No — admin must provision. Skip silently if missing).
-- - If scope != global, also increment the scoped envelope (skip if missing).

CREATE OR REPLACE FUNCTION public.fn_record_ai_consumption(
  p_scope         public.ai_budget_scope,
  p_scope_id      uuid,
  p_tokens        int,
  p_cost_usd      numeric(10,6)
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.fn_current_month_key();
BEGIN
  IF p_tokens < 0 THEN p_tokens := 0; END IF;
  IF p_cost_usd < 0 THEN p_cost_usd := 0; END IF;

  UPDATE public.ai_budget_envelopes
  SET tokens_used   = tokens_used + p_tokens,
      cost_used_usd = cost_used_usd + p_cost_usd,
      updated_at    = now()
  WHERE scope = 'global' AND month = v_month;

  IF p_scope <> 'global' AND p_scope_id IS NOT NULL THEN
    UPDATE public.ai_budget_envelopes
    SET tokens_used   = tokens_used + p_tokens,
        cost_used_usd = cost_used_usd + p_cost_usd,
        updated_at    = now()
    WHERE scope = p_scope AND scope_id = p_scope_id AND month = v_month;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_record_ai_consumption(public.ai_budget_scope, uuid, int, numeric)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_record_ai_consumption(public.ai_budget_scope, uuid, int, numeric)
  TO service_role;

COMMENT ON FUNCTION public.fn_record_ai_consumption(public.ai_budget_scope, uuid, int, numeric) IS
  'Debits the global + (optionally) scoped budget envelope for the current
   month. Skips silently if the envelope row is missing — provisioning is
   the admin''s responsibility, not the orchestrator''s.';

-- ── Extend agent_runs.job_table CHECK additively for the orchestrator ──────

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%signal_delta_processing%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%ai_orchestrator%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_job_table_check
      CHECK (job_table IN (
        'enrichment_agent_jobs',
        'foia_request_jobs',
        'pgmq:signal_delta_processing',
        'pgmq:watchlist_event_fanout',
        'ai_orchestrator'
      ));
  END IF;
END $$;

-- ── Admin views ────────────────────────────────────────────────────────────
-- Mirrors the §13 cost telemetry views. security_invoker so RLS gates rows.

CREATE OR REPLACE VIEW public.v_ai_cost_by_trigger_30d
WITH (security_invoker = true) AS
SELECT
  trigger::text                        AS trigger,
  count(*)                             AS generations,
  sum(tokens_in)                       AS tokens_in,
  sum(tokens_out)                      AS tokens_out,
  sum(cost_usd)::numeric(10,2)         AS cost_usd
FROM public.ai_brief_generations
WHERE generated_at >= now() - interval '30 days'
GROUP BY trigger
ORDER BY cost_usd DESC NULLS LAST;

COMMENT ON VIEW public.v_ai_cost_by_trigger_30d IS
  'Per-trigger AI cost rollup, 30-day window. Admin-only via RLS.';

CREATE OR REPLACE VIEW public.v_ai_cost_by_model_30d
WITH (security_invoker = true) AS
SELECT
  model,
  count(*)                             AS generations,
  sum(tokens_in)                       AS tokens_in,
  sum(tokens_out)                      AS tokens_out,
  sum(cost_usd)::numeric(10,2)         AS cost_usd,
  (sum(cost_usd)::numeric / NULLIF(count(*), 0))::numeric(10,4) AS avg_cost_per_call
FROM public.ai_brief_generations
WHERE generated_at >= now() - interval '30 days'
GROUP BY model
ORDER BY cost_usd DESC NULLS LAST;

COMMENT ON VIEW public.v_ai_cost_by_model_30d IS
  'Per-model AI cost rollup with avg cost-per-call. Admin-only via RLS.';

CREATE OR REPLACE VIEW public.v_ai_budget_status
WITH (security_invoker = true) AS
SELECT
  e.scope::text                                                  AS scope,
  e.scope_id,
  e.month,
  e.token_cap,
  e.tokens_used,
  CASE WHEN e.token_cap > 0
       THEN (e.tokens_used::numeric / e.token_cap * 100)::smallint
       ELSE NULL END                                              AS used_pct,
  e.cost_cap_usd,
  e.cost_used_usd,
  e.soft_threshold_pct,
  e.hard_action::text                                            AS hard_action,
  e.updated_at
FROM public.ai_budget_envelopes e
WHERE e.month = public.fn_current_month_key()
ORDER BY e.scope, e.scope_id NULLS FIRST;

COMMENT ON VIEW public.v_ai_budget_status IS
  'Current-month budget status across all envelopes. Admin-only via RLS.';
