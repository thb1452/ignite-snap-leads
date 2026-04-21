-- ============================================================
-- Phase 3: Lead Pipeline + CSV Import (Foundation)
-- ============================================================

-- ---------- pipeline_stages ----------
CREATE TABLE public.pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#64748b',
  is_won      BOOLEAN NOT NULL DEFAULT false,
  is_lost     BOOLEAN NOT NULL DEFAULT false,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_stages_org ON public.pipeline_stages(org_id, sort_order);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_org_select"
ON public.pipeline_stages FOR SELECT TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "pipeline_stages_org_insert"
ON public.pipeline_stages FOR INSERT TO authenticated
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "pipeline_stages_org_update"
ON public.pipeline_stages FOR UPDATE TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "pipeline_stages_org_delete"
ON public.pipeline_stages FOR DELETE TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));


-- ---------- leads ----------
CREATE TABLE public.leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id            UUID REFERENCES public.owners(id) ON DELETE SET NULL,
  stage_id            UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  assigned_to         UUID,                    -- auth.users.id (no FK to auth schema)
  created_by          UUID NOT NULL,
  priority            INTEGER NOT NULL DEFAULT 0,
  source              TEXT NOT NULL DEFAULT 'manual',
  notes               TEXT,
  last_contacted_at   TIMESTAMPTZ,
  next_follow_up_at   TIMESTAMPTZ,
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, property_id)
);

CREATE INDEX idx_leads_org_stage         ON public.leads(org_id, stage_id);
CREATE INDEX idx_leads_assigned_to       ON public.leads(assigned_to);
CREATE INDEX idx_leads_property          ON public.leads(property_id);
CREATE INDEX idx_leads_next_follow_up    ON public.leads(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX idx_leads_priority          ON public.leads(org_id, priority DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_org_select"
ON public.leads FOR SELECT TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "leads_org_insert"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (
  org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "leads_org_update"
ON public.leads FOR UPDATE TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "leads_org_delete"
ON public.leads FOR DELETE TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));


-- ---------- lead_activities ----------
CREATE TABLE public.lead_activities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id       UUID,                          -- null for system events
  activity_type  TEXT NOT NULL CHECK (activity_type IN
    ('note','call','sms','email','stage_change','distress_event','assignment','task','system')),
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead ON public.lead_activities(lead_id, created_at DESC);
CREATE INDEX idx_lead_activities_org  ON public.lead_activities(org_id, created_at DESC);
CREATE INDEX idx_lead_activities_type ON public.lead_activities(activity_type);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_activities_org_select"
ON public.lead_activities FOR SELECT TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "lead_activities_org_insert"
ON public.lead_activities FOR INSERT TO authenticated
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "lead_activities_org_delete"
ON public.lead_activities FOR DELETE TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));


-- ---------- lead_tags ----------
CREATE TABLE public.lead_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#64748b',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, label)
);

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_tags_org_all"
ON public.lead_tags FOR ALL TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));


-- ---------- lead_tag_assignments ----------
CREATE TABLE public.lead_tag_assignments (
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_tag_assignments_org_all"
ON public.lead_tag_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_tag_assignments.lead_id
      AND l.org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_tag_assignments.lead_id
      AND l.org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid())
  )
);


-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_pipeline_stages_updated_at
BEFORE UPDATE ON public.pipeline_stages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- Default stage seeder ----------
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pipeline_stages (org_id, name, sort_order, color, is_won, is_lost, is_default)
  VALUES
    (_org_id, 'New',            10, '#3b82f6', false, false, true),
    (_org_id, 'Researching',    20, '#8b5cf6', false, false, true),
    (_org_id, 'Contacted',      30, '#06b6d4', false, false, true),
    (_org_id, 'Negotiating',    40, '#f59e0b', false, false, true),
    (_org_id, 'Under Contract', 50, '#10b981', false, false, true),
    (_org_id, 'Closed Won',     60, '#059669', true,  false, true),
    (_org_id, 'Closed Lost',    70, '#94a3b8', false, true,  true)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Auto-seed stages for new orgs
CREATE OR REPLACE FUNCTION public.handle_new_org_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orgs_seed_pipeline_stages
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.handle_new_org_pipeline_stages();

-- Backfill existing organizations
DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_pipeline_stages(org_record.id);
  END LOOP;
END $$;


-- ---------- Stage-change activity logger ----------
CREATE OR REPLACE FUNCTION public.log_lead_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO public.lead_activities (lead_id, org_id, actor_id, activity_type, payload)
    VALUES (
      NEW.id,
      NEW.org_id,
      auth.uid(),
      'stage_change',
      jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_log_stage_change
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_stage_change();