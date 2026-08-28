create extension if not exists pgcrypto;

create type public.job_status as enum ('new','saved','rejected','applied');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, school text, degree_program text,
  graduation_year integer check (graduation_year between 1950 and 2100),
  location text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.job_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  desired_titles text[] not null default '{}', desired_locations text[] not null default '{}',
  remote_preference text not null default 'flexible' check (remote_preference in ('flexible','remote','hybrid','onsite')),
  employment_types text[] not null default '{}', minimum_salary integer check (minimum_salary >= 0),
  preferred_industries text[] not null default '{}', preferred_skills text[] not null default '{}',
  excluded_keywords text[] not null default '{}', sponsorship_required boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(), external_id text, source text not null,
  source_url text not null, application_url text, company text not null, title text not null,
  description text not null, location text not null, workplace_type text check (workplace_type in ('remote','hybrid','onsite')),
  employment_type text check (employment_type in ('internship','part-time','full-time','contract')),
  salary_min integer check (salary_min >= 0), salary_max integer check (salary_max >= salary_min),
  salary_currency text not null default 'USD', skills text[] not null default '{}', seniority text,
  sponsorship boolean, posted_at timestamptz, discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  raw_payload jsonb, content_hash text,
  unique(source, external_id)
);

create index jobs_discovered_at_idx on public.jobs(discovered_at desc);
create index jobs_content_hash_idx on public.jobs(content_hash) where content_hash is not null;

create table public.user_job_statuses (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status public.job_status not null default 'new', applied_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index user_job_statuses_status_idx on public.user_job_statuses(user_id,status);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger preferences_updated before update on public.job_preferences for each row execute function public.set_updated_at();
create trigger jobs_updated before update on public.jobs for each row execute function public.set_updated_at();
create trigger statuses_updated before update on public.user_job_statuses for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name) values(new.id,new.raw_user_meta_data ->> 'full_name');
  insert into public.job_preferences(user_id) values(new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.job_preferences enable row level security;
alter table public.jobs enable row level security;
alter table public.user_job_statuses enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users read own preferences" on public.job_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own preferences" on public.job_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own preferences" on public.job_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Authenticated users read jobs" on public.jobs for select to authenticated using (true);
create policy "Users read own statuses" on public.user_job_statuses for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own statuses" on public.user_job_statuses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own statuses" on public.user_job_statuses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own statuses" on public.user_job_statuses for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.jobs to authenticated;
grant select,insert,update on public.profiles,public.job_preferences,public.user_job_statuses to authenticated;
grant delete on public.user_job_statuses to authenticated;
