create type public.job_source_provider as enum ('greenhouse','lever','ashby');
create type public.ingestion_run_status as enum ('running','succeeded','failed');

alter table public.jobs
  add column compensation_interval text not null default 'unknown'
    check (compensation_interval in ('hourly','yearly','monthly','weekly','unknown')),
  add column is_active boolean not null default true,
  add column last_seen_at timestamptz,
  add column source_id uuid,
  alter column salary_currency drop not null,
  alter column salary_currency drop default;

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  provider public.job_source_provider not null,
  company_name text not null,
  board_identifier text not null check (board_identifier ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),
  enabled boolean not null default true,
  careers_url text,
  last_scanned_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, board_identifier)
);

alter table public.jobs add constraint jobs_source_id_fkey foreign key (source_id) references public.job_sources(id) on delete set null;
create index jobs_source_active_idx on public.jobs(source_id, is_active);
create unique index jobs_source_external_identity_idx on public.jobs(source_id, external_id);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.ingestion_run_status not null default 'running',
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  error_message text
);
create index ingestion_runs_source_started_idx on public.ingestion_runs(source_id, started_at desc);

create trigger job_sources_updated before update on public.job_sources for each row execute function public.set_updated_at();
alter table public.job_sources enable row level security;
alter table public.ingestion_runs enable row level security;
grant select on public.job_sources, public.ingestion_runs to authenticated;
create policy "Authenticated users read job sources" on public.job_sources for select to authenticated using (true);
create policy "Authenticated users read ingestion runs" on public.ingestion_runs for select to authenticated using (true);

-- Existing Phase 2 fixture amounts are hourly; real rows declare their own interval.
update public.jobs set compensation_interval = 'hourly' where source_id is null and external_id like 'mock-%';

insert into public.job_sources(provider,company_name,board_identifier,careers_url) values
 ('ashby','Linear','linear','https://jobs.ashbyhq.com/linear'),
 ('ashby','Notion','notion','https://jobs.ashbyhq.com/notion'),
 ('ashby','Ramp','ramp','https://jobs.ashbyhq.com/ramp'),
 ('ashby','Cursor','cursor','https://jobs.ashbyhq.com/cursor'),
 ('ashby','Retool','retool','https://jobs.ashbyhq.com/retool'),
 ('greenhouse','Cloudflare','cloudflare','https://boards.greenhouse.io/cloudflare'),
 ('greenhouse','Datadog','datadog','https://boards.greenhouse.io/datadog'),
 ('greenhouse','Anduril','andurilindustries','https://boards.greenhouse.io/andurilindustries'),
 ('greenhouse','Highspot','highspot','https://boards.greenhouse.io/highspot'),
 ('lever','Palantir','palantir','https://jobs.lever.co/palantir'),
 ('lever','Canva','canva','https://jobs.lever.co/canva'),
 ('lever','Zoox','zoox','https://jobs.lever.co/zoox')
on conflict(provider,board_identifier) do update set company_name=excluded.company_name,careers_url=excluded.careers_url;
