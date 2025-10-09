-- Enable RLS on the property_contacts table (ERROR 4)
ALTER TABLE property_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see contacts they created
DROP POLICY IF EXISTS "Users can view own contacts" ON property_contacts;
CREATE POLICY "Users can view own contacts"
  ON property_contacts
  FOR SELECT
  USING (created_by = auth.uid());

-- Fix search_path for update_updated_at_column (WARN 1)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix search_path for handle_new_user (WARN 2)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Fix search_path for update_properties_geom (WARN 3)
CREATE OR REPLACE FUNCTION public.update_properties_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;