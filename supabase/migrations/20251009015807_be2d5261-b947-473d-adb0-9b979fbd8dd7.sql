-- Contact stats per property (phones/emails counts)
create or replace view v_property_contact_stats as
select
  pc.property_id,
  count(*) as contact_rows,
  count(pc.phone) filter (where pc.phone is not null) as phones_found,
  count(pc.email) filter (where pc.email is not null) as emails_found
from property_contacts pc
group by pc.property_id;

-- Outcomes table for tracking per-property results
create table if not exists skiptrace_outcomes (
  job_id uuid not null,
  property_id uuid not null,
  status text not null check (status in ('success','no_match','vendor_error','timeout')),
  created_at timestamptz default now(),
  primary key (job_id, property_id)
);

-- Index for job pages
create index if not exists idx_outcomes_job on skiptrace_outcomes(job_id, status);

-- RLS for outcomes
alter table skiptrace_outcomes enable row level security;

create policy "owner can read/write outcomes"
on skiptrace_outcomes
using ( exists (select 1 from skiptrace_jobs j where j.id = skiptrace_outcomes.job_id and j.user_id = auth.uid()) )
with check ( exists (select 1 from skiptrace_jobs j where j.id = skiptrace_outcomes.job_id and j.user_id = auth.uid()) );

-- Events table for audit log
create table if not exists events (
  ts timestamptz default now(),
  type text not null,
  user_id uuid,
  job_id uuid,
  payload jsonb,
  primary key (job_id, ts, type)
);

alter table events enable row level security;

create policy "owner can read job events"
on events
using ( user_id = auth.uid() );

-- Indexes to help performance
create index if not exists idx_properties_snap on properties(snap_score);
create index if not exists idx_jobs_user on skiptrace_jobs(user_id);
create index if not exists idx_events_job on events(job_id, ts);