-- FOIA VA Management System Schema
-- Migration: foia_va_platform

-- Enable uuid_generate_v4 if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- foia_profiles: VA/admin profiles for the FOIA platform
-- ============================================================
CREATE TABLE IF NOT EXISTS foia_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'va' CHECK (role IN ('admin', 'va')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- press_accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS press_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial press accounts
INSERT INTO press_accounts (name, domain, email, notes) VALUES
  ('Civic Records', 'civicrecords.it.com', 'contact@civicrecords.it.com', 'Primary press account'),
  ('Data Research Blog', 'dataresearch.blog', 'contact@dataresearch.blog', 'Secondary press account')
ON CONFLICT DO NOTHING;

-- ============================================================
-- targets: master list imported from Excel
-- ============================================================
CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_name TEXT NOT NULL,
  state TEXT NOT NULL,
  county TEXT,
  population INTEGER,
  target_type TEXT NOT NULL CHECK (target_type IN ('county_foia', 'city_foia', 'water_shutoff', 'population_list')),
  foia_url TEXT,
  url_hash TEXT UNIQUE,
  source_file TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_targets_state ON targets(state);
CREATE INDEX IF NOT EXISTS idx_targets_target_type ON targets(target_type);
CREATE INDEX IF NOT EXISTS idx_targets_url_hash ON targets(url_hash);

-- ============================================================
-- assignments: which VA is responsible for which target
-- ============================================================
CREATE TABLE IF NOT EXISTS foia_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  va_id UUID NOT NULL REFERENCES foia_profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES foia_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_foia_assignments_target_id ON foia_assignments(target_id);
CREATE INDEX IF NOT EXISTS idx_foia_assignments_va_id ON foia_assignments(va_id);

-- ============================================================
-- press_rotation: monthly press account → target assignment
-- ============================================================
CREATE TABLE IF NOT EXISTS press_rotation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  press_account_id UUID NOT NULL REFERENCES press_accounts(id) ON DELETE CASCADE,
  rotation_month TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(target_id, rotation_month)
);

CREATE INDEX IF NOT EXISTS idx_press_rotation_target_id ON press_rotation(target_id);
CREATE INDEX IF NOT EXISTS idx_press_rotation_press_account_id ON press_rotation(press_account_id);
CREATE INDEX IF NOT EXISTS idx_press_rotation_rotation_month ON press_rotation(rotation_month);

-- ============================================================
-- foia_requests: every logged VA action on a URL
-- ============================================================
CREATE TABLE IF NOT EXISTS foia_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  va_id UUID NOT NULL REFERENCES foia_profiles(id) ON DELETE CASCADE,
  press_account_id UUID REFERENCES press_accounts(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'rejected', 'fulfilled', 'no_portal', 'needs_review')),
  sent_at TIMESTAMP WITH TIME ZONE,
  response_received_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foia_requests_target_id ON foia_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_foia_requests_va_id ON foia_requests(va_id);
CREATE INDEX IF NOT EXISTS idx_foia_requests_status ON foia_requests(status);
CREATE INDEX IF NOT EXISTS idx_foia_requests_sent_at ON foia_requests(sent_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_foia_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Auto-populate sent_at when status changes to 'sent'
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    NEW.sent_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS foia_requests_updated_at ON foia_requests;
CREATE TRIGGER foia_requests_updated_at
  BEFORE UPDATE ON foia_requests
  FOR EACH ROW EXECUTE FUNCTION update_foia_requests_updated_at();

-- ============================================================
-- foia_invites: track invite emails
-- ============================================================
CREATE TABLE IF NOT EXISTS foia_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES foia_profiles(id),
  token TEXT NOT NULL UNIQUE,
  accepted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_foia_invites_token ON foia_invites(token);
CREATE INDEX IF NOT EXISTS idx_foia_invites_email ON foia_invites(email);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- foia_profiles
ALTER TABLE foia_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foia_profiles_select" ON foia_profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin'
    )
  );

CREATE POLICY "foia_profiles_insert" ON foia_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "foia_profiles_update" ON foia_profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin'
    )
  );

-- targets
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "targets_select" ON targets FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "targets_insert" ON targets FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "targets_update" ON targets FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

-- press_accounts
ALTER TABLE press_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "press_accounts_select" ON press_accounts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "press_accounts_insert" ON press_accounts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "press_accounts_update" ON press_accounts FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "press_accounts_delete" ON press_accounts FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

-- foia_assignments
ALTER TABLE foia_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foia_assignments_select" ON foia_assignments FOR SELECT
  USING (
    va_id = auth.uid()
    OR EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "foia_assignments_insert" ON foia_assignments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "foia_assignments_delete" ON foia_assignments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

-- press_rotation
ALTER TABLE press_rotation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "press_rotation_select" ON press_rotation FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "press_rotation_insert" ON press_rotation FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "press_rotation_update" ON press_rotation FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "press_rotation_delete" ON press_rotation FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

-- foia_requests
ALTER TABLE foia_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foia_requests_select" ON foia_requests FOR SELECT
  USING (
    va_id = auth.uid()
    OR EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "foia_requests_insert" ON foia_requests FOR INSERT
  WITH CHECK (va_id = auth.uid());

CREATE POLICY "foia_requests_update" ON foia_requests FOR UPDATE
  USING (
    va_id = auth.uid()
    OR EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

-- foia_invites
ALTER TABLE foia_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foia_invites_select" ON foia_invites FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "foia_invites_insert" ON foia_invites FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
  );

CREATE POLICY "foia_invites_update" ON foia_invites FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM foia_profiles fp WHERE fp.id = auth.uid() AND fp.role = 'admin')
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
