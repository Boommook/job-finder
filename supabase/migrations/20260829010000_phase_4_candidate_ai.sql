-- Phase 4: private candidate data, private resumes, and cached AI evaluations.
create type public.candidate_data_source as enum ('manual','resume','inferred');
create type public.resume_parsing_status as enum ('uploaded','parsing','parsed','failed');

create table public.candidate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  professional_summary text,
  years_experience numeric(5,2) check (years_experience >= 0),
  work_authorization text,
  requires_sponsorship boolean,
  preferred_role_level text,
  github_url text,
  linkedin_url text,
  portfolio_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  skill_name text not null check (length(trim(skill_name)) > 0), proficiency text,
  years_experience numeric(5,2) check (years_experience >= 0), source public.candidate_data_source not null default 'manual',
  confirmed boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, skill_name)
);
create table public.candidate_experiences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  organization text not null, title text not null, start_date date, end_date date, is_current boolean not null default false,
  location text, description text, skills text[] not null default '{}', source public.candidate_data_source not null default 'manual',
  confirmed boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.candidate_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text, technologies text[] not null default '{}', project_url text, repository_url text,
  start_date date, end_date date, source public.candidate_data_source not null default 'manual', confirmed boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.candidate_education (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  institution text not null, degree text, programs text[] not null default '{}', graduation_date date,
  coursework text[] not null default '{}', gpa numeric(4,2) check (gpa between 0 and 5),
  source public.candidate_data_source not null default 'manual', confirmed boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.candidate_resumes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique, original_filename text not null, mime_type text not null,
  uploaded_at timestamptz not null default now(), parsed_at timestamptz, parsing_status public.resume_parsing_status not null default 'uploaded',
  parsing_error text, content_hash text not null, extracted_text text, extraction jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index candidate_resumes_user_uploaded_idx on public.candidate_resumes(user_id, uploaded_at desc);

create table public.job_evaluations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  overall_score integer not null check (overall_score between 0 and 100), skill_score integer not null check (skill_score between 0 and 100),
  experience_score integer not null check (experience_score between 0 and 100), education_score integer not null check (education_score between 0 and 100),
  interest_score integer not null check (interest_score between 0 and 100), location_score integer not null check (location_score between 0 and 100),
  compensation_score integer check (compensation_score between 0 and 100),
  recommendation text not null check (recommendation in ('apply','consider','skip')),
  verdict text not null check (verdict in ('excellent','strong','possible','weak')), summary text not null,
  matching_skills text[] not null default '{}', missing_skills text[] not null default '{}', strengths text[] not null default '{}',
  concerns text[] not null default '{}', requirement_gaps text[] not null default '{}', model text not null, prompt_version text not null,
  candidate_profile_hash text not null, job_content_hash text not null, input_tokens integer, output_tokens integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, job_id, prompt_version, candidate_profile_hash, job_content_hash)
);
create index job_evaluations_user_score_idx on public.job_evaluations(user_id, overall_score desc);

create trigger candidate_profiles_updated before update on public.candidate_profiles for each row execute function public.set_updated_at();
create trigger candidate_skills_updated before update on public.candidate_skills for each row execute function public.set_updated_at();
create trigger candidate_experiences_updated before update on public.candidate_experiences for each row execute function public.set_updated_at();
create trigger candidate_projects_updated before update on public.candidate_projects for each row execute function public.set_updated_at();
create trigger candidate_education_updated before update on public.candidate_education for each row execute function public.set_updated_at();
create trigger candidate_resumes_updated before update on public.candidate_resumes for each row execute function public.set_updated_at();
create trigger job_evaluations_updated before update on public.job_evaluations for each row execute function public.set_updated_at();

alter table public.candidate_profiles enable row level security;
alter table public.candidate_skills enable row level security;
alter table public.candidate_experiences enable row level security;
alter table public.candidate_projects enable row level security;
alter table public.candidate_education enable row level security;
alter table public.candidate_resumes enable row level security;
alter table public.job_evaluations enable row level security;

do $$ declare t text; begin foreach t in array array['candidate_profiles','candidate_skills','candidate_experiences','candidate_projects','candidate_education','candidate_resumes','job_evaluations'] loop
  execute format('create policy "Users read own %1$s" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
  execute format('create policy "Users insert own %1$s" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
  execute format('create policy "Users update own %1$s" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  execute format('create policy "Users delete own %1$s" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
end loop; end $$;
grant select,insert,update,delete on public.candidate_profiles,public.candidate_skills,public.candidate_experiences,public.candidate_projects,public.candidate_education,public.candidate_resumes,public.job_evaluations to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('resumes','resumes',false,10485760,array['application/pdf']) on conflict(id) do update set public=false;
create policy "Users upload own resumes" on storage.objects for insert to authenticated
  with check (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users read own resumes" on storage.objects for select to authenticated
  using (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users update own resumes" on storage.objects for update to authenticated
  using (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users delete own resumes" on storage.objects for delete to authenticated
  using (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Evaluation invalidation hash includes posting content, unlike the Phase 3 identity hash.
create function public.set_job_evaluation_content_hash() returns trigger language plpgsql set search_path = '' as $$
begin
  new.content_hash = encode(extensions.digest(concat_ws(E'\x1f',lower(trim(new.company)),lower(trim(new.title)),lower(trim(new.location)),lower(trim(new.description)),coalesce(new.skills::text,''),coalesce(new.seniority,''),coalesce(new.sponsorship::text,''),coalesce(new.salary_min::text,''),coalesce(new.salary_max::text,''),coalesce(new.compensation_interval,'')),'sha256'),'hex');
  return new;
end; $$;
create trigger jobs_evaluation_content_hash before insert or update of company,title,location,description,skills,seniority,sponsorship,salary_min,salary_max,compensation_interval
on public.jobs for each row execute function public.set_job_evaluation_content_hash();
update public.jobs set description=description;
