-- =============================================
-- PERFORMANCE INDEXES (10-50x faster queries)
-- =============================================

-- Properties table - main query target
CREATE INDEX IF NOT EXISTS idx_properties_city_state ON properties(city, state);
CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county);
CREATE INDEX IF NOT EXISTS idx_properties_snap_score ON properties(snap_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_properties_jurisdiction_id ON properties(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_properties_opportunity_class ON properties(opportunity_class);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_total_violations ON properties(total_violations DESC NULLS LAST);

-- Violations table - frequently joined
CREATE INDEX IF NOT EXISTS idx_violations_property_id ON violations(property_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status);
CREATE INDEX IF NOT EXISTS idx_violations_opened_date ON violations(opened_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_violations_violation_type ON violations(violation_type);

-- Upload jobs - user dashboard queries
CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_id ON upload_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_created_at ON upload_jobs(created_at DESC);

-- Upload staging - batch processing
CREATE INDEX IF NOT EXISTS idx_upload_staging_job_id ON upload_staging(job_id);
CREATE INDEX IF NOT EXISTS idx_upload_staging_processed ON upload_staging(processed) WHERE processed = false;

-- User subscriptions - auth/billing lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);

-- Subscription usage - billing period lookups
CREATE INDEX IF NOT EXISTS idx_subscription_usage_user_id ON subscription_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_period ON subscription_usage(period_start, period_end);

-- Property contacts - skip trace results
CREATE INDEX IF NOT EXISTS idx_property_contacts_property_id ON property_contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_property_contacts_created_by ON property_contacts(created_by);

-- Lead lists and list properties
CREATE INDEX IF NOT EXISTS idx_lead_lists_user_id ON lead_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_properties_list_id ON list_properties(list_id);
CREATE INDEX IF NOT EXISTS idx_list_properties_property_id ON list_properties(property_id);

-- Credit ledgers
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON credit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_skiptrace_user_id ON credit_ledger_skiptrace(user_id);

-- User roles - auth checks
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Geocoding jobs
CREATE INDEX IF NOT EXISTS idx_geocoding_jobs_user_id ON geocoding_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_geocoding_jobs_status ON geocoding_jobs(status);

-- Skip trace jobs
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_user_id ON skiptrace_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_status ON skiptrace_jobs(status);

-- Counties - VA assignment lookups
CREATE INDEX IF NOT EXISTS idx_counties_assigned_to ON counties(assigned_to);
CREATE INDEX IF NOT EXISTS idx_counties_state ON counties(state);

-- Webhook events - idempotency checks
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- =============================================
-- FOREIGN KEY CONSTRAINTS (Data Integrity)
-- =============================================

-- Violations → Properties
ALTER TABLE violations 
  DROP CONSTRAINT IF EXISTS violations_property_id_fkey,
  ADD CONSTRAINT violations_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE CASCADE;

-- Property contacts → Properties
ALTER TABLE property_contacts 
  DROP CONSTRAINT IF EXISTS property_contacts_property_id_fkey,
  ADD CONSTRAINT property_contacts_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE CASCADE;

-- List properties → Lead lists
ALTER TABLE list_properties 
  DROP CONSTRAINT IF EXISTS list_properties_list_id_fkey,
  ADD CONSTRAINT list_properties_list_id_fkey 
    FOREIGN KEY (list_id) 
    REFERENCES lead_lists(id) 
    ON DELETE CASCADE;

-- List properties → Properties
ALTER TABLE list_properties 
  DROP CONSTRAINT IF EXISTS list_properties_property_id_fkey,
  ADD CONSTRAINT list_properties_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE CASCADE;

-- User subscriptions → Subscription plans
ALTER TABLE user_subscriptions 
  DROP CONSTRAINT IF EXISTS user_subscriptions_plan_id_fkey,
  ADD CONSTRAINT user_subscriptions_plan_id_fkey 
    FOREIGN KEY (plan_id) 
    REFERENCES subscription_plans(id) 
    ON DELETE RESTRICT;

-- Upload staging → Upload jobs
ALTER TABLE upload_staging 
  DROP CONSTRAINT IF EXISTS upload_staging_job_id_fkey,
  ADD CONSTRAINT upload_staging_job_id_fkey 
    FOREIGN KEY (job_id) 
    REFERENCES upload_jobs(id) 
    ON DELETE CASCADE;

-- Upload jobs → Jurisdictions
ALTER TABLE upload_jobs 
  DROP CONSTRAINT IF EXISTS upload_jobs_jurisdiction_id_fkey,
  ADD CONSTRAINT upload_jobs_jurisdiction_id_fkey 
    FOREIGN KEY (jurisdiction_id) 
    REFERENCES jurisdictions(id) 
    ON DELETE SET NULL;

-- Properties → Jurisdictions
ALTER TABLE properties 
  DROP CONSTRAINT IF EXISTS properties_jurisdiction_id_fkey,
  ADD CONSTRAINT properties_jurisdiction_id_fkey 
    FOREIGN KEY (jurisdiction_id) 
    REFERENCES jurisdictions(id) 
    ON DELETE SET NULL;

-- Lead activity → Properties
ALTER TABLE lead_activity 
  DROP CONSTRAINT IF EXISTS lead_activity_property_id_fkey,
  ADD CONSTRAINT lead_activity_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE CASCADE;

-- Call logs → Properties
ALTER TABLE call_logs 
  DROP CONSTRAINT IF EXISTS call_logs_property_id_fkey,
  ADD CONSTRAINT call_logs_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE CASCADE;

-- Clean leads → Properties
ALTER TABLE clean_leads 
  DROP CONSTRAINT IF EXISTS clean_leads_property_id_fkey,
  ADD CONSTRAINT clean_leads_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE CASCADE;

-- Clean leads → Counties
ALTER TABLE clean_leads 
  DROP CONSTRAINT IF EXISTS clean_leads_county_id_fkey,
  ADD CONSTRAINT clean_leads_county_id_fkey 
    FOREIGN KEY (county_id) 
    REFERENCES counties(id) 
    ON DELETE SET NULL;

-- FOIA requests → Counties
ALTER TABLE foia_requests 
  DROP CONSTRAINT IF EXISTS foia_requests_county_id_fkey,
  ADD CONSTRAINT foia_requests_county_id_fkey 
    FOREIGN KEY (county_id) 
    REFERENCES counties(id) 
    ON DELETE SET NULL;

-- Staging uploads → Counties
ALTER TABLE staging_uploads 
  DROP CONSTRAINT IF EXISTS staging_uploads_county_id_fkey,
  ADD CONSTRAINT staging_uploads_county_id_fkey 
    FOREIGN KEY (county_id) 
    REFERENCES counties(id) 
    ON DELETE SET NULL;

-- Upload history → Counties
ALTER TABLE upload_history 
  DROP CONSTRAINT IF EXISTS upload_history_county_id_fkey,
  ADD CONSTRAINT upload_history_county_id_fkey 
    FOREIGN KEY (county_id) 
    REFERENCES counties(id) 
    ON DELETE SET NULL;

-- Credit ledger skiptrace → Skiptrace jobs
ALTER TABLE credit_ledger_skiptrace 
  DROP CONSTRAINT IF EXISTS credit_ledger_skiptrace_job_id_fkey,
  ADD CONSTRAINT credit_ledger_skiptrace_job_id_fkey 
    FOREIGN KEY (job_id) 
    REFERENCES skiptrace_jobs(id) 
    ON DELETE SET NULL;

-- Credit ledger skiptrace → Properties
ALTER TABLE credit_ledger_skiptrace 
  DROP CONSTRAINT IF EXISTS credit_ledger_skiptrace_property_id_fkey,
  ADD CONSTRAINT credit_ledger_skiptrace_property_id_fkey 
    FOREIGN KEY (property_id) 
    REFERENCES properties(id) 
    ON DELETE SET NULL;

-- Skiptrace bulk runs → Lead lists
ALTER TABLE skiptrace_bulk_runs 
  DROP CONSTRAINT IF EXISTS skiptrace_bulk_runs_list_id_fkey,
  ADD CONSTRAINT skiptrace_bulk_runs_list_id_fkey 
    FOREIGN KEY (list_id) 
    REFERENCES lead_lists(id) 
    ON DELETE SET NULL;

-- Profiles → Organizations
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_org_id_fkey,
  ADD CONSTRAINT profiles_org_id_fkey 
    FOREIGN KEY (org_id) 
    REFERENCES organizations(id) 
    ON DELETE CASCADE;