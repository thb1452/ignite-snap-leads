-- =========
--  A) PUBLIC INVENTORY  (no user_id; readable to any authenticated user)
-- =========
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select_auth ON public.properties;
DROP POLICY IF EXISTS violations_select_auth ON public.violations;

CREATE POLICY properties_select_auth
  ON public.properties
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY violations_select_auth
  ON public.violations
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = violations.property_id
  ));

-- =========
--  B) USER-OWNED TABLES
-- =========
-- Ensure columns exist
ALTER TABLE public.lead_lists       ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.list_properties  ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.lead_activity    ADD COLUMN IF NOT EXISTS user_id uuid;

-- Enable RLS
ALTER TABLE public.lead_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- lead_lists: full owner CRUD
CREATE POLICY lead_lists_select
  ON public.lead_lists FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY lead_lists_insert
  ON public.lead_lists FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY lead_lists_update
  ON public.lead_lists FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY lead_lists_delete
  ON public.lead_lists FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- list_properties: enforce via list ownership
CREATE POLICY list_props_select
  ON public.list_properties FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lead_lists l
    WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()
  ));

CREATE POLICY list_props_insert
  ON public.list_properties FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lead_lists l
    WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()
  ));

CREATE POLICY list_props_update
  ON public.list_properties FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lead_lists l
    WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lead_lists l
    WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()
  ));

CREATE POLICY list_props_delete
  ON public.list_properties FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lead_lists l
    WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()
  ));

-- lead_activity: owner CRUD
CREATE POLICY lead_activity_select
  ON public.lead_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY lead_activity_insert
  ON public.lead_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY lead_activity_update
  ON public.lead_activity FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY lead_activity_delete
  ON public.lead_activity FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- call_logs: owner CRUD
CREATE POLICY call_logs_select
  ON public.call_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY call_logs_insert
  ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY call_logs_update
  ON public.call_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY call_logs_delete
  ON public.call_logs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- templates: read global (user_id IS NULL) + own; write only own
CREATE POLICY sms_templates_select
  ON public.sms_templates FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY sms_templates_insert
  ON public.sms_templates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY sms_templates_update
  ON public.sms_templates FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY sms_templates_delete
  ON public.sms_templates FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY email_templates_select
  ON public.email_templates FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY email_templates_insert
  ON public.email_templates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY email_templates_update
  ON public.email_templates FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY email_templates_delete
  ON public.email_templates FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Contacts & credits tables
CREATE TABLE IF NOT EXISTS public.property_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name         text,
  phone        text,
  email        text,
  source       text,
  raw_payload  jsonb,
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_contacts_select
  ON public.property_contacts FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY property_contacts_insert
  ON public.property_contacts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- credits ledger
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  delta       integer NOT NULL,
  reason      text NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_ledger_user
  ON public.credit_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY credit_ledger_insert
  ON public.credit_ledger FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Helper view: current credit balance
CREATE OR REPLACE VIEW public.v_user_credits AS
SELECT user_id, COALESCE(SUM(delta), 0) AS balance
FROM public.credit_ledger
GROUP BY user_id;

-- Atomic credit consumption function
CREATE OR REPLACE FUNCTION public.fn_consume_credit(p_reason text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bal int;
BEGIN
  SELECT COALESCE(SUM(delta),0) INTO bal
  FROM public.credit_ledger
  WHERE user_id = auth.uid();

  IF bal <= 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, meta)
  VALUES (auth.uid(), -1, p_reason, p_meta);

  RETURN 1;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_consume_credit(text, jsonb) TO authenticated;