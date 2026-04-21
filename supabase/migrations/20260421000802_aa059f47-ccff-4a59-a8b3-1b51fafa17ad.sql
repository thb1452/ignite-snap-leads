-- ============================================================
-- BYOA Phase 1: Owners + Integrations + Vault Encryption + Cron
-- ============================================================

-- ── 1. OWNERS TABLE ─────────────────────────────────────────
create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  phones jsonb default '[]'::jsonb,
  emails jsonb default '[]'::jsonb,
  mailing_address text,
  confidence text,
  source text,
  raw_payload jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_owners_property_id on public.owners(property_id);
create index if not exists idx_owners_org_created on public.owners(org_id, created_at desc);

alter table public.owners enable row level security;

create policy "owners_org_select" on public.owners for select
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "owners_org_insert" on public.owners for insert
  with check (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "owners_org_update" on public.owners for update
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "owners_org_delete" on public.owners for delete
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));

create trigger trg_owners_updated_at
  before update on public.owners
  for each row execute function public.update_updated_at_column();

-- ── 2. USER_INTEGRATIONS ────────────────────────────────────
create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  service_name text not null check (service_name in (
    'twilio','telnyx','batchdata','tracerfy','skipgenie',
    'gohighlevel','hubspot','podio','resimpli','zapier_webhook'
  )),
  vault_secret_id uuid not null,
  display_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in (
    'active','invalid','expired','rate_limited','disabled'
  )),
  last_validated_at timestamptz,
  validation_failure_count int not null default 0,
  daily_spend_cap_usd numeric(8,2),
  daily_spend_used_usd numeric(8,2) not null default 0,
  daily_spend_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, service_name)
);

alter table public.user_integrations enable row level security;

create policy "user_integrations_org_select" on public.user_integrations for select
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "user_integrations_org_insert" on public.user_integrations for insert
  with check (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "user_integrations_org_update" on public.user_integrations for update
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "user_integrations_org_delete" on public.user_integrations for delete
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));

create trigger trg_user_integrations_updated_at
  before update on public.user_integrations
  for each row execute function public.update_updated_at_column();

-- ── 3. INTEGRATION_ACTION_LOG ───────────────────────────────
create table if not exists public.integration_action_log (
  id bigserial primary key,
  integration_id uuid references public.user_integrations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  request_metadata jsonb,
  response_status int,
  success boolean not null,
  error_code text,
  error_message text,
  cost_estimate_usd numeric(8,4),
  created_at timestamptz not null default now()
);

create index if not exists idx_iaction_log_integration_created
  on public.integration_action_log(integration_id, created_at desc);
create index if not exists idx_iaction_log_user_created
  on public.integration_action_log(user_id, created_at desc);

alter table public.integration_action_log enable row level security;

create policy "iaction_log_org_select" on public.integration_action_log for select
  using (
    integration_id in (
      select id from public.user_integrations
      where org_id in (select org_id from public.profiles where user_id = auth.uid())
    )
  );

-- ── 4. SUPPRESSION_LIST ─────────────────────────────────────
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  phone_number text,
  email text,
  reason text not null,
  added_by uuid references auth.users(id) on delete set null,
  org_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_suppression_phone on public.suppression_list(phone_number);
create index if not exists idx_suppression_email on public.suppression_list(email);

alter table public.suppression_list enable row level security;

create policy "suppression_org_select" on public.suppression_list for select
  using (
    org_id is null
    or org_id in (select org_id from public.profiles where user_id = auth.uid())
  );
create policy "suppression_org_insert" on public.suppression_list for insert
  with check (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "suppression_org_update" on public.suppression_list for update
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));
create policy "suppression_org_delete" on public.suppression_list for delete
  using (org_id in (select org_id from public.profiles where user_id = auth.uid()));

-- ── 5. USER_ACTIVATION_EVENTS ───────────────────────────────
create table if not exists public.user_activation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_activation_user_event
  on public.user_activation_events(user_id, event_type, occurred_at desc);

alter table public.user_activation_events enable row level security;

create policy "activation_own_select" on public.user_activation_events for select
  using (user_id = auth.uid());
create policy "activation_own_insert" on public.user_activation_events for insert
  with check (user_id = auth.uid());

-- ── 6. VAULT HELPER (service_role only) ─────────────────────
create or replace function public.get_integration_secret(p_integration_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_plain text;
begin
  select vault_secret_id into v_secret_id
  from public.user_integrations
  where id = p_integration_id;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_plain
  from vault.decrypted_secrets
  where id = v_secret_id;

  return v_plain;
end;
$$;

revoke all on function public.get_integration_secret(uuid) from public;
revoke all on function public.get_integration_secret(uuid) from authenticated;
revoke all on function public.get_integration_secret(uuid) from anon;
grant execute on function public.get_integration_secret(uuid) to service_role;

-- ── 7. CRON: daily revalidation at 3am UTC ──────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('revalidate-integrations')
    where exists (select 1 from cron.job where jobname = 'revalidate-integrations');

    perform cron.schedule(
      'revalidate-integrations',
      '0 3 * * *',
      $cron$
        select net.http_post(
          url := 'https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/integration-revalidate',
          headers := jsonb_build_object('Content-Type','application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000
        );
      $cron$
    );
  end if;
end $$;