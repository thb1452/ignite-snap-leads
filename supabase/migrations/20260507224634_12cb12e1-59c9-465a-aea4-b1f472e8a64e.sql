do $$
declare
  v_inserted int;
begin
  raise notice
    'Seeding priority jurisdictions using (state, county) fallback — '
    'properties.county_fips not present in repo as of this migration.';

  with top_counties as (
    select state, county, count(*) as n
    from public.properties
    where county is not null
      and state is not null
      and not (state = 'IN' and county ilike 'marion%')
      and not (state = 'OH' and county ilike 'cuyahoga%')
      and not (state = 'AL' and county ilike 'jefferson%')
    group by state, county
    order by n desc
    limit 10
  )
  insert into public.enrichment_sources
    (state, jurisdiction, source_name, source_type, access_method, status, notes)
  select
    tc.state,
    tc.county,
    'Placeholder — TBD',
    'assessor',
    'manual',
    'unverified',
    'Seeded as P0 priority jurisdiction; verify portal + access method before agent attempts.'
  from top_counties tc
  on conflict on constraint uniq_enrichment_sources_natural_key do nothing;

  get diagnostics v_inserted = row_count;
  raise notice 'enrichment_sources: % placeholder row(s) inserted (skipped if pre-existing).', v_inserted;

  with top_counties as (
    select state, county, count(*) as n
    from public.properties
    where county is not null
      and state is not null
      and not (state = 'IN' and county ilike 'marion%')
      and not (state = 'OH' and county ilike 'cuyahoga%')
      and not (state = 'AL' and county ilike 'jefferson%')
    group by state, county
    order by n desc
    limit 10
  )
  insert into public.foia_sources
    (state, jurisdiction, county, source_type, portal_vendor,
     automation_status, commercial_use_allowed, notes)
  select
    tc.state,
    tc.county,
    tc.county,
    'manual',
    'unknown',
    'not_started',
    case when tc.state = 'SC' then false else true end,
    case
      when tc.state = 'SC' then 'SC §30-2-50: commercial use NOT allowed; do not solicit from this jurisdiction.'
      else 'Seeded as P0 priority jurisdiction; populate portal_vendor + source_url before agent attempts.'
    end
  from top_counties tc
  on conflict on constraint uniq_foia_sources_natural_key do nothing;

  get diagnostics v_inserted = row_count;
  raise notice 'foia_sources: % placeholder row(s) inserted (skipped if pre-existing).', v_inserted;
end
$$;