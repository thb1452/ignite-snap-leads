drop table if exists public.parcel_attributes cascade;
drop table if exists public.enrichment_agent_jobs cascade;
drop table if exists public.enrichment_sources cascade;

create table public.parcel_attributes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  beds numeric(3,1),
  baths numeric(3,1),
  building_sqft int,
  lot_sqft int,
  year_built int,
  property_type text check (property_type is null or property_type in ('sfr','condo','multi','land','other')),
  assessed_value numeric(14,2),
  last_sale_date date,
  last_sale_amount numeric(14,2),
  owner_occupied boolean,
  owner_occupied_confidence numeric(3,2) check (
    owner_occupied_confidence is null
    or (owner_occupied_confidence >= 0 and owner_occupied_confidence <= 1)
  ),
  flood_zone text,
  census_tract text,
  confidence_score numeric(3,2) check (
    confidence_score is null
    or (confidence_score >= 0 and confidence_score <= 1)
  ),
  verification_status text check (
    verification_status is null
    or verification_status in ('verified','estimated','unknown')
  ),
  source_attribution jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_parcel_attributes_property_id unique (property_id)
);

create index idx_parcel_attributes_verification_status
  on public.parcel_attributes(verification_status);

create index idx_parcel_attributes_enriched_at
  on public.parcel_attributes(enriched_at desc nulls last);

create trigger trg_parcel_attributes_updated_at
  before update on public.parcel_attributes
  for each row execute function public.update_updated_at_column();

alter table public.parcel_attributes enable row level security;

create policy "parcel_attributes_authenticated_select"
  on public.parcel_attributes
  for select
  to authenticated
  using (true);

comment on table public.parcel_attributes is
  'P0 foundation: RLS mirrors public.properties (authenticated SELECT, USING(true)). County-entitlement gating will be applied to both parcel_attributes AND properties together in a follow-up PR once county_entitlements is captured in the repo. Do not tighten this table independently — keep parity with properties.';

create table public.enrichment_sources (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text,
  county_fips text,
  state text check (state is null or length(state) = 2),
  city text,
  source_name text,
  source_type text check (
    source_type is null
    or source_type in ('assessor','parcel','geocoder','census','flood','public_record')
  ),
  source_url text,
  access_method text check (
    access_method is null
    or access_method in ('manual','api','downloadable_file','portal','scrape_candidate')
  ),
  rate_limit_notes text,
  terms_notes text,
  requires_human_review boolean not null default false,
  status text not null default 'unverified' check (
    status in ('unverified','verified','blocked','deprecated')
  ),
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_enrichment_sources_natural_key
    unique (state, jurisdiction, source_name, source_type)
);

create index idx_enrichment_sources_status on public.enrichment_sources(status);
create index idx_enrichment_sources_state_jurisdiction
  on public.enrichment_sources(state, jurisdiction);

create trigger trg_enrichment_sources_updated_at
  before update on public.enrichment_sources
  for each row execute function public.update_updated_at_column();

alter table public.enrichment_sources enable row level security;

create policy "enrichment_sources_admin_all"
  on public.enrichment_sources
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table public.enrichment_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  job_type text not null check (
    job_type in ('parcel_lookup','geocode','owner_resolve','flood','census')
  ),
  status text not null default 'pending' check (
    status in ('pending','running','completed','failed','needs_human_review')
  ),
  priority smallint not null default 5,
  retry_count int not null default 0,
  attempt_count int not null default 0,
  source text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_attempted_at timestamptz
);

create index idx_enrichment_agent_jobs_dequeue
  on public.enrichment_agent_jobs(status, priority desc, created_at)
  where status in ('pending','needs_human_review');

create index idx_enrichment_agent_jobs_property_id
  on public.enrichment_agent_jobs(property_id);

create index idx_enrichment_agent_jobs_locked
  on public.enrichment_agent_jobs(locked_at)
  where locked_at is not null;

create trigger trg_enrichment_agent_jobs_updated_at
  before update on public.enrichment_agent_jobs
  for each row execute function public.update_updated_at_column();

alter table public.enrichment_agent_jobs enable row level security;

create policy "enrichment_agent_jobs_admin_all"
  on public.enrichment_agent_jobs
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));