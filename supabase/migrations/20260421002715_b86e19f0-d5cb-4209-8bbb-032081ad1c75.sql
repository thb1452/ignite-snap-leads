-- BYOA Phase 1.5: Add unique constraint on owners(property_id, source)
-- Ensures each skip-trace provider maintains exactly one record per property.
-- Re-runs of the same provider will UPSERT/overwrite instead of accumulating duplicates.

-- First, deduplicate any existing rows (keep newest per property_id+source)
delete from public.owners o
using public.owners o2
where o.property_id = o2.property_id
  and coalesce(o.source, '') = coalesce(o2.source, '')
  and o.created_at < o2.created_at;

-- Backfill null sources to 'unknown' so the unique constraint is enforceable
update public.owners set source = 'unknown' where source is null;

alter table public.owners
  alter column source set not null,
  alter column source set default 'unknown';

create unique index if not exists ux_owners_property_source
  on public.owners(property_id, source);