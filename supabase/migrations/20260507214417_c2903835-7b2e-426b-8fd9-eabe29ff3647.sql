-- P0 Phase 1: Enrichment Foundation
-- NOTE: enrichment_jobs renamed to enrichment_agent_jobs to avoid conflict with existing list-enrichment table

-- 1. parcel_attributes (mirrors properties RLS)
create table public.parcel_attributes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  beds numeric,
  baths numeric,
  sqft integer,
  year_built integer,
  lot_size_sqft numeric,
  owner_name text,
  owner_mailing_address text,
  assessed_value numeric,
  market_value numeric,
  last_sale_date date,
  last_sale_price numeric,
  source text,
  source_record_id text,
  raw_data jsonb,
  enriched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, source)
);

create index idx_parcel_attributes_property_id on public.parcel_attributes(property_id);
create index idx_parcel_attributes_source on public.parcel_attributes(source);
create index idx_parcel_attributes_enriched_at on public.parcel_attributes(enriched_at desc);

create trigger trg_parcel_attributes_updated_at
  before update on public.parcel_attributes
  for each row execute function public.update_updated_at_column();

alter table public.parcel_attributes enable row level security;

create policy "parcel_attributes_select_authenticated"
  on public.parcel_attributes for select to authenticated using (true);

create policy "parcel_attributes_admin_all"
  on public.parcel_attributes for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 2. enrichment_sources (admin-only)
create table public.enrichment_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null,
  base_url text,
  rate_limit_per_minute integer,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_enrichment_sources_active on public.enrichment_sources(is_active) where is_active = true;

create trigger trg_enrichment_sources_updated_at
  before update on public.enrichment_sources
  for each row execute function public.update_updated_at_column();

alter table public.enrichment_sources enable row level security;

create policy "enrichment_sources_admin_all"
  on public.enrichment_sources for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 3. enrichment_agent_jobs (admin-only) -- renamed from enrichment_jobs
create table public.enrichment_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  priority integer not null default 100,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  idempotency_key text unique,
  source text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  locked_at timestamptz,
  locked_by text,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_enrichment_agent_jobs_status_priority
  on public.enrichment_agent_jobs(status, priority desc, scheduled_for)
  where status in ('queued', 'running');
create index idx_enrichment_agent_jobs_property_id on public.enrichment_agent_jobs(property_id);
create index idx_enrichment_agent_jobs_job_type on public.enrichment_agent_jobs(job_type);
create index idx_enrichment_agent_jobs_locked
  on public.enrichment_agent_jobs(locked_at) where locked_at is not null;

create trigger trg_enrichment_agent_jobs_updated_at
  before update on public.enrichment_agent_jobs
  for each row execute function public.update_updated_at_column();

alter table public.enrichment_agent_jobs enable row level security;

create policy "enrichment_agent_jobs_admin_all"
  on public.enrichment_agent_jobs for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));