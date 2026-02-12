-- ============================================================
-- SNAP IGNITE COMPLETE SCHEMA EXPORT
-- Run this in your Supabase Pro SQL Editor BEFORE migrating data
-- ============================================================

-- ============================================================
-- PART 1: EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- PART 2: CUSTOM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'va', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- PART 3: TABLES (in dependency order)
-- ============================================================

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  credits integer DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Jurisdictions
CREATE TABLE IF NOT EXISTS public.jurisdictions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  county text,
  state text NOT NULL,
  default_zip_range text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  enforcement_profile jsonb DEFAULT '{"strictness": "unknown", "score_multiplier": 1.0, "avg_days_to_close": 0, "total_properties_cited": 0, "avg_violations_per_property": 0}'::jsonb
);

-- Counties
CREATE TABLE IF NOT EXISTS public.counties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  county_name text NOT NULL,
  state text NOT NULL,
  foia_status text,
  assigned_to uuid,
  upload_status text DEFAULT 'pending'::text,
  last_upload_date timestamp with time zone,
  list_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  foia_portal_url text,
  portal_type text DEFAULT 'web_form'::text,
  last_request_date date,
  notes text,
  CONSTRAINT counties_county_name_state_key UNIQUE (county_name, state)
);

-- Properties
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  latitude numeric,
  longitude numeric,
  snap_score integer,
  snap_insight text,
  photo_url text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  geom geometry,
  jurisdiction_id uuid REFERENCES public.jurisdictions(id),
  total_violations integer DEFAULT 0,
  open_violations integer DEFAULT 0,
  oldest_violation_date date,
  newest_violation_date date,
  avg_days_open integer DEFAULT 0,
  violation_types text[] DEFAULT '{}'::text[],
  repeat_offender boolean DEFAULT false,
  multi_department boolean DEFAULT false,
  escalated boolean DEFAULT false,
  distress_signals text[] DEFAULT '{}'::text[],
  opportunity_class text DEFAULT 'watch'::text,
  last_analyzed_at timestamp with time zone,
  scope text DEFAULT 'city'::text,
  county text,
  last_enforcement_date timestamp with time zone,
  enforcement_type text NOT NULL DEFAULT 'code_violation'::text
);

-- Violations
CREATE TABLE IF NOT EXISTS public.violations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id),
  case_id text,
  violation_type text NOT NULL,
  description text,
  status text NOT NULL,
  opened_date date,
  last_updated date,
  days_open integer,
  created_at timestamp without time zone DEFAULT now(),
  raw_description text,
  first_seen_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone DEFAULT now(),
  status_changed_at timestamp with time zone,
  previous_status text,
  closed_at date
);

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  email text,
  full_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_roles_user_role_key UNIQUE (user_id, role)
);

-- User Profiles (separate from profiles)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  credits integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  consented_skiptrace boolean DEFAULT false,
  onboarding_completed boolean DEFAULT false
);

-- User Subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active'::text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- User Allowed States
CREATE TABLE IF NOT EXISTS public.user_allowed_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  state text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_allowed_states_user_state_key UNIQUE (user_id, state)
);

-- User Invitations
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  role app_role NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  accepted_at timestamp with time zone,
  status text DEFAULT 'pending'::text
);

-- Lead Lists
CREATE TABLE IF NOT EXISTS public.lead_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

-- List Properties
CREATE TABLE IF NOT EXISTS public.list_properties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id uuid REFERENCES public.lead_lists(id),
  property_id uuid REFERENCES public.properties(id),
  added_at timestamp without time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT list_properties_list_id_property_id_key UNIQUE (list_id, property_id)
);

-- Lead Activity
CREATE TABLE IF NOT EXISTS public.lead_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id),
  user_id uuid,
  status text,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

-- Clean Leads
CREATE TABLE IF NOT EXISTS public.clean_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id),
  county_id uuid REFERENCES public.counties(id),
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text,
  violation_description text,
  violation_type text,
  opened_date date,
  last_updated date,
  snap_score integer,
  snap_insight text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

-- Upload Jobs
CREATE TABLE IF NOT EXISTS public.upload_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  file_size integer NOT NULL,
  total_rows integer,
  processed_rows integer DEFAULT 0,
  properties_created integer DEFAULT 0,
  violations_created integer DEFAULT 0,
  status text DEFAULT 'QUEUED'::text,
  error_message text,
  warnings jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  jurisdiction_id uuid REFERENCES public.jurisdictions(id),
  city text,
  county text,
  state text,
  scope text DEFAULT 'city'::text,
  bad_addresses integer DEFAULT 0,
  bad_address_samples jsonb DEFAULT '[]'::jsonb,
  properties_matched integer DEFAULT 0,
  source_type text DEFAULT 'code_violation'::text
);

-- Upload Staging
CREATE TABLE IF NOT EXISTS public.upload_staging (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.upload_jobs(id),
  row_num integer NOT NULL,
  case_id text,
  address text NOT NULL,
  city text,
  state text,
  zip text,
  violation text NOT NULL,
  status text,
  opened_date date,
  last_updated date,
  property_id uuid,
  processed boolean DEFAULT false,
  error text,
  created_at timestamp with time zone DEFAULT now(),
  jurisdiction_id uuid,
  raw_description text
);

-- FOIA Templates
CREATE TABLE IF NOT EXISTS public.foia_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  state text,
  template_text text NOT NULL,
  use_count integer DEFAULT 0,
  success_rate numeric,
  created_at timestamp with time zone DEFAULT now()
);

-- FOIA Requests
CREATE TABLE IF NOT EXISTS public.foia_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  county_id uuid REFERENCES public.counties(id),
  requested_by uuid NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  request_method text DEFAULT 'email'::text,
  data_years_requested text,
  status text DEFAULT 'pending'::text,
  response_date date,
  invoice_amount numeric,
  invoice_paid boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Email Templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  content text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Email Preferences
CREATE TABLE IF NOT EXISTS public.email_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  weekly_digest_enabled boolean NOT NULL DEFAULT true,
  digest_day integer NOT NULL DEFAULT 1,
  digest_hour integer NOT NULL DEFAULT 8,
  timezone text NOT NULL DEFAULT 'America/New_York'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Email Analytics
CREATE TABLE IF NOT EXISTS public.email_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email_type text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  email_subject text,
  properties_featured integer DEFAULT 0,
  new_violations_count integer DEFAULT 0
);

-- Call Logs
CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id),
  phone_number text NOT NULL,
  duration integer,
  notes text,
  call_type text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Property Contacts
CREATE TABLE IF NOT EXISTS public.property_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id),
  name text,
  phone text,
  email text,
  source text,
  raw_payload jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Credit Ledger
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  job_id_extracted uuid,
  property_id_extracted uuid
);

-- Credit Ledger Skiptrace
CREATE TABLE IF NOT EXISTS public.credit_ledger_skiptrace (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  job_id uuid,
  property_id uuid,
  delta integer NOT NULL,
  reason text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Skiptrace Jobs
CREATE TABLE IF NOT EXISTS public.skiptrace_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  property_ids uuid[] NOT NULL,
  vendor text NOT NULL DEFAULT 'BatchData'::text,
  status text NOT NULL DEFAULT 'queued'::text,
  counts jsonb DEFAULT '{"total": 0, "failed": 0, "succeeded": 0}'::jsonb,
  error text,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  job_key text
);

-- Skiptrace Outcomes
CREATE TABLE IF NOT EXISTS public.skiptrace_outcomes (
  job_id uuid NOT NULL REFERENCES public.skiptrace_jobs(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (job_id, property_id)
);

-- Skiptrace Bulk Runs
CREATE TABLE IF NOT EXISTS public.skiptrace_bulk_runs (
  run_id text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  list_id uuid REFERENCES public.lead_lists(id),
  total integer NOT NULL,
  queued integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  settings jsonb NOT NULL
);

-- Skiptrace Bulk Items
CREATE TABLE IF NOT EXISTS public.skiptrace_bulk_items (
  run_id text NOT NULL REFERENCES public.skiptrace_bulk_runs(run_id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  status text,
  message text,
  duration_ms integer,
  PRIMARY KEY (run_id, property_id)
);

-- Skiptrace Consent Log
CREATE TABLE IF NOT EXISTS public.skiptrace_consent_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  ip_hash text NOT NULL,
  user_agent text,
  consented_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Geocoding Jobs
CREATE TABLE IF NOT EXISTS public.geocoding_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  total_properties integer NOT NULL DEFAULT 0,
  geocoded_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  skipped_count integer NOT NULL DEFAULT 0
);

-- Staging Uploads
CREATE TABLE IF NOT EXISTS public.staging_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  county_id uuid REFERENCES public.counties(id),
  uploaded_by uuid,
  file_name text NOT NULL,
  total_rows integer,
  processed_rows integer DEFAULT 0,
  failed_rows integer DEFAULT 0,
  status text DEFAULT 'pending'::text,
  error_messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

-- Upload History
CREATE TABLE IF NOT EXISTS public.upload_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  county_id uuid REFERENCES public.counties(id),
  uploaded_by uuid,
  file_name text NOT NULL,
  row_count integer,
  upload_date timestamp with time zone DEFAULT now(),
  status text NOT NULL,
  error_message text
);

-- SMS Templates
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  price_monthly_cents integer NOT NULL DEFAULT 0,
  price_annual_cents integer NOT NULL DEFAULT 0,
  max_monthly_exports integer NOT NULL DEFAULT 0,
  max_counties integer NOT NULL DEFAULT 0,
  max_user_seats integer NOT NULL DEFAULT 1,
  max_skip_traces_per_month integer NOT NULL DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  has_advanced_filters boolean NOT NULL DEFAULT false,
  has_violation_filtering boolean NOT NULL DEFAULT false,
  has_rolling_intelligence boolean NOT NULL DEFAULT false,
  has_escalation_alerts boolean NOT NULL DEFAULT false,
  has_api_access boolean NOT NULL DEFAULT false,
  has_dedicated_manager boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  max_states integer DEFAULT 5,
  data_tier text NOT NULL DEFAULT 'basic'::text
);

-- Subscription Usage
CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  exports_count integer NOT NULL DEFAULT 0,
  skip_traces_count integer NOT NULL DEFAULT 0,
  api_calls_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Events
CREATE TABLE IF NOT EXISTS public.events (
  ts timestamp with time zone NOT NULL DEFAULT now(),
  type text NOT NULL,
  user_id uuid,
  job_id uuid NOT NULL,
  payload jsonb,
  PRIMARY KEY (job_id, ts, type)
);

-- Webhook Events
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  payload jsonb
);

-- ============================================================
-- PART 4: INDEXES
-- ============================================================

-- Properties indexes
CREATE INDEX IF NOT EXISTS idx_properties_city ON public.properties USING btree (city);
CREATE INDEX IF NOT EXISTS idx_properties_state ON public.properties USING btree (state);
CREATE INDEX IF NOT EXISTS idx_properties_city_state ON public.properties USING btree (city, state);
CREATE INDEX IF NOT EXISTS idx_properties_county ON public.properties USING btree (county);
CREATE INDEX IF NOT EXISTS idx_properties_zip ON public.properties USING btree (zip);
CREATE INDEX IF NOT EXISTS idx_properties_snap_score ON public.properties USING btree (snap_score DESC);
CREATE INDEX IF NOT EXISTS idx_properties_total_violations ON public.properties USING btree (total_violations DESC);
CREATE INDEX IF NOT EXISTS idx_properties_open_violations ON public.properties USING btree (open_violations DESC);
CREATE INDEX IF NOT EXISTS idx_properties_opportunity ON public.properties USING btree (opportunity_class);
CREATE INDEX IF NOT EXISTS idx_properties_repeat_offender ON public.properties USING btree (repeat_offender) WHERE repeat_offender = true;
CREATE INDEX IF NOT EXISTS idx_properties_geom ON public.properties USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_properties_violation_types ON public.properties USING gin (violation_types);
CREATE INDEX IF NOT EXISTS idx_properties_enforcement_type ON public.properties USING btree (enforcement_type);
CREATE INDEX IF NOT EXISTS idx_properties_addr_city_state ON public.properties USING btree (address, city, state);
CREATE INDEX IF NOT EXISTS idx_properties_open_violations_partial ON public.properties USING btree (open_violations DESC) WHERE open_violations > 0;
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON public.properties USING btree (created_at DESC);

-- Violations indexes
CREATE INDEX IF NOT EXISTS idx_violations_property_id ON public.violations USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON public.violations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_violations_opened_date ON public.violations USING btree (opened_date DESC);
CREATE INDEX IF NOT EXISTS idx_violations_type ON public.violations USING btree (violation_type);

-- Counties indexes
CREATE INDEX IF NOT EXISTS idx_counties_state ON public.counties USING btree (state);
CREATE INDEX IF NOT EXISTS idx_counties_status ON public.counties USING btree (foia_status);
CREATE INDEX IF NOT EXISTS idx_counties_assigned_to ON public.counties USING btree (assigned_to);

-- Upload jobs indexes
CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_id ON public.upload_jobs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON public.upload_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_created_at ON public.upload_jobs USING btree (created_at DESC);

-- Upload staging indexes
CREATE INDEX IF NOT EXISTS idx_upload_staging_job_id ON public.upload_staging USING btree (job_id);
CREATE INDEX IF NOT EXISTS idx_upload_staging_processed ON public.upload_staging USING btree (processed) WHERE processed = false;

-- Lead lists indexes
CREATE INDEX IF NOT EXISTS idx_lead_lists_user_id ON public.lead_lists USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_list_properties_list_id ON public.list_properties USING btree (list_id);
CREATE INDEX IF NOT EXISTS idx_list_properties_property_id ON public.list_properties USING btree (property_id);

-- Credit ledger indexes
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON public.credit_ledger USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON public.credit_ledger USING btree (user_id, created_at DESC);

-- Geocoding jobs indexes
CREATE INDEX IF NOT EXISTS idx_geocoding_jobs_status ON public.geocoding_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_geocoding_jobs_user_id ON public.geocoding_jobs USING btree (user_id);

-- FOIA requests indexes
CREATE INDEX IF NOT EXISTS idx_foia_requests_county ON public.foia_requests USING btree (county_id);
CREATE INDEX IF NOT EXISTS idx_foia_requests_requested_by ON public.foia_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_foia_requests_date ON public.foia_requests USING btree (request_date);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles USING btree (org_id);

-- ============================================================
-- PART 5: HELPER FUNCTION (required for RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(p_user_id uuid, p_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = p_role
  );
$$;

-- ============================================================
-- PART 6: ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_allowed_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clean_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foia_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger_skiptrace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_bulk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_bulk_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skiptrace_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocoding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 7: RLS POLICIES
-- ============================================================

-- Properties: Authenticated users can read all, insert, delete
CREATE POLICY "properties_select_auth" ON public.properties FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert properties" ON public.properties FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete properties" ON public.properties FOR DELETE USING (auth.uid() IS NOT NULL);

-- Violations: Authenticated users can read, insert, delete
CREATE POLICY "violations_select_auth" ON public.violations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert violations" ON public.violations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete violations" ON public.violations FOR DELETE USING (auth.uid() IS NOT NULL);

-- User Roles: Users view own, admins manage
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- User Profiles
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);

-- User Subscriptions
CREATE POLICY "Users can view their own subscriptions" ON public.user_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role manages subscriptions" ON public.user_subscriptions FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- Upload Jobs
CREATE POLICY "Users can view own upload jobs" ON public.upload_jobs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own upload jobs" ON public.upload_jobs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own upload jobs" ON public.upload_jobs FOR UPDATE USING (user_id = auth.uid());

-- Upload Staging
CREATE POLICY "Users can view own staging data" ON public.upload_staging FOR SELECT USING (job_id IN (SELECT id FROM upload_jobs WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert staging data" ON public.upload_staging FOR INSERT WITH CHECK (job_id IN (SELECT id FROM upload_jobs WHERE user_id = auth.uid()));

-- Lead Lists
CREATE POLICY "lead_lists_select" ON public.lead_lists FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "lead_lists_insert" ON public.lead_lists FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "lead_lists_update" ON public.lead_lists FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lead_lists_delete" ON public.lead_lists FOR DELETE USING (user_id = auth.uid());

-- List Properties
CREATE POLICY "list_props_select" ON public.list_properties FOR SELECT USING (EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()));
CREATE POLICY "list_props_insert" ON public.list_properties FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()));
CREATE POLICY "list_props_update" ON public.list_properties FOR UPDATE USING (EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_properties.list_id AND l.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()));
CREATE POLICY "list_props_delete" ON public.list_properties FOR DELETE USING (EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_properties.list_id AND l.user_id = auth.uid()));

-- Counties
CREATE POLICY "Admins full access to counties" ON public.counties FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "VAs can view assigned counties" ON public.counties FOR SELECT USING (assigned_to = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "VAs can update assigned counties" ON public.counties FOR UPDATE USING (assigned_to = auth.uid());

-- Jurisdictions
CREATE POLICY "Users can view all jurisdictions" ON public.jurisdictions FOR SELECT USING (true);
CREATE POLICY "Admins can manage jurisdictions" ON public.jurisdictions FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Clean Leads
CREATE POLICY "Authenticated users can view clean_leads" ON public.clean_leads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins full access to clean_leads" ON public.clean_leads FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Credit Ledger
CREATE POLICY "credit_ledger_user" ON public.credit_ledger FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "credit_ledger_insert" ON public.credit_ledger FOR INSERT WITH CHECK (user_id = auth.uid());

-- Credit Ledger Skiptrace
CREATE POLICY "Users can view own ledger" ON public.credit_ledger_skiptrace FOR SELECT USING (user_id = auth.uid());

-- Skiptrace Jobs
CREATE POLICY "Users can view own jobs" ON public.skiptrace_jobs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own jobs" ON public.skiptrace_jobs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own jobs" ON public.skiptrace_jobs FOR UPDATE USING (user_id = auth.uid());

-- Skiptrace Outcomes
CREATE POLICY "owner can read/write outcomes" ON public.skiptrace_outcomes FOR ALL USING (EXISTS (SELECT 1 FROM skiptrace_jobs j WHERE j.id = skiptrace_outcomes.job_id AND j.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM skiptrace_jobs j WHERE j.id = skiptrace_outcomes.job_id AND j.user_id = auth.uid()));

-- Skiptrace Bulk Runs
CREATE POLICY "Users can view their own bulk runs" ON public.skiptrace_bulk_runs FOR SELECT USING (auth.uid() = user_id);

-- Skiptrace Bulk Items
CREATE POLICY "Users can view their own bulk items" ON public.skiptrace_bulk_items FOR SELECT USING (run_id IN (SELECT run_id FROM skiptrace_bulk_runs WHERE user_id = auth.uid()));

-- Skiptrace Consent Log
CREATE POLICY "Users can view own consent log" ON public.skiptrace_consent_log FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own consent" ON public.skiptrace_consent_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Property Contacts
CREATE POLICY "property_contacts_select" ON public.property_contacts FOR SELECT USING (created_by = auth.uid());
CREATE POLICY "property_contacts_insert" ON public.property_contacts FOR INSERT WITH CHECK (created_by = auth.uid());

-- Geocoding Jobs
CREATE POLICY "Users can view their own geocoding jobs" ON public.geocoding_jobs FOR SELECT USING ((auth.uid())::text = user_id);
CREATE POLICY "Users can insert their own geocoding jobs" ON public.geocoding_jobs FOR INSERT WITH CHECK ((auth.uid())::text = user_id);
CREATE POLICY "Users can update their geocoding jobs" ON public.geocoding_jobs FOR UPDATE USING (user_id = (auth.uid())::text);

-- Email Templates
CREATE POLICY "email_templates_select" ON public.email_templates FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "email_templates_insert" ON public.email_templates FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "email_templates_update" ON public.email_templates FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "email_templates_delete" ON public.email_templates FOR DELETE USING (user_id = auth.uid());

-- Email Preferences
CREATE POLICY "Users can view their own email preferences" ON public.email_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own email preferences" ON public.email_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own email preferences" ON public.email_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Email Analytics
CREATE POLICY "Users view own analytics" ON public.email_analytics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own analytics" ON public.email_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view email analytics" ON public.email_analytics FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Call Logs
CREATE POLICY "call_logs_select" ON public.call_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "call_logs_insert" ON public.call_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "call_logs_update" ON public.call_logs FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "call_logs_delete" ON public.call_logs FOR DELETE USING (user_id = auth.uid());

-- FOIA Templates
CREATE POLICY "Authenticated users can view templates" ON public.foia_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can insert templates" ON public.foia_templates FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update templates" ON public.foia_templates FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- FOIA Requests
CREATE POLICY "VAs can view their own requests" ON public.foia_requests FOR SELECT USING (requested_by = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "VAs can insert their own requests" ON public.foia_requests FOR INSERT WITH CHECK (requested_by = auth.uid());
CREATE POLICY "VAs can update their own requests" ON public.foia_requests FOR UPDATE USING (requested_by = auth.uid() OR has_role(auth.uid(), 'admin'));

-- User Allowed States
CREATE POLICY "Users can view their own states" ON public.user_allowed_states FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own states" ON public.user_allowed_states FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own states" ON public.user_allowed_states FOR DELETE USING (auth.uid() = user_id);

-- User Invitations
CREATE POLICY "Admins can view all invitations" ON public.user_invitations FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can create invitations" ON public.user_invitations FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

-- Organizations
CREATE POLICY "Users can view their organization" ON public.organizations FOR SELECT USING (id IN (SELECT org_id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can update their organization" ON public.organizations FOR UPDATE USING (id IN (SELECT org_id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "System can insert organizations" ON public.organizations FOR INSERT WITH CHECK (false);

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Events
CREATE POLICY "events_select_own" ON public.events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "events_insert_own" ON public.events FOR INSERT WITH CHECK (user_id = auth.uid());

-- Lead Activity
CREATE POLICY "lead_activity_select" ON public.lead_activity FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "lead_activity_insert" ON public.lead_activity FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "lead_activity_update" ON public.lead_activity FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lead_activity_delete" ON public.lead_activity FOR DELETE USING (user_id = auth.uid());

-- Staging Uploads
CREATE POLICY "VAs view own uploads" ON public.staging_uploads FOR SELECT USING (has_role(auth.uid(), 'va') AND uploaded_by = auth.uid());
CREATE POLICY "VAs insert own uploads" ON public.staging_uploads FOR INSERT WITH CHECK (has_role(auth.uid(), 'va') AND uploaded_by = auth.uid());
CREATE POLICY "Admins view all staging" ON public.staging_uploads FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- SMS Templates
CREATE POLICY "sms_templates_select" ON public.sms_templates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "sms_templates_insert" ON public.sms_templates FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "sms_templates_update" ON public.sms_templates FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "sms_templates_delete" ON public.sms_templates FOR DELETE USING (user_id = auth.uid());

-- Subscription Plans (public read)
CREATE POLICY "Anyone can view subscription plans" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Admins can manage subscription plans" ON public.subscription_plans FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Subscription Usage
CREATE POLICY "Users can view their own usage" ON public.subscription_usage FOR SELECT USING (user_id = auth.uid());

-- Webhook Events (service role only - no public policies needed)
-- These are managed by Edge Functions with service role

-- ============================================================
-- PART 8: STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('csv-uploads', 'csv-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for csv-uploads
CREATE POLICY "Users can upload their own files" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'csv-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files" ON storage.objects 
FOR SELECT USING (bucket_id = 'csv-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own files" ON storage.objects 
FOR DELETE USING (bucket_id = 'csv-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- COMPLETE! Now run the data migration from /admin/migration
-- ============================================================
