-- FOIA schema + RPC hardening + schema cache refresh (idempotent)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core FOIA tables that are missing in this backend
CREATE TABLE IF NOT EXISTS public.press_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  domain text NOT NULL,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.targets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_name text NOT NULL,
  state text NOT NULL,
  county text,
  population integer,
  target_type text NOT NULL CHECK (target_type IN ('county_foia', 'city_foia', 'water_shutoff', 'population_list')),
  foia_url text,
  url_hash text UNIQUE,
  source_file text,
  is_duplicate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.foia_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id uuid NOT NULL REFERENCES public.targets(id) ON DELETE CASCADE,
  va_id uuid NOT NULL REFERENCES public.foia_profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.foia_profiles(id)
);

CREATE TABLE IF NOT EXISTS public.press_rotation (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id uuid NOT NULL REFERENCES public.targets(id) ON DELETE CASCADE,
  press_account_id uuid NOT NULL REFERENCES public.press_accounts(id) ON DELETE CASCADE,
  rotation_month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, rotation_month)
);

CREATE INDEX IF NOT EXISTS idx_targets_state ON public.targets(state);
CREATE INDEX IF NOT EXISTS idx_targets_target_type ON public.targets(target_type);
CREATE INDEX IF NOT EXISTS idx_targets_url_hash ON public.targets(url_hash);
CREATE INDEX IF NOT EXISTS idx_foia_assignments_target_id ON public.foia_assignments(target_id);
CREATE INDEX IF NOT EXISTS idx_foia_assignments_va_id ON public.foia_assignments(va_id);
CREATE INDEX IF NOT EXISTS idx_press_rotation_target_id ON public.press_rotation(target_id);
CREATE INDEX IF NOT EXISTS idx_press_rotation_press_account_id ON public.press_rotation(press_account_id);
CREATE INDEX IF NOT EXISTS idx_press_rotation_rotation_month ON public.press_rotation(rotation_month);

-- Make foia_requests compatible with both legacy and new FOIA flows
ALTER TABLE public.foia_requests
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS va_id uuid,
  ADD COLUMN IF NOT EXISTS press_account_id uuid,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foia_requests_target_id_fkey'
      AND conrelid = 'public.foia_requests'::regclass
  ) THEN
    ALTER TABLE public.foia_requests
      ADD CONSTRAINT foia_requests_target_id_fkey
      FOREIGN KEY (target_id) REFERENCES public.targets(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foia_requests_va_id_fkey'
      AND conrelid = 'public.foia_requests'::regclass
  ) THEN
    ALTER TABLE public.foia_requests
      ADD CONSTRAINT foia_requests_va_id_fkey
      FOREIGN KEY (va_id) REFERENCES public.foia_profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foia_requests_press_account_id_fkey'
      AND conrelid = 'public.foia_requests'::regclass
  ) THEN
    ALTER TABLE public.foia_requests
      ADD CONSTRAINT foia_requests_press_account_id_fkey
      FOREIGN KEY (press_account_id) REFERENCES public.press_accounts(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_foia_requests_target_id ON public.foia_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_foia_requests_va_id ON public.foia_requests(va_id);
CREATE INDEX IF NOT EXISTS idx_foia_requests_status ON public.foia_requests(status);
CREATE INDEX IF NOT EXISTS idx_foia_requests_sent_at ON public.foia_requests(sent_at);

CREATE OR REPLACE FUNCTION public.update_foia_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'sent' AND COALESCE(OLD.status, '') <> 'sent' THEN
    NEW.sent_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foia_requests_updated_at ON public.foia_requests;
CREATE TRIGGER foia_requests_updated_at
BEFORE UPDATE ON public.foia_requests
FOR EACH ROW EXECUTE FUNCTION public.update_foia_requests_updated_at();

-- Admin check helper that does not recurse through RLS
CREATE OR REPLACE FUNCTION public.is_foia_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.foia_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_foia_admin() TO authenticated;

-- Harden invite validation RPC
CREATE OR REPLACE FUNCTION public.check_foia_invite(p_token text)
RETURNS TABLE(email text, accepted boolean, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fi.email, fi.accepted, fi.expires_at
  FROM public.foia_invites fi
  WHERE fi.token = p_token
    AND fi.expires_at > now()
  LIMIT 1;
$$;

-- Harden signup RPC (prevents role escalation)
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
DECLARE
  v_is_global_admin boolean := false;
  v_effective_role text := 'va';
BEGIN
  -- Without token, caller must be authenticated as that same user.
  IF p_token IS NULL THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Unauthorized profile provisioning attempt';
    END IF;
  END IF;

  -- Validate token flow (used when no session yet during invite signup)
  IF p_token IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.foia_invites fi
      WHERE fi.token = p_token
        AND fi.accepted = false
        AND fi.expires_at > now()
        AND fi.email = p_email
    ) THEN
      RAISE EXCEPTION 'Invalid or expired invite token';
    END IF;
  END IF;

  -- Derive effective role from app-level admin role only.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role::text = 'admin'
  ) INTO v_is_global_admin;

  IF v_is_global_admin THEN
    v_effective_role := 'admin';
  ELSE
    v_effective_role := 'va';
  END IF;

  INSERT INTO public.foia_profiles (id, email, full_name, role)
  VALUES (p_user_id, p_email, p_full_name, v_effective_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = CASE
          WHEN public.foia_profiles.role = 'admin' THEN 'admin'
          ELSE EXCLUDED.role
        END;

  IF p_token IS NOT NULL THEN
    UPDATE public.foia_invites
    SET accepted = true
    WHERE token = p_token
      AND accepted = false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_foia_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_foia_signup(uuid, text, text, text, text) TO anon, authenticated;

-- Ensure RLS enabled
ALTER TABLE public.foia_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.press_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.press_rotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_requests ENABLE ROW LEVEL SECURITY;

-- Recreate non-recursive / compatible policies
DROP POLICY IF EXISTS "foia_profiles_select" ON public.foia_profiles;
DROP POLICY IF EXISTS "foia_profiles_insert" ON public.foia_profiles;
DROP POLICY IF EXISTS "foia_profiles_update" ON public.foia_profiles;
DROP POLICY IF EXISTS "Users can view own foia_profile" ON public.foia_profiles;
DROP POLICY IF EXISTS "Users can update own foia_profile" ON public.foia_profiles;
DROP POLICY IF EXISTS "Admins can view all foia_profiles" ON public.foia_profiles;
DROP POLICY IF EXISTS "Admins can update foia_profiles" ON public.foia_profiles;

CREATE POLICY "foia_profiles_select" ON public.foia_profiles
FOR SELECT USING (auth.uid() = id OR public.is_foia_admin());

CREATE POLICY "foia_profiles_insert" ON public.foia_profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "foia_profiles_update" ON public.foia_profiles
FOR UPDATE USING (auth.uid() = id OR public.is_foia_admin());

DROP POLICY IF EXISTS "foia_invites_select" ON public.foia_invites;
DROP POLICY IF EXISTS "foia_invites_insert" ON public.foia_invites;
DROP POLICY IF EXISTS "foia_invites_update" ON public.foia_invites;
DROP POLICY IF EXISTS "Admins can manage foia_invites" ON public.foia_invites;

CREATE POLICY "foia_invites_select" ON public.foia_invites
FOR SELECT USING (
  public.is_foia_admin()
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "foia_invites_insert" ON public.foia_invites
FOR INSERT WITH CHECK (public.is_foia_admin());

CREATE POLICY "foia_invites_update" ON public.foia_invites
FOR UPDATE USING (
  public.is_foia_admin()
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "targets_select" ON public.targets;
DROP POLICY IF EXISTS "targets_insert" ON public.targets;
DROP POLICY IF EXISTS "targets_update" ON public.targets;

CREATE POLICY "targets_select" ON public.targets
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "targets_insert" ON public.targets
FOR INSERT WITH CHECK (public.is_foia_admin());

CREATE POLICY "targets_update" ON public.targets
FOR UPDATE USING (public.is_foia_admin());

DROP POLICY IF EXISTS "press_accounts_select" ON public.press_accounts;
DROP POLICY IF EXISTS "press_accounts_insert" ON public.press_accounts;
DROP POLICY IF EXISTS "press_accounts_update" ON public.press_accounts;
DROP POLICY IF EXISTS "press_accounts_delete" ON public.press_accounts;

CREATE POLICY "press_accounts_select" ON public.press_accounts
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "press_accounts_insert" ON public.press_accounts
FOR INSERT WITH CHECK (public.is_foia_admin());

CREATE POLICY "press_accounts_update" ON public.press_accounts
FOR UPDATE USING (public.is_foia_admin());

CREATE POLICY "press_accounts_delete" ON public.press_accounts
FOR DELETE USING (public.is_foia_admin());

DROP POLICY IF EXISTS "foia_assignments_select" ON public.foia_assignments;
DROP POLICY IF EXISTS "foia_assignments_insert" ON public.foia_assignments;
DROP POLICY IF EXISTS "foia_assignments_delete" ON public.foia_assignments;

CREATE POLICY "foia_assignments_select" ON public.foia_assignments
FOR SELECT USING (va_id = auth.uid() OR public.is_foia_admin());

CREATE POLICY "foia_assignments_insert" ON public.foia_assignments
FOR INSERT WITH CHECK (public.is_foia_admin());

CREATE POLICY "foia_assignments_delete" ON public.foia_assignments
FOR DELETE USING (public.is_foia_admin());

DROP POLICY IF EXISTS "press_rotation_select" ON public.press_rotation;
DROP POLICY IF EXISTS "press_rotation_insert" ON public.press_rotation;
DROP POLICY IF EXISTS "press_rotation_update" ON public.press_rotation;
DROP POLICY IF EXISTS "press_rotation_delete" ON public.press_rotation;

CREATE POLICY "press_rotation_select" ON public.press_rotation
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "press_rotation_insert" ON public.press_rotation
FOR INSERT WITH CHECK (public.is_foia_admin());

CREATE POLICY "press_rotation_update" ON public.press_rotation
FOR UPDATE USING (public.is_foia_admin());

CREATE POLICY "press_rotation_delete" ON public.press_rotation
FOR DELETE USING (public.is_foia_admin());

DROP POLICY IF EXISTS "foia_requests_select" ON public.foia_requests;
DROP POLICY IF EXISTS "foia_requests_insert" ON public.foia_requests;
DROP POLICY IF EXISTS "foia_requests_update" ON public.foia_requests;
DROP POLICY IF EXISTS "VAs can view their own requests" ON public.foia_requests;
DROP POLICY IF EXISTS "VAs can insert their own requests" ON public.foia_requests;
DROP POLICY IF EXISTS "VAs can update their own requests" ON public.foia_requests;

CREATE POLICY "foia_requests_select" ON public.foia_requests
FOR SELECT USING (
  COALESCE(va_id, requested_by) = auth.uid()
  OR public.is_foia_admin()
);

CREATE POLICY "foia_requests_insert" ON public.foia_requests
FOR INSERT WITH CHECK (
  (va_id IS NOT NULL AND va_id = auth.uid())
  OR (requested_by IS NOT NULL AND requested_by = auth.uid())
);

CREATE POLICY "foia_requests_update" ON public.foia_requests
FOR UPDATE USING (
  COALESCE(va_id, requested_by) = auth.uid()
  OR public.is_foia_admin()
);

-- Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';