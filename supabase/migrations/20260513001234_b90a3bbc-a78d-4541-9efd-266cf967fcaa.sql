create table public.mcp_clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  api_key_hash text not null unique,
  api_key_prefix text not null,
  status text not null default 'active' check (status in ('active','revoked','suspended')),
  rate_limit_per_minute int not null default 60,
  notes text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index idx_mcp_clients_active on public.mcp_clients (status) where status = 'active';

create table public.mcp_tool_calls (
  id bigserial primary key,
  client_id uuid not null references public.mcp_clients(id) on delete restrict,
  tool_name text not null,
  operation text,
  caller_ip text,
  request_bytes int,
  response_status int not null,
  duration_ms int,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index idx_mcp_tool_calls_client_ts on public.mcp_tool_calls (client_id, created_at desc);
create index idx_mcp_tool_calls_ts on public.mcp_tool_calls (created_at desc);

alter table public.mcp_clients enable row level security;
alter table public.mcp_tool_calls enable row level security;

create policy "Admins read mcp_clients" on public.mcp_clients for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins read mcp_tool_calls" on public.mcp_tool_calls for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));