
-- Create trigger on violations table for new violation alerts
CREATE TRIGGER trg_notify_saved_property_users
  AFTER INSERT ON public.violations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_saved_property_users();
