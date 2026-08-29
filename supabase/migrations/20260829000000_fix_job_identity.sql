-- Phase 3 job identity is the configured board plus the provider's external ID.
-- Remove only the legacy Phase 2 identity. The IF EXISTS clauses make this safe
-- for databases where that constraint or its backing index was already removed.
alter table public.jobs
  drop constraint if exists jobs_source_external_id_key;

drop index if exists public.jobs_source_external_id_key;

-- Preserve (or restore, if needed) the Phase 3 ingestion upsert target.
create unique index if not exists jobs_source_external_identity_idx
  on public.jobs(source_id, external_id);
