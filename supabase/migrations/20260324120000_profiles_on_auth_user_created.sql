-- Create public.profiles on every new auth user so free_unlocks_remaining (default 3)
-- is always present, including when email confirmation prevents client-side inserts.

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

  INSERT INTO public.profiles (user_id, org_id, email, full_name)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NEW.email,
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill: auth users missing a profiles row (one-time; preserves existing rows)
INSERT INTO public.profiles (user_id, org_id, email, full_name)
SELECT
  au.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  au.email,
  NULLIF(btrim(COALESCE(au.raw_user_meta_data->>'full_name', '')), '')
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
ON CONFLICT (user_id) DO NOTHING;
