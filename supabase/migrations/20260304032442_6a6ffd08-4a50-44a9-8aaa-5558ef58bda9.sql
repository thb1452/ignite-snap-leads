
-- VA credential slot assignments (which 3 credentials each VA uses)
CREATE TABLE IF NOT EXISTS va_credential_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id uuid NOT NULL REFERENCES foia_profiles(id) ON DELETE CASCADE,
  press_account_id uuid NOT NULL REFERENCES press_accounts(id) ON DELETE CASCADE,
  slot_number int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  batch_number int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(va_id, slot_number),
  UNIQUE(va_id, press_account_id)
);

-- Track credential+URL usage for 5-month cooldown enforcement
CREATE TABLE IF NOT EXISTS credential_target_cooldown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  press_account_id uuid NOT NULL REFERENCES press_accounts(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(press_account_id, target_id)
);

-- Admin rotation alerts
CREATE TABLE IF NOT EXISTS rotation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id uuid NOT NULL REFERENCES foia_profiles(id) ON DELETE CASCADE,
  old_press_account_id uuid REFERENCES press_accounts(id),
  new_press_account_id uuid REFERENCES press_accounts(id),
  targets_assigned int NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'batch_complete',
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE va_credential_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_target_cooldown ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_alerts ENABLE ROW LEVEL SECURITY;

-- VA credential slots policies
CREATE POLICY "admin_manage_va_credential_slots" ON va_credential_slots
  FOR ALL TO authenticated
  USING (is_foia_admin())
  WITH CHECK (is_foia_admin());

CREATE POLICY "va_read_own_credential_slots" ON va_credential_slots
  FOR SELECT TO authenticated
  USING (va_id = auth.uid());

-- Cooldown policies
CREATE POLICY "admin_manage_cooldowns" ON credential_target_cooldown
  FOR ALL TO authenticated
  USING (is_foia_admin())
  WITH CHECK (is_foia_admin());

CREATE POLICY "authenticated_read_cooldowns" ON credential_target_cooldown
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Rotation alerts policies
CREATE POLICY "admin_manage_rotation_alerts" ON rotation_alerts
  FOR ALL TO authenticated
  USING (is_foia_admin())
  WITH CHECK (is_foia_admin());

CREATE POLICY "va_read_own_rotation_alerts" ON rotation_alerts
  FOR SELECT TO authenticated
  USING (va_id = auth.uid());

-- Indexes
CREATE INDEX idx_cooldown_credential_target ON credential_target_cooldown(press_account_id, target_id);
CREATE INDEX idx_cooldown_used_at ON credential_target_cooldown(used_at);
CREATE INDEX idx_rotation_alerts_created ON rotation_alerts(created_at DESC);
CREATE INDEX idx_va_credential_slots_active ON va_credential_slots(va_id, is_active);
