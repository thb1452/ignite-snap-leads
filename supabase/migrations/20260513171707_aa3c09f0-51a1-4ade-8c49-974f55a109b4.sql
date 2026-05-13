create extension if not exists pg_trgm;

create index if not exists idx_properties_address_trgm
  on public.properties using gin (address gin_trgm_ops);

analyze public.properties;