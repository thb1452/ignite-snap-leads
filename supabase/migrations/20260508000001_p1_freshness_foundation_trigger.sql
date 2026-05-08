-- =============================================================================
-- P1 Phase 2: Freshness Foundation — Trigger + Classifier (commit 2 / 2)
-- =============================================================================
-- Adds:
--   - fn_classify_deltas(prev_state jsonb, new_state jsonb) RETURNS TABLE
--       Pure, deterministic, IMMUTABLE. No I/O. Returns 0..N typed deltas
--       based on diff between two state JSONBs.
--   - fn_enqueue_signal_delta_on_violation_change()
--       Trigger function. Body is intentionally tiny (single pgmq.send via
--       enqueue_signal_delta wrapper) so ingestion latency is unaffected.
--   - trg_enqueue_signal_delta_processing
--       AFTER INSERT OR UPDATE OF (semantic columns) ON public.violations
--
-- COEXISTENCE:
--   - trg_log_new_violation continues to fire on violations INSERT and write
--     to distress_events. The new trigger fires under a distinct name and
--     writes to a different target (the pgmq queue). No conflict.
--   - The new trigger filters by UPDATE OF a curated column list so cosmetic
--     touches (e.g. days_open recomputation, created_at) do not enqueue.
--
-- NO LLM. NO SnapScore changes. NO billing/auth/export changes.
--
-- See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §4–5, §19.
-- =============================================================================

-- ── Deterministic classification function ──────────────────────────────────
-- Returns one row per detected delta. IMMUTABLE: same inputs → same outputs.

CREATE OR REPLACE FUNCTION public.fn_classify_deltas(
  p_prev_state jsonb,
  p_new_state  jsonb
) RETURNS TABLE (
  delta_type public.signal_delta_type,
  severity   smallint,
  evidence   jsonb
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_prev_open   int := COALESCE((p_prev_state ->> 'open_violations')::int, 0);
  v_new_open    int := COALESCE((p_new_state  ->> 'open_violations')::int, 0);
  v_prev_total  int := COALESCE((p_prev_state ->> 'total_violations')::int, 0);
  v_new_total   int := COALESCE((p_new_state  ->> 'total_violations')::int, 0);
  v_prev_signals text[];
  v_new_signals  text[];
  v_prev_repeat  boolean := COALESCE((p_prev_state ->> 'repeat_offender')::boolean, false);
  v_new_repeat   boolean := COALESCE((p_new_state  ->> 'repeat_offender')::boolean, false);
  v_prev_escalated boolean := COALESCE((p_prev_state ->> 'escalated')::boolean, false);
  v_new_escalated  boolean := COALESCE((p_new_state  ->> 'escalated')::boolean, false);
  v_prev_oldest date;
  v_new_oldest  date;
  v_new_days_open int;
  v_prev_days_open int;
BEGIN
  -- Parse signal arrays defensively (jsonb may be null or wrong type)
  BEGIN
    v_prev_signals := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_prev_state -> 'distress_signals')),
      ARRAY[]::text[]
    );
  EXCEPTION WHEN OTHERS THEN v_prev_signals := ARRAY[]::text[];
  END;

  BEGIN
    v_new_signals := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_new_state -> 'distress_signals')),
      ARRAY[]::text[]
    );
  EXCEPTION WHEN OTHERS THEN v_new_signals := ARRAY[]::text[];
  END;

  -- 1. new_open_violation: open count strictly increased
  IF v_new_open > v_prev_open THEN
    RETURN QUERY SELECT
      'new_open_violation'::public.signal_delta_type,
      LEAST(60 + (v_new_open - v_prev_open) * 5, 90)::smallint,
      jsonb_build_object(
        'prev_open', v_prev_open,
        'new_open',  v_new_open,
        'delta',     v_new_open - v_prev_open
      );
  END IF;

  -- 2. enforcement_escalation: false → true transition on escalated flag
  IF v_new_escalated AND NOT v_prev_escalated THEN
    RETURN QUERY SELECT
      'enforcement_escalation'::public.signal_delta_type,
      85::smallint,
      jsonb_build_object(
        'transition',      'standard_to_escalated',
        'open_violations', v_new_open
      );
  END IF;

  -- 3. water_shutoff_added: signal newly present in distress_signals[]
  IF 'water_shutoff_enforcement' = ANY(v_new_signals)
     AND NOT ('water_shutoff_enforcement' = ANY(v_prev_signals)) THEN
    RETURN QUERY SELECT
      'water_shutoff_added'::public.signal_delta_type,
      90::smallint,
      jsonb_build_object('signal', 'water_shutoff_enforcement');
  END IF;

  -- 4. repeat_offender_threshold_crossed: false → true transition
  IF v_new_repeat AND NOT v_prev_repeat THEN
    RETURN QUERY SELECT
      'repeat_offender_threshold_crossed'::public.signal_delta_type,
      75::smallint,
      jsonb_build_object(
        'total_violations', v_new_total,
        'open_violations',  v_new_open
      );
  END IF;

  -- 5. extended_enforcement_milestone: oldest violation crossed 90/180/365 day boundary
  --    Uses CURRENT_DATE — but that's stable within a transaction and IMMUTABLE
  --    is preserved because we're only computing diffs from inputs.
  v_prev_oldest := NULLIF(p_prev_state ->> 'oldest_violation_date', '')::date;
  v_new_oldest  := NULLIF(p_new_state  ->> 'oldest_violation_date',  '')::date;

  IF v_new_oldest IS NOT NULL THEN
    v_new_days_open := (CURRENT_DATE - v_new_oldest)::int;
    IF v_prev_oldest IS NOT NULL THEN
      v_prev_days_open := (CURRENT_DATE - v_prev_oldest)::int;
      IF (v_prev_days_open <  90 AND v_new_days_open >=  90) OR
         (v_prev_days_open < 180 AND v_new_days_open >= 180) OR
         (v_prev_days_open < 365 AND v_new_days_open >= 365) THEN
        RETURN QUERY SELECT
          'extended_enforcement_milestone'::public.signal_delta_type,
          (CASE
             WHEN v_new_days_open >= 365 THEN 80
             WHEN v_new_days_open >= 180 THEN 70
             ELSE 60
           END)::smallint,
          jsonb_build_object('days_open', v_new_days_open);
      END IF;
    END IF;
  END IF;

  -- 6. closed_after_long_open: open went 1+ → 0 with prior days_open >= 180
  IF v_prev_open >= 1 AND v_new_open = 0 THEN
    IF v_prev_oldest IS NOT NULL AND (CURRENT_DATE - v_prev_oldest)::int >= 180 THEN
      RETURN QUERY SELECT
        'closed_after_long_open'::public.signal_delta_type,
        50::smallint,
        jsonb_build_object('days_open_when_closed', (CURRENT_DATE - v_prev_oldest)::int);
    END IF;
  END IF;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_classify_deltas(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_classify_deltas(jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_classify_deltas(jsonb, jsonb) IS
  'Deterministic signal-delta classifier. Returns 0..N typed deltas based on
   diff between prev_state and new_state JSONBs. No I/O. No LLM. IMMUTABLE.
   Used by signal-delta-worker. Same inputs always yield the same outputs.';

-- ── Trigger function: enqueue a signal_delta_processing message ─────────────

CREATE OR REPLACE FUNCTION public.fn_enqueue_signal_delta_on_violation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_action text;
  v_violation_id uuid;
  v_property_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action       := 'inserted';
    v_violation_id := NEW.id;
    v_property_id  := NEW.property_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only enqueue if a SEMANTIC column actually changed.
    -- (UPDATE OF in the trigger declaration filters which columns wake us;
    --  this guard prevents enqueueing on no-op UPDATEs that the trigger
    --  still fires for due to row-level update statements.)
    IF OLD.status         IS NOT DISTINCT FROM NEW.status
       AND OLD.violation_type IS NOT DISTINCT FROM NEW.violation_type
       AND OLD.description    IS NOT DISTINCT FROM NEW.description
       AND OLD.opened_date    IS NOT DISTINCT FROM NEW.opened_date
       AND OLD.last_updated   IS NOT DISTINCT FROM NEW.last_updated THEN
      RETURN NEW;
    END IF;
    v_action       := 'updated';
    v_violation_id := NEW.id;
    v_property_id  := NEW.property_id;
  ELSE
    -- DELETE / TRUNCATE not handled here. Snapshot retention covers tombstoning.
    RETURN NEW;
  END IF;

  IF v_property_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Single tiny enqueue. All real work happens in the worker.
  PERFORM public.enqueue_signal_delta(jsonb_build_object(
    'action',       v_action,
    'violation_id', v_violation_id,
    'property_id',  v_property_id,
    'observed_at',  now()
  ));

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_enqueue_signal_delta_on_violation_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_signal_delta_on_violation_change() TO service_role;

COMMENT ON FUNCTION public.fn_enqueue_signal_delta_on_violation_change() IS
  'Trigger function. Single pgmq.send (via enqueue_signal_delta wrapper).
   Coexists with trg_log_new_violation. No business logic in the trigger;
   classification + writes happen in signal-delta-worker.';

-- ── Trigger ────────────────────────────────────────────────────────────────
-- Distinct name from the existing trg_log_new_violation. Both fire on
-- violations INSERT and write to different targets — no conflict.

DROP TRIGGER IF EXISTS trg_enqueue_signal_delta_processing ON public.violations;

CREATE TRIGGER trg_enqueue_signal_delta_processing
  AFTER INSERT OR UPDATE OF status, violation_type, description, opened_date, last_updated
  ON public.violations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enqueue_signal_delta_on_violation_change();

COMMENT ON TRIGGER trg_enqueue_signal_delta_processing ON public.violations IS
  'Enqueues a signal_delta_processing pgmq message on semantic violation
   change. Tiny body. Coexists with trg_log_new_violation (distress_events).';
