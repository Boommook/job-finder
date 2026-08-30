-- Preserve resume date precision and make atomic resume imports tolerant of malformed optional data.
alter table public.candidate_experiences
  add column start_year smallint, add column start_month smallint, add column start_day smallint, add column start_raw text,
  add column end_year smallint, add column end_month smallint, add column end_day smallint, add column end_raw text;
alter table public.candidate_projects
  add column start_year smallint, add column start_month smallint, add column start_day smallint, add column start_raw text,
  add column end_year smallint, add column end_month smallint, add column end_day smallint, add column end_raw text;
alter table public.candidate_education
  add column graduation_year smallint, add column graduation_month smallint, add column graduation_day smallint, add column graduation_raw text;

alter table public.candidate_experiences add constraint candidayte_experiences_partial_dates_check check
  ((start_year is null and start_month is null and start_day is null or start_year between 1900 and 2200 and (start_month is null or start_month between 1 and 12) and (start_day is null or start_day between 1 and 31) and (start_day is null or start_month is not null)) and
   (end_year is null and end_month is null and end_day is null or end_year between 1900 and 2200 and (end_month is null or end_month between 1 and 12) and (end_day is null or end_day between 1 and 31) and (end_day is null or end_month is not null)));
alter table public.candidate_projects add constraint candidate_projects_partial_dates_check check
  ((start_year is null and start_month is null and start_day is null or start_year between 1900 and 2200 and (start_month is null or start_month between 1 and 12) and (start_day is null or start_day between 1 and 31) and (start_day is null or start_month is not null)) and
   (end_year is null and end_month is null and end_day is null or end_year between 1900 and 2200 and (end_month is null or end_month between 1 and 12) and (end_day is null or end_day between 1 and 31) and (end_day is null or end_month is not null)));
alter table public.candidate_education add constraint candidate_education_partial_dates_check check
  (graduation_year is null and graduation_month is null and graduation_day is null or graduation_year between 1900 and 2200 and (graduation_month is null or graduation_month between 1 and 12) and (graduation_day is null or graduation_day between 1 and 31) and (graduation_day is null or graduation_month is not null));

update public.candidate_experiences set start_year=extract(year from start_date),start_month=extract(month from start_date),start_day=extract(day from start_date),start_raw=to_char(start_date,'YYYY-MM-DD') where start_date is not null;
update public.candidate_experiences set end_year=extract(year from end_date),end_month=extract(month from end_date),end_day=extract(day from end_date),end_raw=to_char(end_date,'YYYY-MM-DD') where end_date is not null;
update public.candidate_projects set start_year=extract(year from start_date),start_month=extract(month from start_date),start_day=extract(day from start_date),start_raw=to_char(start_date,'YYYY-MM-DD') where start_date is not null;
update public.candidate_projects set end_year=extract(year from end_date),end_month=extract(month from end_date),end_day=extract(day from end_date),end_raw=to_char(end_date,'YYYY-MM-DD') where end_date is not null;
update public.candidate_education set graduation_year=extract(year from graduation_date),graduation_month=extract(month from graduation_date),graduation_day=extract(day from graduation_date),graduation_raw=to_char(graduation_date,'YYYY-MM-DD') where graduation_date is not null;

create function public.normalize_resume_date(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare precision text; y integer; m integer; d integer; raw text; exact date;
begin
  if value is null or jsonb_typeof(value)<>'object' then
    return jsonb_build_object('year',null,'month',null,'day',null,'raw',case when jsonb_typeof(value)='string' then value#>>'{}' else null end,'date',null);
  end if;
  precision:=value->>'precision'; raw:=nullif(btrim(value->>'raw'),'');
  if precision in ('present','unknown') then return jsonb_build_object('year',null,'month',null,'day',null,'raw',raw,'date',null); end if;
  if coalesce(value->>'year','')!~'^\d{4}$' then return jsonb_build_object('year',null,'month',null,'day',null,'raw',raw,'date',null); end if;
  y:=(value->>'year')::integer; if y not between 1900 and 2200 then raise invalid_parameter_value; end if;
  if precision='year' then return jsonb_build_object('year',y,'month',null,'day',null,'raw',raw,'date',null); end if;
  if coalesce(value->>'month','')!~'^\d{1,2}$' then raise invalid_parameter_value; end if; m:=(value->>'month')::integer;
  if m not between 1 and 12 then raise invalid_parameter_value; end if;
  if precision='month' then return jsonb_build_object('year',y,'month',m,'day',null,'raw',raw,'date',null); end if;
  if precision<>'day' or coalesce(value->>'day','')!~'^\d{1,2}$' then raise invalid_parameter_value; end if; d:=(value->>'day')::integer;
  exact:=pg_catalog.make_date(y,m,d);
  return jsonb_build_object('year',y,'month',m,'day',d,'raw',raw,'date',exact);
exception when others then return jsonb_build_object('year',null,'month',null,'day',null,'raw',raw,'date',null);
end; $$;

create or replace function public.persist_resume_import(p_resume_id uuid,p_extracted_text text,p_extraction jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid()); item jsonb; sd jsonb; ed jsonb; gd jsonb; years numeric; gpa_value numeric;
begin
  if v_user is null or not exists(select 1 from public.candidate_resumes where id=p_resume_id and user_id=v_user) then raise exception 'Resume not found'; end if;

  for item in select value from jsonb_array_elements(case when jsonb_typeof(p_extraction->'skills')='array' then p_extraction->'skills' else '[]'::jsonb end) loop
    years:=case when coalesce(item->>'yearsExperience','')~'^\d+(\.\d+)?$' then (item->>'yearsExperience')::numeric else null end;
    if nullif(btrim(item->>'name'),'') is not null then
      insert into public.candidate_skills(user_id,skill_name,proficiency,years_experience,source,confirmed)
      values(v_user,item->>'name',nullif(item->>'proficiency',''),years,case when item->>'confidence'='explicit' then 'resume'::public.candidate_data_source else 'inferred'::public.candidate_data_source end,false)
      on conflict(user_id,skill_name) do update set proficiency=excluded.proficiency,years_experience=excluded.years_experience,source=excluded.source,confirmed=false
      where not public.candidate_skills.confirmed and public.candidate_skills.source<>'manual';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(case when jsonb_typeof(p_extraction->'experiences')='array' then p_extraction->'experiences' else '[]'::jsonb end) loop
    sd:=public.normalize_resume_date(item->'startDate'); ed:=public.normalize_resume_date(item->'endDate');
    if nullif(btrim(item->>'organization'),'') is not null and nullif(btrim(item->>'title'),'') is not null then
      update public.candidate_experiences set import_fingerprint=item->>'fingerprint' where id=(select id from public.candidate_experiences where user_id=v_user and import_fingerprint is null and source='resume' and lower(trim(organization))=lower(trim(item->>'organization')) and lower(trim(title))=lower(trim(item->>'title')) and start_year is not distinct from (sd->>'year')::smallint and start_month is not distinct from (sd->>'month')::smallint and start_day is not distinct from (sd->>'day')::smallint order by confirmed desc,created_at limit 1);
      insert into public.candidate_experiences(user_id,organization,title,start_date,start_year,start_month,start_day,start_raw,end_date,end_year,end_month,end_day,end_raw,is_current,location,description,skills,source,confirmed,import_fingerprint)
      values(v_user,item->>'organization',item->>'title',(sd->>'date')::date,(sd->>'year')::smallint,(sd->>'month')::smallint,(sd->>'day')::smallint,sd->>'raw',(ed->>'date')::date,(ed->>'year')::smallint,(ed->>'month')::smallint,(ed->>'day')::smallint,ed->>'raw',coalesce(case when (item->>'isCurrent')~'^(true|false)$' then (item->>'isCurrent')::boolean end,false) or item->'endDate'->>'precision'='present',nullif(item->>'location',''),nullif(item->>'description',''),coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(item->'skills')='array' then item->'skills' else '[]'::jsonb end)),'{}'),'resume',false,item->>'fingerprint')
      on conflict(user_id,import_fingerprint) where import_fingerprint is not null do update set organization=excluded.organization,title=excluded.title,start_date=excluded.start_date,start_year=excluded.start_year,start_month=excluded.start_month,start_day=excluded.start_day,start_raw=excluded.start_raw,end_date=excluded.end_date,end_year=excluded.end_year,end_month=excluded.end_month,end_day=excluded.end_day,end_raw=excluded.end_raw,is_current=excluded.is_current,location=excluded.location,description=excluded.description,skills=excluded.skills
      where not public.candidate_experiences.confirmed and public.candidate_experiences.source='resume';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(case when jsonb_typeof(p_extraction->'projects')='array' then p_extraction->'projects' else '[]'::jsonb end) loop
    sd:=public.normalize_resume_date(item->'startDate'); ed:=public.normalize_resume_date(item->'endDate');
    if nullif(btrim(item->>'name'),'') is not null then
      update public.candidate_projects set import_fingerprint=item->>'fingerprint' where id=(select id from public.candidate_projects where user_id=v_user and import_fingerprint is null and source='resume' and lower(trim(name))=lower(trim(item->>'name')) and start_year is not distinct from (sd->>'year')::smallint and start_month is not distinct from (sd->>'month')::smallint and start_day is not distinct from (sd->>'day')::smallint order by confirmed desc,created_at limit 1);
      insert into public.candidate_projects(user_id,name,description,technologies,project_url,repository_url,start_date,start_year,start_month,start_day,start_raw,end_date,end_year,end_month,end_day,end_raw,source,confirmed,import_fingerprint)
      values(v_user,item->>'name',nullif(item->>'description',''),coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(item->'technologies')='array' then item->'technologies' else '[]'::jsonb end)),'{}'),nullif(item->>'projectUrl',''),nullif(item->>'repositoryUrl',''),(sd->>'date')::date,(sd->>'year')::smallint,(sd->>'month')::smallint,(sd->>'day')::smallint,sd->>'raw',(ed->>'date')::date,(ed->>'year')::smallint,(ed->>'month')::smallint,(ed->>'day')::smallint,ed->>'raw','resume',false,item->>'fingerprint')
      on conflict(user_id,import_fingerprint) where import_fingerprint is not null do update set name=excluded.name,description=excluded.description,technologies=excluded.technologies,project_url=excluded.project_url,repository_url=excluded.repository_url,start_date=excluded.start_date,start_year=excluded.start_year,start_month=excluded.start_month,start_day=excluded.start_day,start_raw=excluded.start_raw,end_date=excluded.end_date,end_year=excluded.end_year,end_month=excluded.end_month,end_day=excluded.end_day,end_raw=excluded.end_raw
      where not public.candidate_projects.confirmed and public.candidate_projects.source='resume';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(case when jsonb_typeof(p_extraction->'education')='array' then p_extraction->'education' else '[]'::jsonb end) loop
    gd:=public.normalize_resume_date(item->'graduationDate'); gpa_value:=case when coalesce(item->>'gpa','')~'^\d+(\.\d+)?$' and (item->>'gpa')::numeric between 0 and 5 then (item->>'gpa')::numeric else null end;
    if nullif(btrim(item->>'institution'),'') is not null then
      update public.candidate_education set import_fingerprint=item->>'fingerprint' where id=(select id from public.candidate_education where user_id=v_user and import_fingerprint is null and source='resume' and lower(trim(institution))=lower(trim(item->>'institution')) and degree is not distinct from nullif(item->>'degree','') and graduation_year is not distinct from (gd->>'year')::smallint and graduation_month is not distinct from (gd->>'month')::smallint and graduation_day is not distinct from (gd->>'day')::smallint order by confirmed desc,created_at limit 1);
      insert into public.candidate_education(user_id,institution,degree,programs,graduation_date,graduation_year,graduation_month,graduation_day,graduation_raw,coursework,gpa,source,confirmed,import_fingerprint)
      values(v_user,item->>'institution',nullif(item->>'degree',''),coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(item->'programs')='array' then item->'programs' else '[]'::jsonb end)),'{}'),(gd->>'date')::date,(gd->>'year')::smallint,(gd->>'month')::smallint,(gd->>'day')::smallint,gd->>'raw',coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(item->'coursework')='array' then item->'coursework' else '[]'::jsonb end)),'{}'),gpa_value,'resume',false,item->>'fingerprint')
      on conflict(user_id,import_fingerprint) where import_fingerprint is not null do update set institution=excluded.institution,degree=excluded.degree,programs=excluded.programs,graduation_date=excluded.graduation_date,graduation_year=excluded.graduation_year,graduation_month=excluded.graduation_month,graduation_day=excluded.graduation_day,graduation_raw=excluded.graduation_raw,coursework=excluded.coursework,gpa=excluded.gpa
      where not public.candidate_education.confirmed and public.candidate_education.source='resume';
    end if;
  end loop;

  update public.candidate_resumes set parsing_status='parsed',parsed_at=now(),parsing_error=null,extracted_text=p_extracted_text,extraction=p_extraction where id=p_resume_id and user_id=v_user;
end; $$;

revoke all on function public.normalize_resume_date(jsonb) from public;
grant execute on function public.normalize_resume_date(jsonb) to authenticated;
grant execute on function public.persist_resume_import(uuid,text,jsonb) to authenticated;
