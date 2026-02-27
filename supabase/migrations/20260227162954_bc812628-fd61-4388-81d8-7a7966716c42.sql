
-- Create foia_profiles table (IF NOT EXISTS — table may already exist from a
-- previous migration; this migration must be idempotent so that the subsequent
-- 20260227200000_fix_foia_recursive_rls migration can apply and replace the
-- policies with non-recursive equivalents).
CREATE TABLE IF NOT EXISTS public.foia_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'va' CHECK (role IN ('admin', 'va')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.foia_profiles ENABLE ROW LEVEL SECURITY;

-- Create foia_invites table (IF NOT EXISTS — same reason as above)
CREATE TABLE IF NOT EXISTS public.foia_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.foia_invites ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER RPC: check invite token (callable by unauthenticated users)
CREATE OR REPLACE FUNCTION public.check_foia_invite(p_token text)
RETURNS TABLE(email text, accepted boolean, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email, accepted, expires_at
  FROM public.foia_invites
  WHERE token = p_token
  LIMIT 1;
$$;

-- SECURITY DEFINER RPC: complete signup (creates profile + marks invite accepted)
CREATE OR REPLACE FUNCTION public.complete_foia_signup(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text DEFAULT 'va',
  p_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert the profile
  INSERT INTO public.foia_profiles (id, email, full_name, role)
  VALUES (p_user_id, p_email, p_full_name, p_role)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

  -- Mark invite as accepted if token provided
  IF p_token IS NOT NULL THEN
    UPDATE public.foia_invites
    SET accepted = true
    WHERE token = p_token AND accepted = false;
  END IF;
END;
$$;

-- Seed your admin profile
INSERT INTO public.foia_profiles (id, email, full_name, role)
VALUES ('924e1cfb-a126-4c9c-b806-4cd200fba44d', 'testyui@gmail.com', 'Admin', 'admin')
ON CONFLICT (id) DO NOTHING;
