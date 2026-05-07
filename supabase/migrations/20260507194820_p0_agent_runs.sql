-- ============================================================================
-- P0 Phase 1: Universal Agent Observability
-- ============================================================================
-- agent_runs is the polymorphic observability log shared by ALL agents
-- (enrichment + FOIA today, outreach in Phase 3). One row per agent
-- invocation.
--
-- The polymorphic pair (job_table + job_id) is gated by a CHECK constraint:
-- typos in agent code fail at INSERT time, not at query time. Future agent
-- types extend the CHECK via migration.
--
-- No FK on (job_table, job_id) — polymorphic columns can't have FKs in
-- standard Postgres. Service-role writers are responsible for valid IDs.
-- ============================================================================

create table public.agent_runs (
  id bigserial primary key,
  agent_name text not null,
  job_table text not null check (
    job_table in ('enrichment_jobs','foia_request_jobs')
  ),
  job_id uuid not null,
  status text not null check (
    status in ('started','completed','failed','needs_review')
  ),
  input_summary text,
  output_summary text,
  error_message text,
  duration_ms int,
  tokens_used int,
  cost_usd numeric(10,6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_agent_runs_agent_created
  on public.agent_runs(agent_name, created_at desc);
create index idx_agent_runs_status_created
  on public.agent_runs(created_at desc)
  where status in ('failed','needs_review');
create index idx_agent_runs_job
  on public.agent_runs(job_table, job_id);
create index idx_agent_runs_created_at
  on public.agent_runs(created_at desc);

alter table public.agent_runs enable row level security;

-- Admins read; only service_role writes (no INSERT/UPDATE/DELETE policies).
create policy "agent_runs_admin_select"
  on public.agent_runs
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
