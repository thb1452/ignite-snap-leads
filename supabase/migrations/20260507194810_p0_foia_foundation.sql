-- ============================================================================
-- P0 Phase 1: FOIA / Data Freshness Foundation
-- ============================================================================
-- Adds queue + source registry + response capture for FOIA agents
-- (Atlas/Hermes). Schema-only.
--
-- See docs/SNAP_IGNITE_MASTER_PLAN.md and PR #156 for context.
-- ============================================================================

-- ── foia_sources: portal/email/file source registry ────────────────────────

create table public.foia_sources (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text,
  state text check (state is null or length(state) = 2),
  county text,
  city text,
  source_type text not null check (
    source_type in ('email','portal','downloadable_file','search_portal','api','manual')
  ),
  portal_vendor text check (
    portal_vendor is null
    or portal_vendor in (
      'NextRequest','GovQA','JustFOIA','StreamlineGov',
      'Laserfiche','CivicPlus','Granicus','unknown'
    )
  ),
  source_url text,
  contact_email text,
  instructions text,
  requires_login boolean not null default false,
  requires_captcha boolean not null default false,
  automation_status text check (
    automation_status is null
    or automation_status in (
      'not_started','automatable','semi_automatable','manual_only','blocked'
    )
  ),
  commercial_use_allowed boolean not null default true,
  last_verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_foia_sources_natural_key
    unique (state, jurisdiction, source_type, portal_vendor)
);

create index idx_foia_sources_state_jurisdiction
  on public.foia_sources(state, jurisdiction);
create index idx_foia_sources_automation_status
  on public.foia_sources(automation_status);
create index idx_foia_sources_last_verified_at
  on public.foia_sources(last_verified_at desc nulls first);

create trigger trg_foia_sources_updated_at
  before update on public.foia_sources
  for each row execute function public.update_updated_at_column();

alter table public.foia_sources enable row level security;

create policy "foia_sources_admin_all"
  on public.foia_sources
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

comment on column public.foia_sources.commercial_use_allowed is
  'Default true. SC sources MUST be set to false (SC §30-2-50 prohibits commercial solicitation derived from public records).';

-- ── foia_request_jobs: outbound request queue ───────────────────────────────

create table public.foia_request_jobs (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text,
  county_fips text,
  state text check (state is null or length(state) = 2),
  city text,
  request_type text not null check (
    request_type in (
      'code_violations','tax_delinquency','water_shutoff',
      'liens','permits','other'
    )
  ),
  status text not null default 'pending' check (
    status in (
      'pending','drafted','sent','waiting_response','received',
      'failed','needs_human_review','completed'
    )
  ),
  priority smallint not null default 5,
  retry_count int not null default 0,
  attempt_count int not null default 0,
  portal_url text,
  contact_email text,
  request_template text,
  request_body text,
  credential_id uuid,
  external_request_id text,
  sent_at timestamptz,
  response_due_at timestamptz,
  last_follow_up_at timestamptz,
  idempotency_key text unique,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.foia_request_jobs.credential_id is
  'references credentials(id) — FK deferred until credentials migration is captured in repo.';

create index idx_foia_request_jobs_dequeue
  on public.foia_request_jobs(status, priority desc, created_at)
  where status in ('pending','drafted','waiting_response','needs_human_review');
create index idx_foia_request_jobs_state_jurisdiction
  on public.foia_request_jobs(state, jurisdiction);
create index idx_foia_request_jobs_response_due
  on public.foia_request_jobs(response_due_at)
  where status = 'waiting_response';
create index idx_foia_request_jobs_credential
  on public.foia_request_jobs(credential_id)
  where credential_id is not null;

create trigger trg_foia_request_jobs_updated_at
  before update on public.foia_request_jobs
  for each row execute function public.update_updated_at_column();

alter table public.foia_request_jobs enable row level security;

create policy "foia_request_jobs_admin_all"
  on public.foia_request_jobs
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ── foia_responses: inbound responses captured from email/portals ───────────

create table public.foia_responses (
  id uuid primary key default gen_random_uuid(),
  request_job_id uuid not null references public.foia_request_jobs(id) on delete cascade,
  source text,
  received_at timestamptz not null default now(),
  response_type text check (
    response_type is null
    or response_type in (
      'email','attachment','portal_download','link',
      'denial','clarification','invoice','other'
    )
  ),
  attachment_url text,
  attachment_urls text[] not null default '{}',
  raw_text text,
  parsed_status text,
  metadata jsonb not null default '{}'::jsonb,
  needs_human_review boolean not null default false,
  classified_by_agent text
);

create index idx_foia_responses_request_job_id
  on public.foia_responses(request_job_id);
create index idx_foia_responses_received_at
  on public.foia_responses(received_at desc);
create index idx_foia_responses_needs_review
  on public.foia_responses(received_at desc)
  where needs_human_review = true;

alter table public.foia_responses enable row level security;

create policy "foia_responses_admin_all"
  on public.foia_responses
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
