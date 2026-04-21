-- Phase 6: Auto-enrollment triggers for drip sequences
-- Allows drip_sequences.trigger_type to be 'distress_event' or 'stage_change'
-- with trigger_config specifying which event_type/severity or stage_id

-- Helper function to enroll a lead in all matching active sequences
CREATE OR REPLACE FUNCTION public.auto_enroll_lead_in_sequences(
  _lead_id uuid,
  _trigger_type text,
  _match_value text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead RECORD;
  _seq RECORD;
  _to_number text;
BEGIN
  -- Load lead
  SELECT id, org_id, property_id INTO _lead
  FROM leads WHERE id = _lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Resolve a phone for the lead's owner (best-effort)
  SELECT phone INTO _to_number
  FROM property_contacts
  WHERE property_id = _lead.property_id
    AND phone IS NOT NULL
    AND phone <> ''
  ORDER BY created_at DESC
  LIMIT 1;

  -- Iterate matching sequences
  FOR _seq IN
    SELECT id FROM drip_sequences
    WHERE org_id = _lead.org_id
      AND is_active = true
      AND trigger_type = _trigger_type
      AND (
        trigger_config->>'match' = _match_value
        OR trigger_config->>'match' = '*'
        OR trigger_config = '{}'::jsonb
      )
  LOOP
    -- Skip if already enrolled in this sequence (active or paused)
    IF EXISTS (
      SELECT 1 FROM drip_enrollments
      WHERE lead_id = _lead_id AND sequence_id = _seq.id
        AND status IN ('active', 'paused')
    ) THEN CONTINUE; END IF;

    INSERT INTO drip_enrollments (
      org_id, lead_id, sequence_id, current_step,
      next_run_at, status, to_number
    ) VALUES (
      _lead.org_id, _lead_id, _seq.id, 0,
      now(), 'active', _to_number
    );
  END LOOP;
END;
$$;

-- Trigger: when a distress_event is inserted, find leads for that property and auto-enroll
CREATE OR REPLACE FUNCTION public.trg_distress_event_enroll() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead RECORD;
BEGIN
  FOR _lead IN
    SELECT id FROM leads
    WHERE property_id = NEW.property_id
      AND archived_at IS NULL
  LOOP
    PERFORM public.auto_enroll_lead_in_sequences(
      _lead.id, 'distress_event', NEW.event_type
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS distress_event_auto_enroll ON public.distress_events;
CREATE TRIGGER distress_event_auto_enroll
AFTER INSERT ON public.distress_events
FOR EACH ROW EXECUTE FUNCTION public.trg_distress_event_enroll();

-- Trigger: when a lead's stage_id changes, auto-enroll into matching stage_change sequences
CREATE OR REPLACE FUNCTION public.trg_lead_stage_change_enroll() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    PERFORM public.auto_enroll_lead_in_sequences(
      NEW.id, 'stage_change', NEW.stage_id::text
    );
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.auto_enroll_lead_in_sequences(
      NEW.id, 'stage_change', NEW.stage_id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_stage_change_auto_enroll ON public.leads;
CREATE TRIGGER lead_stage_change_auto_enroll
AFTER INSERT OR UPDATE OF stage_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_stage_change_enroll();