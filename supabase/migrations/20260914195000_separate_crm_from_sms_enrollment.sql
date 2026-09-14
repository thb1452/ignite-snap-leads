-- Importing a property, changing its stage, or detecting a source event is a
-- CRM action. None of those actions grants permission to enroll a phone in SMS.
-- Original trigger/function definitions remain in the earlier migrations.
DROP TRIGGER IF EXISTS lead_stage_change_auto_enroll ON public.leads;
DROP TRIGGER IF EXISTS distress_event_auto_enroll ON public.distress_events;

CREATE OR REPLACE FUNCTION public.auto_enroll_lead_in_sequences(
 _lead_id uuid, _trigger_type text, _match_value text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='automatic_sms_enrollment_retired';
END $$;
REVOKE EXECUTE ON FUNCTION public.auto_enroll_lead_in_sequences(uuid,text,text) FROM PUBLIC,anon,authenticated;

-- Connection testing is held at the database too, including service callers.
-- Preserve existing enrollment/opt-out history and allow pausing or stopping.
-- A later reviewed SMS release is separate from CRM intake and FOIA release.
CREATE FUNCTION public.guard_sms_enrollment_connection_hold() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='sms_enrollment_held_during_connection_testing';
 END IF;
 IF NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.sequence_id IS DISTINCT FROM OLD.sequence_id
  OR NEW.to_number IS DISTINCT FROM OLD.to_number
  OR (NEW.status='active' AND NEW.status IS DISTINCT FROM OLD.status) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='sms_enrollment_held_during_connection_testing';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sms_enrollment_connection_hold BEFORE INSERT OR UPDATE ON public.drip_enrollments
 FOR EACH ROW EXECUTE FUNCTION public.guard_sms_enrollment_connection_hold();
REVOKE ALL ON FUNCTION public.guard_sms_enrollment_connection_hold() FROM PUBLIC,anon,authenticated,service_role;
