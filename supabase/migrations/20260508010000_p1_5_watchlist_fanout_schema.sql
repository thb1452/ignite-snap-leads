-- =============================================================================
-- P1.5: Watchlist Fan-out Foundation — Schema (commit 1 / 2)
-- =============================================================================
-- Purpose:
-- Take the per-property signal_deltas stream from P1 (#161) and fan it out
-- into per-user watchlist_intelligence_events so the existing weekly digest
-- and a future "X changes since last visit" UI can be user-scoped.
--
-- This migration is SCHEMA-ONLY. No triggers, no worker code, no fan-out
-- logic. The trigger and worker land in 20260508010001_*.sql.
--
-- See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §6 ("Monitoring + watchlist
-- architecture") and §15 (queue table).
--
-- STRICT SCOPE:
--   - no AI / no SnapScore / no billing/unlock/export changes
--   - no public frontend changes
--   - no digest rewrite (P1.6)
--   - no saved_market filter matching (P1.6 — needs fn_property_matches_filter)
--   - additive only — coexists with P1, signal_deltas, distress_events
--
-- COEXISTENCE:
--   - saved_properties (already live, RLS user-scoped) is read-only consumed
--   - lead_lists + list_properties (already live, RLS user-scoped) are read-only consumed
--   - signal_deltas (P1 #161) is the upstream event source — no schema change
--   - distress_events untouched
--
-- ROLLBACK:
--   See supabase/migrations/rollback/20260508_p1.5_watchlist_fanout.sql
-- =============================================================================

-- ── saved_markets ──────────────────────────────────────────────────────────
-- A geographic search saved for ongoing monitoring. The filter_payload
-- mirrors the shape consumed by fn_properties_by_bbox so the same filter
-- the user typed into the UI is round-trippable. Filter MATCHING (re-applying
-- a saved filter to a property's current state) lands in P1.6 once the
-- fn_property_matches_filter helper is built.

CREATE TABLE IF NOT EXISTS public.saved_markets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  filter_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify_on       jsonb NOT NULL DEFAULT '[]'::jsonb,           -- subset of signal_delta_type
  digest_cadence  text NOT NULL DEFAULT 'weekly'
                    CHECK (digest_cadence IN ('off','daily','weekly')),
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_markets_user
  ON public.saved_markets (user_id, updated_at DESC);

DO $$ BEGIN
  CREATE TRIGGER trg_saved_markets_updated_at
    BEFORE UPDATE ON public.saved_markets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.saved_markets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "saved_markets_select_own"
    ON public.saved_markets FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "saved_markets_insert_own"
    ON public.saved_markets FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "saved_markets_update_own"
    ON public.saved_markets FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "saved_markets_delete_own"
    ON public.saved_markets FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.saved_markets IS
  'A saved geographic search for monitoring. filter_payload mirrors
   fn_properties_by_bbox shape. Filter matching lands in P1.6;
   for P1.5 the table is a registry only.';

-- ── user_signal_preferences ────────────────────────────────────────────────
-- Per-user weight + suppression knob for each signal_delta_type. Defaults
-- are derived in the worker (no row = default weight 50, not suppressed).
-- This lets a user damp false-positive delta types over time without
-- silencing the whole stream.

CREATE TABLE IF NOT EXISTS public.user_signal_preferences (
  user_id     uuid NOT NULL,
  delta_type  public.signal_delta_type NOT NULL,
  weight      smallint NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  suppressed  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, delta_type)
);

DO $$ BEGIN
  CREATE TRIGGER trg_user_signal_preferences_updated_at
    BEFORE UPDATE ON public.user_signal_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_signal_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "user_signal_preferences_select_own"
    ON public.user_signal_preferences FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_signal_preferences_modify_own"
    ON public.user_signal_preferences FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.user_signal_preferences IS
  'Per-user weight (0-100) + suppression for each signal_delta_type.
   Absent row = default weight 50, not suppressed. Behavior-derived
   defaulting (from user_activity_log) lands in P3.';

-- ── watchlist_intelligence_events ──────────────────────────────────────────
-- Per-user materialized event stream. One row per (user, signal_delta, source).
-- The fan-out worker writes; the user reads via RLS-scoped queries.

CREATE TABLE IF NOT EXISTS public.watchlist_intelligence_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  source          text NOT NULL CHECK (source IN ('saved_property','saved_market','list')),
  source_id       uuid,                                    -- saved_market.id or lead_lists.id; NULL for saved_property
  signal_delta_id uuid NOT NULL,                           -- soft FK to signal_deltas.id
  property_id     uuid NOT NULL,
  delta_type      public.signal_delta_type NOT NULL,
  severity        smallint NOT NULL CHECK (severity BETWEEN 0 AND 100),
  seen_at         timestamptz,
  dismissed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Dedup: one event per (user, signal_delta, source). If the same delta
-- reaches a user via saved_property AND list, both can land — the worker
-- prefers saved_property (more specific) and skips list as redundant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_events_dedup
  ON public.watchlist_intelligence_events (user_id, signal_delta_id, source);

-- Hot path: unread events for a user, by recency.
CREATE INDEX IF NOT EXISTS idx_watchlist_events_user_unread
  ON public.watchlist_intelligence_events (user_id, created_at DESC)
  WHERE seen_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_events_user_property
  ON public.watchlist_intelligence_events (user_id, property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watchlist_events_signal_delta
  ON public.watchlist_intelligence_events (signal_delta_id);

ALTER TABLE public.watchlist_intelligence_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "watchlist_events_select_own"
    ON public.watchlist_intelligence_events FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can mark events as seen / dismissed but cannot create them.
DO $$ BEGIN
  CREATE POLICY "watchlist_events_update_own_seen"
    ON public.watchlist_intelligence_events FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT is service-role only (the fan-out worker). No INSERT policy here.

COMMENT ON TABLE public.watchlist_intelligence_events IS
  'Per-user materialized event stream over signal_deltas. RLS scopes to
   auth.uid()=user_id. Worker writes via service_role. Users can mark
   own events seen/dismissed but cannot create or alter source/severity.';

-- ── pgmq queue: watchlist_event_fanout ─────────────────────────────────────

DO $$ BEGIN PERFORM pgmq.create('watchlist_event_fanout'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('watchlist_event_fanout_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── RPC wrappers (mirror P1 + email-queue patterns) ────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_watchlist_fanout(
  p_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN pgmq.send('watchlist_event_fanout', p_payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('watchlist_event_fanout');
  RETURN pgmq.send('watchlist_event_fanout', p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_watchlist_fanout_batch(
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
    FROM pgmq.read('watchlist_event_fanout', p_vt, p_batch_size) q;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('watchlist_event_fanout');
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_watchlist_fanout(
  p_msg_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN pgmq.delete('watchlist_event_fanout', p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_watchlist_fanout_to_dlq(
  p_msg_id bigint,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  BEGIN
    PERFORM pgmq.send('watchlist_event_fanout_dlq', p_payload);
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create('watchlist_event_fanout_dlq');
    PERFORM pgmq.send('watchlist_event_fanout_dlq', p_payload);
  END;
  PERFORM pgmq.delete('watchlist_event_fanout', p_msg_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_watchlist_fanout(jsonb)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_watchlist_fanout_batch(int, int)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_watchlist_fanout(bigint)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_watchlist_fanout_to_dlq(bigint, jsonb)  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_watchlist_fanout(jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public.read_watchlist_fanout_batch(int, int)         TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_watchlist_fanout(bigint)               TO service_role;
GRANT EXECUTE ON FUNCTION public.move_watchlist_fanout_to_dlq(bigint, jsonb)   TO service_role;

-- ── Extend agent_runs.job_table CHECK additively for the fan-out worker ────

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%signal_delta_processing%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%watchlist_event_fanout%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_job_table_check
      CHECK (job_table IN (
        'enrichment_agent_jobs',
        'foia_request_jobs',
        'pgmq:signal_delta_processing',
        'pgmq:watchlist_event_fanout'
      ));
  END IF;
END $$;

-- ── Admin view ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_watchlist_events_last_24h
WITH (security_invoker = true) AS
SELECT
  source,
  delta_type,
  count(*)                                     AS row_count,
  count(DISTINCT user_id)                      AS distinct_users,
  count(*) FILTER (WHERE seen_at IS NOT NULL)  AS seen_count,
  count(*) FILTER (WHERE seen_at IS NULL)      AS unseen_count,
  max(created_at)                              AS most_recent_at
FROM public.watchlist_intelligence_events
WHERE created_at >= now() - interval '24 hours'
GROUP BY source, delta_type
ORDER BY row_count DESC;

COMMENT ON VIEW public.v_watchlist_events_last_24h IS
  'Mission Control sanity check for fan-out volume + seen rate.
   security_invoker=true: only admins see all rows; users see their own
   slice (matching watchlist_intelligence_events RLS).';
