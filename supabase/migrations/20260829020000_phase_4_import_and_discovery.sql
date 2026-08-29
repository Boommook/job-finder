-- Make resume persistence atomic/idempotent and discovery pagination database-correct.
alter table public.candidate_experiences add column import_fingerprint text;
alter table public.candidate_projects add column import_fingerprint text;
alter table public.candidate_education add column import_fingerprint text;

create unique index candidate_experiences_import_fingerprint_idx on public.candidate_experiences(user_id,import_fingerprint) where import_fingerprint is not null;
create unique index candidate_projects_import_fingerprint_idx on public.candidate_projects(user_id,import_fingerprint) where import_fingerprint is not null;
create unique index candidate_education_import_fingerprint_idx on public.candidate_education(user_id,import_fingerprint) where import_fingerprint is not null;

create function public.persist_resume_import(p_resume_id uuid,p_extracted_text text,p_extraction jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid()); item jsonb;
begin
  if v_user is null or not exists(select 1 from public.candidate_resumes where id=p_resume_id and user_id=v_user) then raise exception 'Resume not found'; end if;

  for item in select value from jsonb_array_elements(coalesce(p_extraction->'skills','[]'::jsonb)) loop
    insert into public.candidate_skills(user_id,skill_name,proficiency,years_experience,source,confirmed)
    values(v_user,item->>'name',nullif(item->>'proficiency',''),(item->>'yearsExperience')::numeric,case when item->>'confidence'='explicit' then 'resume'::public.candidate_data_source else 'inferred'::public.candidate_data_source end,false)
    on conflict(user_id,skill_name) do update set proficiency=excluded.proficiency,years_experience=excluded.years_experience,source=excluded.source,confirmed=false
    where not public.candidate_skills.confirmed and public.candidate_skills.source<>'manual';
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_extraction->'experiences','[]'::jsonb)) loop
    update public.candidate_experiences set import_fingerprint=item->>'fingerprint' where id=(select id from public.candidate_experiences where user_id=v_user and import_fingerprint is null and source='resume' and lower(trim(organization))=lower(trim(item->>'organization')) and lower(trim(title))=lower(trim(item->>'title')) and start_date is not distinct from nullif(item->>'startDate','')::date order by confirmed desc,created_at limit 1);
    insert into public.candidate_experiences(user_id,organization,title,start_date,end_date,is_current,location,description,skills,source,confirmed,import_fingerprint)
    values(v_user,item->>'organization',item->>'title',nullif(item->>'startDate','')::date,nullif(item->>'endDate','')::date,coalesce((item->>'isCurrent')::boolean,false),nullif(item->>'location',''),nullif(item->>'description',''),coalesce(array(select jsonb_array_elements_text(item->'skills')),'{}'), 'resume',false,item->>'fingerprint')
    on conflict(user_id,import_fingerprint) where import_fingerprint is not null do update set organization=excluded.organization,title=excluded.title,start_date=excluded.start_date,end_date=excluded.end_date,is_current=excluded.is_current,location=excluded.location,description=excluded.description,skills=excluded.skills
    where not public.candidate_experiences.confirmed and public.candidate_experiences.source='resume';
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_extraction->'projects','[]'::jsonb)) loop
    update public.candidate_projects set import_fingerprint=item->>'fingerprint' where id=(select id from public.candidate_projects where user_id=v_user and import_fingerprint is null and source='resume' and lower(trim(name))=lower(trim(item->>'name')) and start_date is not distinct from nullif(item->>'startDate','')::date order by confirmed desc,created_at limit 1);
    insert into public.candidate_projects(user_id,name,description,technologies,project_url,repository_url,start_date,end_date,source,confirmed,import_fingerprint)
    values(v_user,item->>'name',nullif(item->>'description',''),coalesce(array(select jsonb_array_elements_text(item->'technologies')),'{}'),nullif(item->>'projectUrl',''),nullif(item->>'repositoryUrl',''),nullif(item->>'startDate','')::date,nullif(item->>'endDate','')::date,'resume',false,item->>'fingerprint')
    on conflict(user_id,import_fingerprint) where import_fingerprint is not null do update set name=excluded.name,description=excluded.description,technologies=excluded.technologies,project_url=excluded.project_url,repository_url=excluded.repository_url,start_date=excluded.start_date,end_date=excluded.end_date
    where not public.candidate_projects.confirmed and public.candidate_projects.source='resume';
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_extraction->'education','[]'::jsonb)) loop
    update public.candidate_education set import_fingerprint=item->>'fingerprint' where id=(select id from public.candidate_education where user_id=v_user and import_fingerprint is null and source='resume' and lower(trim(institution))=lower(trim(item->>'institution')) and degree is not distinct from nullif(item->>'degree','') and graduation_date is not distinct from nullif(item->>'graduationDate','')::date order by confirmed desc,created_at limit 1);
    insert into public.candidate_education(user_id,institution,degree,programs,graduation_date,coursework,gpa,source,confirmed,import_fingerprint)
    values(v_user,item->>'institution',nullif(item->>'degree',''),coalesce(array(select jsonb_array_elements_text(item->'programs')),'{}'),nullif(item->>'graduationDate','')::date,coalesce(array(select jsonb_array_elements_text(item->'coursework')),'{}'),(item->>'gpa')::numeric,'resume',false,item->>'fingerprint')
    on conflict(user_id,import_fingerprint) where import_fingerprint is not null do update set institution=excluded.institution,degree=excluded.degree,programs=excluded.programs,graduation_date=excluded.graduation_date,coursework=excluded.coursework,gpa=excluded.gpa
    where not public.candidate_education.confirmed and public.candidate_education.source='resume';
  end loop;

  update public.candidate_resumes set parsing_status='parsed',parsed_at=now(),parsing_error=null,extracted_text=p_extracted_text,extraction=p_extraction where id=p_resume_id and user_id=v_user;
end; $$;

grant execute on function public.persist_resume_import(uuid,text,jsonb) to authenticated;

create function public.get_eligible_jobs(p_search text default null,p_status text default 'all',p_company text default null,p_source text default null,p_arrangement text default 'all',p_sort text default 'discovered',p_offset integer default 0,p_limit integer default 50)
returns table(job jsonb,user_status text,eligible_total bigint) language sql stable security invoker set search_path='' as $$
with pref as (select coalesce(employment_types,'{}') employment_types,coalesce(remote_preference,'flexible') remote_preference,minimum_salary,coalesce(excluded_keywords,'{}') excluded_keywords,coalesce(sponsorship_required,false) sponsorship_required from public.job_preferences where user_id=(select auth.uid())),
p as (select coalesce((select employment_types from pref),'{}') employment_types,coalesce((select remote_preference from pref),'flexible') remote_preference,(select minimum_salary from pref) minimum_salary,coalesce((select excluded_keywords from pref),'{}') excluded_keywords,coalesce((select sponsorship_required from pref),false) sponsorship_required),
filtered as (select j.*,coalesce(s.status::text,'new') status from public.jobs j cross join p left join public.user_job_statuses s on s.job_id=j.id and s.user_id=(select auth.uid()) where coalesce(s.status::text,'new')<>'rejected' and (p_status='all' or coalesce(s.status::text,'new')=p_status) and (p_company is null or j.company=p_company) and (p_source is null or j.source=p_source) and (p_arrangement='all' or j.workplace_type=p_arrangement) and (p_search is null or trim(p_search)='' or concat_ws(' ',j.title,j.company,j.location,j.description) ilike '%'||p_search||'%') and (s.status in ('saved','applied') or (j.is_active and (cardinality(p.employment_types)=0 or j.employment_type is null or j.employment_type=any(p.employment_types)) and (p.remote_preference='flexible' or j.workplace_type is null or j.workplace_type=p.remote_preference) and (p.minimum_salary is null or j.salary_min is null or j.compensation_interval<>'yearly' or j.salary_min>=p.minimum_salary) and (not p.sponsorship_required or j.sponsorship is distinct from false) and not exists(select 1 from unnest(p.excluded_keywords) keyword where trim(keyword)<>'' and concat_ws(E'\n',j.title,j.company,j.description) ilike '%'||trim(keyword)||'%')))),
numbered as (select filtered.*,count(*) over() total from filtered order by case when p_sort='posted' then posted_at else discovered_at end desc nulls last,id asc offset greatest(p_offset,0) limit least(greatest(p_limit,1),50))
select to_jsonb(numbered)-'status'-'total',status,total from numbered;
$$;
grant execute on function public.get_eligible_jobs(text,text,text,text,text,text,integer,integer) to authenticated;

create function public.get_job_facets() returns jsonb language sql stable security invoker set search_path='' as $$
with pref as (select coalesce(employment_types,'{}') employment_types,coalesce(remote_preference,'flexible') remote_preference,minimum_salary,coalesce(excluded_keywords,'{}') excluded_keywords,coalesce(sponsorship_required,false) sponsorship_required from public.job_preferences where user_id=(select auth.uid())),p as (select coalesce((select employment_types from pref),'{}') employment_types,coalesce((select remote_preference from pref),'flexible') remote_preference,(select minimum_salary from pref) minimum_salary,coalesce((select excluded_keywords from pref),'{}') excluded_keywords,coalesce((select sponsorship_required from pref),false) sponsorship_required),eligible as (select j.company,j.source from public.jobs j cross join p left join public.user_job_statuses s on s.job_id=j.id and s.user_id=(select auth.uid()) where coalesce(s.status::text,'new')<>'rejected' and (s.status in ('saved','applied') or (j.is_active and (cardinality(p.employment_types)=0 or j.employment_type is null or j.employment_type=any(p.employment_types)) and (p.remote_preference='flexible' or j.workplace_type is null or j.workplace_type=p.remote_preference) and (p.minimum_salary is null or j.salary_min is null or j.compensation_interval<>'yearly' or j.salary_min>=p.minimum_salary) and (not p.sponsorship_required or j.sponsorship is distinct from false) and not exists(select 1 from unnest(p.excluded_keywords) keyword where trim(keyword)<>'' and concat_ws(E'\n',j.title,j.company,j.description) ilike '%'||trim(keyword)||'%')))) select jsonb_build_object('companies',(select jsonb_agg(company order by company) from (select distinct company from eligible) x),'sources',(select jsonb_agg(source order by source) from (select distinct source from eligible) x));
$$;
grant execute on function public.get_job_facets() to authenticated;
