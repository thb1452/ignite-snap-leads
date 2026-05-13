create or replace function public.list_recent_violation_events_v1(
  p_state text,
  p_city text default null,
  p_county text default null,
  p_days_back int default 30,
  p_limit int default 25
)
returns table (
  property_id uuid,
  address text,
  city text,
  state text,
  zip text,
  violation_count_recent bigint,
  most_recent_violation_date date,
  snapscore integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as property_id,
    p.address,
    p.city,
    p.state,
    p.zip,
    count(v.id) filter (
      where v.opened_date >= (current_date - (p_days_back || ' days')::interval)
    ) as violation_count_recent,
    max(v.opened_date) filter (
      where v.opened_date >= (current_date - (p_days_back || ' days')::interval)
    ) as most_recent_violation_date,
    p.snap_score as snapscore
  from public.properties p
  join public.violations v on v.property_id = p.id
  where p.state = p_state
    and (p_city is null or p.city = p_city)
    and (p_county is null or p.county = p_county)
    and v.opened_date >= (current_date - (p_days_back || ' days')::interval)
    and p.snap_score is not null
  group by p.id, p.address, p.city, p.state, p.zip, p.snap_score
  having count(v.id) > 0
  order by p.snap_score desc nulls last, max(v.opened_date) desc
  limit p_limit;
$$;

revoke all on function public.list_recent_violation_events_v1(text, text, text, int, int) from public;
grant execute on function public.list_recent_violation_events_v1(text, text, text, int, int) to service_role;