-- Fix admin permissions
--
-- Problems addressed:
--
-- 1. Missing GRANT on complete_foia_signup / check_foia_invite.
--    Migration 20260227162954 recreated both functions with CREATE OR REPLACE
--    but omitted the GRANT statements that were present in 20260227000000.
--    Depending on migration order, authenticated users may get "permission denied"
--    when calling these RPCs, which surfaces as "No FOIA platform access."
--
-- 2. Admin profile seeded with a hardcoded UUID (20260227162954).
--    If the admin's actual Supabase auth user ID differs from the hardcoded
--    value, their foia_profiles row is never created. On login the profile
--    lookup returns null, complete_foia_signup fails or creates a VA row,
--    and the admin is blocked.
--
-- Fix: re-issue grants (idempotent) and re-seed the admin profile by looking
-- up their real auth user ID from auth.users using their email.

-- ── 1. Ensure RPC execute permissions exist ───────────────────────────────
GRANT EXECUTE ON FUNCTION public.check_foia_invite(text)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_foia_signup(uuid, text, text, text, text)
  TO anon, authenticated;

-- ── 2. Re-seed admin profile using email lookup ───────────────────────────
-- Looks up the admin's real auth user ID from auth.users so the profile row
-- has the correct primary key regardless of what UUID was previously hardcoded.
DO $$
DECLARE
  v_user_id     uuid;
  v_admin_email text := 'testyui@gmail.com';
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_admin_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.foia_profiles (id, email, full_name, role)
    VALUES (v_user_id, v_admin_email, 'Admin', 'admin')
    ON CONFLICT (id) DO UPDATE
      SET role  = 'admin',
          email = EXCLUDED.email;
  END IF;
END;
$$;
