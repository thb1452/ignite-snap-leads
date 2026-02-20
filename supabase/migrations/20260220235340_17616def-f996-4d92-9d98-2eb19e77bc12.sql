-- Fix handle_new_user trigger to also assign the 'user' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, credits)
  VALUES (NEW.id, 10)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Also backfill any existing users missing the 'user' role
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'user'
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE ur.id IS NULL
ON CONFLICT DO NOTHING;