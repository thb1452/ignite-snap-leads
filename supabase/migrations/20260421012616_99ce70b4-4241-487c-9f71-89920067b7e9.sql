-- ============================================================================
-- PHASE 5: SMS + DRIP ENGINE (BYOA Twilio)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SMS THREADS
-- ----------------------------------------------------------------------------
CREATE TABLE public.sms_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, from_number, to_number)
);
CREATE INDEX idx_sms_threads_org ON public.sms_threads(org_id, updated_at DESC);
CREATE INDEX idx_sms_threads_lead ON public.sms_threads(lead_id);
CREATE INDEX idx_sms_threads_to_number ON public.sms_threads(org_id, to_number);

-- ----------------------------------------------------------------------------
-- 2. SMS MESSAGES
-- ----------------------------------------------------------------------------
CREATE TABLE public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.sms_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  body TEXT NOT NULL,
  twilio_sid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT,
  cost_cents INTEGER,
  drip_enrollment_id UUID,
  sent_by UUID,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_messages_thread ON public.sms_messages(thread_id, sent_at DESC);
CREATE INDEX idx_sms_messages_org ON public.sms_messages(org_id, sent_at DESC);

-- ----------------------------------------------------------------------------
-- 3. DRIP SEQUENCES
-- ----------------------------------------------------------------------------
CREATE TABLE public.drip_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','stage_change','distress_event')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_drip_sequences_org ON public.drip_sequences(org_id);

-- ----------------------------------------------------------------------------
-- 4. DRIP STEPS
-- ----------------------------------------------------------------------------
CREATE TABLE public.drip_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.drip_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email','task')),
  template_body TEXT NOT NULL,
  branch_condition JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);
CREATE INDEX idx_drip_steps_sequence ON public.drip_steps(sequence_id, step_order);

-- ----------------------------------------------------------------------------
-- 5. DRIP ENROLLMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE public.drip_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.drip_sequences(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled','failed')),
  pause_reason TEXT,
  to_number TEXT,
  enrolled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (lead_id, sequence_id)
);
CREATE INDEX idx_drip_enrollments_due ON public.drip_enrollments(next_run_at) WHERE status = 'active';
CREATE INDEX idx_drip_enrollments_org ON public.drip_enrollments(org_id);
CREATE INDEX idx_drip_enrollments_lead ON public.drip_enrollments(lead_id);

-- ----------------------------------------------------------------------------
-- 6. updated_at triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tg_sms_threads_updated BEFORE UPDATE ON public.sms_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER tg_drip_sequences_updated BEFORE UPDATE ON public.drip_sequences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER tg_drip_enrollments_updated BEFORE UPDATE ON public.drip_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. RLS — every table org-scoped via profiles.org_id
-- ----------------------------------------------------------------------------
ALTER TABLE public.sms_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_enrollments ENABLE ROW LEVEL SECURITY;

-- Helper: current user's org
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- sms_threads
CREATE POLICY "org members read sms_threads" ON public.sms_threads
  FOR SELECT USING (org_id = public.current_user_org_id());
CREATE POLICY "org members write sms_threads" ON public.sms_threads
  FOR INSERT WITH CHECK (org_id = public.current_user_org_id());
CREATE POLICY "org members update sms_threads" ON public.sms_threads
  FOR UPDATE USING (org_id = public.current_user_org_id());
CREATE POLICY "admins manage sms_threads" ON public.sms_threads
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- sms_messages
CREATE POLICY "org members read sms_messages" ON public.sms_messages
  FOR SELECT USING (org_id = public.current_user_org_id());
CREATE POLICY "org members write sms_messages" ON public.sms_messages
  FOR INSERT WITH CHECK (org_id = public.current_user_org_id());
CREATE POLICY "admins manage sms_messages" ON public.sms_messages
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- drip_sequences
CREATE POLICY "org members read drip_sequences" ON public.drip_sequences
  FOR SELECT USING (org_id = public.current_user_org_id());
CREATE POLICY "org members write drip_sequences" ON public.drip_sequences
  FOR INSERT WITH CHECK (org_id = public.current_user_org_id());
CREATE POLICY "org members update drip_sequences" ON public.drip_sequences
  FOR UPDATE USING (org_id = public.current_user_org_id());
CREATE POLICY "org members delete drip_sequences" ON public.drip_sequences
  FOR DELETE USING (org_id = public.current_user_org_id());

-- drip_steps (inherits org via sequence)
CREATE POLICY "org members read drip_steps" ON public.drip_steps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.drip_sequences s WHERE s.id = sequence_id AND s.org_id = public.current_user_org_id())
  );
CREATE POLICY "org members write drip_steps" ON public.drip_steps
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.drip_sequences s WHERE s.id = sequence_id AND s.org_id = public.current_user_org_id())
  );
CREATE POLICY "org members update drip_steps" ON public.drip_steps
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.drip_sequences s WHERE s.id = sequence_id AND s.org_id = public.current_user_org_id())
  );
CREATE POLICY "org members delete drip_steps" ON public.drip_steps
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.drip_sequences s WHERE s.id = sequence_id AND s.org_id = public.current_user_org_id())
  );

-- drip_enrollments
CREATE POLICY "org members read drip_enrollments" ON public.drip_enrollments
  FOR SELECT USING (org_id = public.current_user_org_id());
CREATE POLICY "org members write drip_enrollments" ON public.drip_enrollments
  FOR INSERT WITH CHECK (org_id = public.current_user_org_id());
CREATE POLICY "org members update drip_enrollments" ON public.drip_enrollments
  FOR UPDATE USING (org_id = public.current_user_org_id());

-- ----------------------------------------------------------------------------
-- 8. Realtime
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drip_enrollments;