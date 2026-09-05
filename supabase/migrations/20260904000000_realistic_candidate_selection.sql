-- Realistic candidate selection preferences and diagnostics.
alter table public.job_preferences
  add column if not exists allow_us_remote boolean not null default true;

alter table public.recommendation_runs
  add column if not exists active_jobs_scanned_count integer not null default 0,
  add column if not exists location_excluded_count integer not null default 0,
  add column if not exists seniority_excluded_count integer not null default 0,
  add column if not exists experience_excluded_count integer not null default 0,
  add column if not exists recommended_count integer not null default 0;
