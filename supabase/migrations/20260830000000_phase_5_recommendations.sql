-- Phase 5: per-user discovery inbox and bounded recommendation-run diagnostics.
create table public.user_job_discovery (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  surfaced_at timestamptz,
  viewed_at timestamptz,
  evaluation_requested_at timestamptz,
  automatically_evaluated_at timestamptz,
  dismissed_at timestamptz,
  prefilter_score smallint check(prefilter_score between 0 and 100),
  prefilter_reasons text[] not null default '{}',
  recommendation_state text not null default 'new' check(recommendation_state in ('new','candidate','evaluated','recommended','excluded','failed','dismissed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,job_id)
);
create index user_job_discovery_inbox_idx on public.user_job_discovery(user_id,recommendation_state,viewed_at,first_seen_at desc);
alter table public.user_job_discovery enable row level security;
create policy "Users read own discovery" on public.user_job_discovery for select using ((select auth.uid())=user_id);
create policy "Users insert own discovery" on public.user_job_discovery for insert with check ((select auth.uid())=user_id);
create policy "Users update own discovery" on public.user_job_discovery for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.user_job_discovery to authenticated;

create table public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check(status in ('running','succeeded','partial','failed')),
  considered_count integer not null default 0,
  hard_excluded_count integer not null default 0,
  below_threshold_count integer not null default 0,
  selected_count integer not null default 0,
  evaluated_count integer not null default 0,
  cache_reused_count integer not null default 0,
  failure_count integer not null default 0,
  error_message text
);
create index recommendation_runs_user_started_idx on public.recommendation_runs(user_id,started_at desc);
alter table public.recommendation_runs enable row level security;
create policy "Users read own recommendation runs" on public.recommendation_runs for select using ((select auth.uid())=user_id);
create policy "Users insert own recommendation runs" on public.recommendation_runs for insert with check ((select auth.uid())=user_id);
create policy "Users update own recommendation runs" on public.recommendation_runs for update using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.recommendation_runs to authenticated;
