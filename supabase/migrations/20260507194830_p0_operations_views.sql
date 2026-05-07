-- ============================================================================
-- P0 Phase 1: Mission Control / Admin Operations Views
-- ============================================================================
-- Read-only summary views over enrichment + FOIA + agent_runs. Each view
-- uses security_invoker = true so caller's RLS applies — non-admins see
-- nothing because the underlying tables are admin-only.
-- ============================================================================

-- ── v_enrichment_queue_health: counts by status + oldest pending ────────────
create or replace view public.v_enrichment_queue_health
with (security_invoker = true) as
select
  status,
  count(*)::int as job_count,
  min(created_at) filter (where status = 'pending') as oldest_pending_at,
  extract(
    epoch from (now() - min(created_at) filter (where status = 'pending'))
  )::int as oldest_pending_age_seconds
from public.enrichment_jobs
group by status;

-- ── v_foia_queue_health: same shape ─────────────────────────────────────────
create or replace view public.v_foia_queue_health
with (security_invoker = true) as
select
  status,
  count(*)::int as job_count,
  min(created_at) filter (where status in ('pending','drafted')) as oldest_pending_at,
  extract(
    epoch from (
      now() - min(created_at) filter (where status in ('pending','drafted'))
    )
  )::int as oldest_pending_age_seconds
from public.foia_request_jobs
group by status;

-- ── v_failed_jobs_last_24h: union across both queues ────────────────────────
create or replace view public.v_failed_jobs_last_24h
with (security_invoker = true) as
select
  'enrichment'::text as domain,
  id::text as job_id,
  job_type::text as job_subtype,
  status,
  retry_count,
  error_message,
  created_at,
  updated_at
from public.enrichment_jobs
where status = 'failed' and updated_at > now() - interval '24 hours'
union all
select
  'foia'::text as domain,
  id::text,
  request_type::text,
  status,
  retry_count,
  error_message,
  created_at,
  updated_at
from public.foia_request_jobs
where status = 'failed' and updated_at > now() - interval '24 hours';

-- ── v_needs_human_review_queue: union, oldest first ─────────────────────────
create or replace view public.v_needs_human_review_queue
with (security_invoker = true) as
select * from (
  select
    'enrichment'::text as domain,
    id::text as job_id,
    job_type::text as job_subtype,
    null::text as jurisdiction,
    null::text as state,
    error_message,
    created_at,
    updated_at
  from public.enrichment_jobs
  where status = 'needs_human_review'
  union all
  select
    'foia'::text as domain,
    id::text,
    request_type::text,
    jurisdiction,
    state,
    error_message,
    created_at,
    updated_at
  from public.foia_request_jobs
  where status = 'needs_human_review'
) sub
order by created_at asc;

-- ── v_stale_jurisdictions: foia_sources with last response >90 days old ─────
create or replace view public.v_stale_jurisdictions
with (security_invoker = true) as
with last_response_per_jurisdiction as (
  select
    j.state,
    j.jurisdiction,
    max(r.received_at) as last_response_at
  from public.foia_responses r
  join public.foia_request_jobs j on j.id = r.request_job_id
  group by j.state, j.jurisdiction
)
select
  s.id as source_id,
  s.state,
  s.jurisdiction,
  s.county,
  s.city,
  s.source_type,
  s.portal_vendor,
  l.last_response_at,
  case
    when l.last_response_at is null then null
    else (extract(epoch from (now() - l.last_response_at)) / 86400.0)::numeric(10,2)
  end as days_since_last_response
from public.foia_sources s
left join last_response_per_jurisdiction l
  on l.state = s.state and l.jurisdiction = s.jurisdiction
where l.last_response_at is null
   or l.last_response_at < now() - interval '90 days';

-- ── v_enrichment_coverage_by_county: coverage % by (state, county) ──────────
-- Note: (state, county_fips) was specified in the brief but properties has no
-- county_fips column. Using (state, county) text as the grouping key.
create or replace view public.v_enrichment_coverage_by_county
with (security_invoker = true) as
select
  p.state,
  p.county,
  count(*)::int as total_properties,
  count(pa.id)::int as enriched_properties,
  round(100.0 * count(pa.id)::numeric / nullif(count(*), 0), 2) as coverage_pct
from public.properties p
left join public.parcel_attributes pa on pa.property_id = p.id
where p.county is not null
group by p.state, p.county;

-- ── v_recent_agent_runs: last 100 with timing + cost ────────────────────────
create or replace view public.v_recent_agent_runs
with (security_invoker = true) as
select
  id,
  agent_name,
  job_table,
  job_id,
  status,
  input_summary,
  output_summary,
  error_message,
  duration_ms,
  tokens_used,
  cost_usd,
  created_at
from public.agent_runs
order by created_at desc
limit 100;

-- ── v_jurisdictions_needing_verification: unverified sources ────────────────
create or replace view public.v_jurisdictions_needing_verification
with (security_invoker = true) as
select * from (
  select
    'enrichment'::text as registry,
    id,
    state,
    jurisdiction,
    city,
    source_name,
    source_type::text,
    status,
    last_checked_at,
    notes
  from public.enrichment_sources
  where status = 'unverified' or last_checked_at is null
  union all
  select
    'foia'::text as registry,
    id,
    state,
    jurisdiction,
    city,
    null::text as source_name,
    source_type::text,
    case when last_verified_at is null then 'unverified' else 'verified' end as status,
    last_verified_at as last_checked_at,
    notes
  from public.foia_sources
  where last_verified_at is null
) sub
order by last_checked_at asc nulls first;

-- Grant SELECT to authenticated; RLS on inner tables gates rows for non-admins.
grant select on public.v_enrichment_queue_health to authenticated;
grant select on public.v_foia_queue_health to authenticated;
grant select on public.v_failed_jobs_last_24h to authenticated;
grant select on public.v_needs_human_review_queue to authenticated;
grant select on public.v_stale_jurisdictions to authenticated;
grant select on public.v_enrichment_coverage_by_county to authenticated;
grant select on public.v_recent_agent_runs to authenticated;
grant select on public.v_jurisdictions_needing_verification to authenticated;
