
-- RPC: check_foia_invite
-- Allows unauthenticated users to validate an invite token
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

-- RPC: complete_foia_signup
-- Creates or updates a foia_profile and marks the invite as accepted
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
  -- Upsert the foia profile
  INSERT INTO public.foia_profiles (id, email, full_name, role)
  VALUES (p_user_id, p_email, p_full_name, p_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;

  -- Mark invite as accepted if token provided
  IF p_token IS NOT NULL THEN
    UPDATE public.foia_invites
    SET accepted = true
    WHERE token = p_token;
  END IF;
END;
$$;
