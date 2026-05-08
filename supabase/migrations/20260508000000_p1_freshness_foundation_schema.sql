-- =============================================================================
-- P1 Phase 2: Freshness Foundation — Schema (commit 1 / 2)
-- =============================================================================
-- Purpose:
-- Establish the moat-creating freshness layer described in
-- docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §4–5, §14–15, §19:
--   - violation_events       (append-only event log)
--   - property_snapshots     (sparse, hash-deduplicated state snapshots)
--   - signal_deltas          (typed, severity-scored delta stream)
--   - jurisdiction_freshness (per-county SLA registry)
--   - pgmq queue + DLQ + RPC wrappers for signal_delta_processing
--   - admin views for Mission Control
--
-- This migration is SCHEMA-ONLY. No triggers, no business logic, no LLM.
-- The trigger function + classification function + worker land in the
-- companion migration 20260508000001_*.sql so they can be reviewed and
-- rolled back independently.
--
-- COEXISTENCE (verified 2026-05-08):
--   - public.distress_events (added 20260421011308) is preserved AS-IS.
--     signal_deltas is a sibling stream — finer typing, severity 0–100,
--     full-state snapshots, designed for P1.5 watchlist fan-out.
--   - public.violations table preserved AS-IS (id uuid, created
--     20251006003730). No ALTER on violations.
--   - agent_runs.job_table CHECK constraint is EXTENDED additively to allow
--     'pgmq:signal_delta_processing'. The original migration explicitly
--     anticipates this: "Future agent types extend the CHECK via migration."
--
-- ROLLBACK:
--   See supabase/migrations/rollback/20260508_p1_freshness_foundation.sql
-- =============================================================================

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.violation_event_type AS ENUM (
    'observed',
    'status_changed',
    'closed',
    'reopened',
    'description_updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.signal_delta_type AS ENUM (
    'new_open_violation',
    'enforcement_escalation',
    'water_shutoff_added',
    'repeat_offender_threshold_crossed',
    'extended_enforcement_milestone',
    'closed_after_long_open'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.jurisdiction_staleness_state AS ENUM (
    'fresh', 'aging', 'stale', 'unreachable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── violation_events ───────────────────────────────────────────────────────
-- Append-only log of state transitions on violations. Written by the
-- signal-delta worker (NOT by ingestion triggers). Sibling to distress_events.

CREATE TABLE IF NOT EXISTS public.violation_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id  uuid NOT NULL,                  -- soft FK (violations may be re-created)
  property_id   uuid NOT NULL,
  event_type    public.violation_event_type NOT NULL,
  prev_value    jsonb,
  new_value     jsonb,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  source_run_id bigint,                          -- agent_runs.id (soft FK; bigserial)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_violation_events_property_detected
  ON public.violation_events (property_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_violation_events_violation
  ON public.violation_events (violation_id);
CREATE INDEX IF NOT EXISTS idx_violation_events_event_type
  ON public.violation_events (event_type, detected_at DESC);

ALTER TABLE public.violation_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "violation_events_admin_select"
    ON public.violation_events FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.violation_events IS
  'Append-only event log over violations. Written by signal-delta-worker.
   Admin-only until P1.5 watchlist fan-out exposes user-scoped slices.
   Coexists with distress_events (sibling stream).';

-- ── property_snapshots ─────────────────────────────────────────────────────
-- Sparse JSONB snapshots of property + violation aggregate state for diffing.
-- Hash-deduplicated: same payload_hash on same property = no insert.

CREATE TABLE IF NOT EXISTS public.property_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL,
  snapshot_at   timestamptz NOT NULL DEFAULT now(),
  payload       jsonb NOT NULL,
  payload_hash  text NOT NULL,
  source_run_id bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Same (property, hash) means same state — dedup on insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_snapshots_property_hash
  ON public.property_snapshots (property_id, payload_hash);
CREATE INDEX IF NOT EXISTS idx_property_snapshots_property_at
  ON public.property_snapshots (property_id, snapshot_at DESC);

ALTER TABLE public.property_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "property_snapshots_admin_select"
    ON public.property_snapshots FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.property_snapshots IS
  'Sparse snapshots of property state for diffing. Hash-deduplicated.
   Retention: 365 days (managed by ops cron in P3, not this PR).';

-- ── signal_deltas ──────────────────────────────────────────────────────────
-- Typed, severity-scored delta stream. Product surface for "what changed".

CREATE TABLE IF NOT EXISTS public.signal_deltas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       uuid NOT NULL,
  delta_type        public.signal_delta_type NOT NULL,
  severity          smallint NOT NULL CHECK (severity BETWEEN 0 AND 100),
  prev_state        jsonb,
  new_state         jsonb,
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  snap_score_before integer,
  snap_score_after  integer,
  detected_at       timestamptz NOT NULL DEFAULT now(),
  source_event_id   uuid,                          -- violation_events.id (soft FK)
  source_run_id     bigint,                        -- agent_runs.id (soft FK)
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_deltas_property_detected
  ON public.signal_deltas (property_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_deltas_type_severity
  ON public.signal_deltas (delta_type, severity DESC, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_deltas_detected
  ON public.signal_deltas (detected_at DESC);

ALTER TABLE public.signal_deltas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "signal_deltas_admin_select"
    ON public.signal_deltas FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.signal_deltas IS
  'Typed, severity-scored delta stream over property state.
   Admin-only until P1.5 watchlist fan-out exposes user-scoped slices.';

-- ── jurisdiction_freshness ─────────────────────────────────────────────────
-- Per-jurisdiction SLA registry. Authenticated SELECT (so frontend can show
-- "verified N days ago"); admin write (cron only). For P1, this is a
-- registry-only table — populated manually or by P3 source-reliability cron.

CREATE TABLE IF NOT EXISTS public.jurisdiction_freshness (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state           text NOT NULL CHECK (length(state) = 2),
  county_fips     text,
  source_type     text NOT NULL CHECK (source_type IN (
                    'code_violations','tax_delinquency','water_shutoff',
                    'liens','permits','assessor','parcel'
                  )),
  sla_days        smallint NOT NULL DEFAULT 7,
  last_fresh_at   timestamptz,
  staleness_state public.jurisdiction_staleness_state NOT NULL DEFAULT 'unreachable',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jurisdiction_freshness_natkey
  ON public.jurisdiction_freshness (state, COALESCE(county_fips, ''), source_type);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_freshness_state
  ON public.jurisdiction_freshness (staleness_state, last_fresh_at);

DO $$ BEGIN
  CREATE TRIGGER trg_jurisdiction_freshness_updated_at
    BEFORE UPDATE ON public.jurisdiction_freshness
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.jurisdiction_freshness ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "jurisdiction_freshness_authenticated_select"
    ON public.jurisdiction_freshness FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "jurisdiction_freshness_admin_write"
    ON public.jurisdiction_freshness FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.jurisdiction_freshness IS
  'Per-jurisdiction freshness SLA. Authenticated read (so frontend can
   surface "verified N days ago"); admin write (cron only).';

-- ── pgmq queue: signal_delta_processing ────────────────────────────────────
-- Mirrors the email-queue pattern in 20260410001627_email_infra.sql.

DO $$ BEGIN PERFORM pgmq.create('signal_delta_processing'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('signal_delta_processing_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── RPC wrappers (mirror email pattern) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_signal_delta(
  p_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN pgmq.send('signal_delta_processing', p_payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('signal_delta_processing');
  RETURN pgmq.send('signal_delta_processing', p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_signal_delta_batch(
  p_batch_size int DEFAULT 10,
  p_vt int DEFAULT 30
) RETURNS TABLE (msg_id bigint, read_ct int, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
    SELECT q.msg_id, q.read_ct, q.message
    FROM pgmq.read('signal_delta_processing', p_vt, p_batch_size) q;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('signal_delta_processing');
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_signal_delta(
  p_msg_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN pgmq.delete('signal_delta_processing', p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_signal_delta_to_dlq(
  p_msg_id bigint,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  BEGIN
    PERFORM pgmq.send('signal_delta_processing_dlq', p_payload);
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create('signal_delta_processing_dlq');
    PERFORM pgmq.send('signal_delta_processing_dlq', p_payload);
  END;
  PERFORM pgmq.delete('signal_delta_processing', p_msg_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_signal_delta(jsonb)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_signal_delta_batch(int, int)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_signal_delta(bigint)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_signal_delta_to_dlq(bigint, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_signal_delta(jsonb)        TO service_role;
GRANT EXECUTE ON FUNCTION public.read_signal_delta_batch(int, int)  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_signal_delta(bigint)        TO service_role;
GRANT EXECUTE ON FUNCTION public.move_signal_delta_to_dlq(bigint, jsonb) TO service_role;

-- ── Extend agent_runs.job_table CHECK to allow signal-delta worker ─────────
-- Original constraint allowed only ('enrichment_agent_jobs','foia_request_jobs').
-- We add 'pgmq:signal_delta_processing'. Additive: existing rows still pass.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%enrichment_agent_jobs%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_job_table_check
    CHECK (job_table IN (
      'enrichment_agent_jobs',
      'foia_request_jobs',
      'pgmq:signal_delta_processing'
    ));
END $$;

-- agent_runs.job_id is uuid. The pgmq message_id is bigint, but agent_runs.job_id
-- is the *originating* job's identifier. For signal-delta-worker rows we use
-- the violation_id (uuid) — which IS what the message references. The
-- message_id itself is recorded in agent_runs.metadata for idempotency.

-- ── Admin views ────────────────────────────────────────────────────────────
-- All use security_invoker = true so RLS gates rows for non-admins.

CREATE OR REPLACE VIEW public.v_property_timeline
WITH (security_invoker = true) AS
SELECT
  ve.property_id,
  ve.detected_at,
  'violation_event'::text AS row_kind,
  ve.id::text AS row_id,
  jsonb_build_object(
    'event_type',   ve.event_type::text,
    'violation_id', ve.violation_id,
    'prev_value',   ve.prev_value,
    'new_value',    ve.new_value
  ) AS payload
FROM public.violation_events ve
UNION ALL
SELECT
  sd.property_id,
  sd.detected_at,
  'signal_delta'::text AS row_kind,
  sd.id::text AS row_id,
  jsonb_build_object(
    'delta_type',        sd.delta_type::text,
    'severity',          sd.severity,
    'snap_score_before', sd.snap_score_before,
    'snap_score_after',  sd.snap_score_after,
    'evidence',          sd.evidence
  ) AS payload
FROM public.signal_deltas sd;

COMMENT ON VIEW public.v_property_timeline IS
  'Unified per-property timeline of typed events + classified deltas.
   security_invoker=true so RLS gates rows (admin-only until P1.5).';

CREATE OR REPLACE VIEW public.v_signal_deltas_last_hour
WITH (security_invoker = true) AS
SELECT
  delta_type,
  count(*) AS row_count,
  avg(severity)::int AS avg_severity,
  max(detected_at) AS most_recent_at
FROM public.signal_deltas
WHERE detected_at >= now() - interval '1 hour'
GROUP BY delta_type
ORDER BY row_count DESC;

COMMENT ON VIEW public.v_signal_deltas_last_hour IS
  'Mission Control sanity check for the delta engine. Admin-only via RLS.';

CREATE OR REPLACE VIEW public.v_property_snapshots_last_hour
WITH (security_invoker = true) AS
SELECT
  count(*) AS row_count,
  count(DISTINCT property_id) AS distinct_properties,
  max(snapshot_at) AS most_recent_at
FROM public.property_snapshots
WHERE snapshot_at >= now() - interval '1 hour';

COMMENT ON VIEW public.v_property_snapshots_last_hour IS
  'Mission Control sanity check for snapshot writes. Admin-only via RLS.';
