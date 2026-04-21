-- ============================================================
-- Phase 4: Living Lead — Distress Events foundation
-- ============================================================

-- 1. Distress events table
CREATE TABLE public.distress_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'snapscore_change',
    'new_violation',
    'water_shutoff',
    'lis_pendens',
    'tax_delinquency',
    'code_escalation'
  )),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'system',
  detected_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for timeline + global queries
CREATE INDEX idx_distress_events_property_detected
  ON public.distress_events (property_id, detected_at DESC);
CREATE INDEX idx_distress_events_detected
  ON public.distress_events (detected_at DESC);
CREATE INDEX idx_distress_events_type_severity
  ON public.distress_events (event_type, severity);

-- 2. RLS — readable by all auth'd users, writable only by service_role/admins
ALTER TABLE public.distress_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view distress events"
  ON public.distress_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage distress events"
  ON public.distress_events
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role bypasses RLS by default; no explicit policy needed for triggers
-- since SECURITY DEFINER functions run with owner privileges.

-- 3. Trigger: SnapScore change ≥ 15 → distress_event
CREATE OR REPLACE FUNCTION public.fn_log_snapscore_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta integer;
  v_severity text;
BEGIN
  -- Only fire when snap_score actually changed and both values are present
  IF NEW.snap_score IS NULL OR OLD.snap_score IS NULL THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.snap_score - OLD.snap_score;

  -- Threshold: ≥15 in either direction
  IF abs(v_delta) < 15 THEN
    RETURN NEW;
  END IF;

  -- Severity based on magnitude + direction
  v_severity := CASE
    WHEN abs(v_delta) >= 30 THEN 'critical'
    WHEN abs(v_delta) >= 20 THEN 'warning'
    ELSE 'info'
  END;

  INSERT INTO public.distress_events (
    property_id, event_type, severity, delta, source
  ) VALUES (
    NEW.id,
    'snapscore_change',
    v_severity,
    jsonb_build_object(
      'before', OLD.snap_score,
      'after', NEW.snap_score,
      'delta', v_delta,
      'direction', CASE WHEN v_delta > 0 THEN 'up' ELSE 'down' END
    ),
    'snapscore_trigger'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_snapscore_change
  AFTER UPDATE OF snap_score ON public.properties
  FOR EACH ROW
  WHEN (OLD.snap_score IS DISTINCT FROM NEW.snap_score)
  EXECUTE FUNCTION public.fn_log_snapscore_change();

-- 4. Trigger: new violation → distress_event
CREATE OR REPLACE FUNCTION public.fn_log_new_violation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_severity text;
  v_priority text;
BEGIN
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map violation enforcement priority → distress severity
  -- Using a defensive lookup since enforcement_priority column may vary
  BEGIN
    v_priority := COALESCE(NEW.enforcement_priority, 'standard');
  EXCEPTION WHEN undefined_column THEN
    v_priority := 'standard';
  END;

  v_severity := CASE v_priority
    WHEN 'critical' THEN 'critical'
    WHEN 'high' THEN 'warning'
    ELSE 'info'
  END;

  INSERT INTO public.distress_events (
    property_id, event_type, severity, delta, source
  ) VALUES (
    NEW.property_id,
    'new_violation',
    v_severity,
    jsonb_build_object(
      'violation_id', NEW.id,
      'violation_type', NEW.violation_type,
      'priority', v_priority
    ),
    'violation_trigger'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_new_violation
  AFTER INSERT ON public.violations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_new_violation();

-- 5. Enable realtime for live timeline updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.distress_events;
ALTER TABLE public.distress_events REPLICA IDENTITY FULL;