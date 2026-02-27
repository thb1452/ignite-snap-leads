-- Fix 1: SECURITY DEFINER function to check an invite token.
-- Unauthenticated visitors need to verify their invite link before
-- creating an account, so this bypasses the foia_invites RLS policy.
CREATE OR REPLACE FUNCTION check_foia_invite(p_token TEXT)
RETURNS TABLE(email TEXT, accepted BOOLEAN, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT fi.email, fi.accepted, fi.expires_at
    FROM foia_invites fi
    WHERE fi.token = p_token;
END;
$$;

-- Fix 2: SECURITY DEFINER function to create the foia_profiles row and
-- mark the invite accepted in a single atomic call.
-- Called immediately after supabase.auth.signUp() — at that point there
-- may be no session yet (if email confirmation is enabled), so the normal
-- INSERT RLS policy (auth.uid() = id) would block the insert.
-- The invite token validates the caller's identity instead.
CREATE OR REPLACE FUNCTION complete_foia_signup(
  p_user_id  UUID,
  p_email    TEXT,
  p_full_name TEXT,
  p_role     TEXT DEFAULT 'va',
  p_token    TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate invite token when provided
  IF p_token IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM foia_invites
      WHERE token     = p_token
        AND NOT accepted
        AND expires_at > NOW()
        AND email      = p_email
    ) THEN
      RAISE EXCEPTION 'Invalid or expired invite token';
    END IF;
  END IF;

  -- Upsert profile
  INSERT INTO foia_profiles (id, email, full_name, role)
  VALUES (p_user_id, p_email, p_full_name, p_role)
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role      = EXCLUDED.role;

  -- Mark invite accepted
  IF p_token IS NOT NULL THEN
    UPDATE foia_invites SET accepted = TRUE WHERE token = p_token;
  END IF;
END;
$$;

-- Grant to both anon (pre-session) and authenticated roles
GRANT EXECUTE ON FUNCTION check_foia_invite(TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION complete_foia_signup(UUID, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;
