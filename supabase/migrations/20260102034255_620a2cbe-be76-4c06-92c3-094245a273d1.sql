-- Function to sync violation_types array on properties
CREATE OR REPLACE FUNCTION public.sync_property_violation_types()
RETURNS TRIGGER AS $$
DECLARE
  target_property_id uuid;
BEGIN
  -- Get the property_id from either NEW or OLD record
  IF TG_OP = 'DELETE' THEN
    target_property_id := OLD.property_id;
  ELSE
    target_property_id := NEW.property_id;
  END IF;

  -- Skip if property_id is null
  IF target_property_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update the violation_types array on the property
  UPDATE properties
  SET violation_types = COALESCE(
    (SELECT ARRAY_AGG(DISTINCT violation_type ORDER BY violation_type)
     FROM violations
     WHERE property_id = target_property_id
       AND violation_type IS NOT NULL),
    '{}'::text[]
  )
  WHERE id = target_property_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to sync on any violation change
CREATE TRIGGER trg_sync_violation_types
AFTER INSERT OR UPDATE OR DELETE ON violations
FOR EACH ROW EXECUTE FUNCTION public.sync_property_violation_types();