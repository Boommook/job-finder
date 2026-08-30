-- Phase 6: public-source expansion, canonical provenance, lifecycle, and fair scheduling metadata.
alter table public.job_sources alter column provider type text using provider::text;
alter table public.job_sources add constraint job_sources_provider_phase6_check check(provider in('greenhouse','lever','ashby','smartrecruiters','recruitee'));

alter table public.jobs add column canonical_key text, add column lifecycle_state text not null default 'active' check(lifecycle_state in('new','active','stale','closed'));
create unique index jobs_canonical_key_idx on public.jobs(canonical_key) where canonical_key is not null;
create index jobs_active_freshness_idx on public.jobs(is_active,last_seen_at desc) where is_active;

create table public.job_provenance(
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
 source_id uuid not null references public.job_sources(id) on delete cascade, external_id text not null,
 provider text not null check(provider in('greenhouse','lever','ashby','smartrecruiters','recruitee')), source_url text not null, application_url text,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 is_active boolean not null default true, raw_payload jsonb, unique(source_id,external_id)
);
create index job_provenance_job_active_idx on public.job_provenance(job_id,is_active);
alter table public.job_provenance enable row level security;grant select on public.job_provenance to authenticated;
create policy "Authenticated users read job provenance" on public.job_provenance for select to authenticated using(true);

insert into public.job_provenance(job_id,source_id,external_id,provider,source_url,application_url,first_seen_at,last_seen_at,is_active,raw_payload)
select id,source_id,external_id,source,source_url,application_url,discovered_at,coalesce(last_seen_at,discovered_at),is_active,raw_payload from public.jobs where source_id is not null and external_id is not null on conflict do nothing;

create or replace function public.persist_ingestion_scan(p_source_id uuid,p_jobs jsonb,p_complete boolean default true) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; target uuid; old_job uuid; inserted_count int:=0;updated_count int:=0;deactivated_count int:=0; seen text[]:='{}';
begin
 if not exists(select 1 from job_sources where id=p_source_id and enabled) then raise exception 'Unknown or disabled source'; end if;
 for item in select value from jsonb_array_elements(p_jobs) loop
  if coalesce(item->>'external_id','')='' or coalesce(item->>'canonical_key','')='' then continue; end if;
  seen:=array_append(seen,item->>'external_id'); select job_id into old_job from job_provenance where source_id=p_source_id and external_id=item->>'external_id';
  if old_job is not null then target:=old_job;updated_count:=updated_count+1; else select id into target from jobs where canonical_key=item->>'canonical_key' limit 1;
   if target is null then
    insert into jobs(source_id,external_id,source,source_url,application_url,company,title,description,location,workplace_type,employment_type,salary_min,salary_max,salary_currency,compensation_interval,skills,seniority,sponsorship,posted_at,last_seen_at,is_active,raw_payload,content_hash,canonical_key,lifecycle_state)
    values(p_source_id,item->>'external_id',item->>'source',item->>'source_url',item->>'application_url',item->>'company',item->>'title',coalesce(item->>'description',''),coalesce(item->>'location','Location unavailable'),item->>'workplace_type',item->>'employment_type',(item->>'salary_min')::numeric,(item->>'salary_max')::numeric,item->>'salary_currency',coalesce(item->>'compensation_interval','unknown'),coalesce(array(select jsonb_array_elements_text(item->'skills')),'{}'),item->>'seniority',(item->>'sponsorship')::boolean,(item->>'posted_at')::timestamptz,now(),true,item->'raw_payload',item->>'content_hash',item->>'canonical_key','new') returning id into target;inserted_count:=inserted_count+1;
   else updated_count:=updated_count+1; end if;
  end if;
  update jobs set last_seen_at=now(),is_active=true,lifecycle_state=case when lifecycle_state='new' then 'new' else 'active' end,
   application_url=case when item->>'application_url' is null then application_url when application_url is null then item->>'application_url' when (item->>'application_url')~*'(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|recruitee\.com)' and application_url!~*'(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|recruitee\.com)' then item->>'application_url' else application_url end,updated_at=now() where id=target;
  insert into job_provenance(job_id,source_id,external_id,provider,source_url,application_url,raw_payload) values(target,p_source_id,item->>'external_id',item->>'source',item->>'source_url',item->>'application_url',item->'raw_payload')
  on conflict(source_id,external_id) do update set job_id=excluded.job_id,provider=excluded.provider,source_url=excluded.source_url,application_url=excluded.application_url,last_seen_at=now(),is_active=true,raw_payload=excluded.raw_payload;
 end loop;
 if p_complete then update job_provenance set is_active=false where source_id=p_source_id and is_active and not(external_id=any(seen));get diagnostics deactivated_count=row_count; end if;
 update jobs j set is_active=exists(select 1 from job_provenance p where p.job_id=j.id and p.is_active),lifecycle_state=case when exists(select 1 from job_provenance p where p.job_id=j.id and p.is_active) then case when j.lifecycle_state='new' then 'new' else 'active' end else 'closed' end where exists(select 1 from job_provenance p where p.job_id=j.id and p.source_id=p_source_id);
 update jobs set lifecycle_state='stale' where is_active and lifecycle_state<>'new' and last_seen_at<now()-interval '14 days';
 return jsonb_build_object('inserted',inserted_count,'updated',updated_count,'deactivated',deactivated_count);
end$$;
revoke all on function public.persist_ingestion_scan(uuid,jsonb,boolean) from public,anon,authenticated;

insert into public.job_sources(provider,company_name,board_identifier,careers_url) values
('greenhouse','Figma','figma','https://boards.greenhouse.io/figma'),('greenhouse','Discord','discord','https://boards.greenhouse.io/discord'),('greenhouse','Reddit','reddit','https://boards.greenhouse.io/reddit'),('greenhouse','Roblox','roblox','https://boards.greenhouse.io/roblox'),('greenhouse','Scale AI','scaleai','https://boards.greenhouse.io/scaleai'),('greenhouse','Vercel','vercel','https://boards.greenhouse.io/vercel'),('greenhouse','Cockroach Labs','cockroachlabs','https://boards.greenhouse.io/cockroachlabs'),('greenhouse','Samsara','samsara','https://boards.greenhouse.io/samsara'),('greenhouse','Plaid','plaid','https://boards.greenhouse.io/plaid'),
('lever','Mux','mux','https://jobs.lever.co/mux'),('lever','Postman','postman','https://jobs.lever.co/postman'),('lever','Higharc','higharc','https://jobs.lever.co/higharc'),('lever','Axon','axon','https://jobs.lever.co/axon'),('lever','Scale AI','scaleai','https://jobs.lever.co/scaleai'),
('ashby','OpenAI','openai','https://jobs.ashbyhq.com/openai'),('ashby','Quora','quora','https://jobs.ashbyhq.com/quora'),('ashby','Sentry','sentry','https://jobs.ashbyhq.com/sentry'),('ashby','Pinecone','pinecone','https://jobs.ashbyhq.com/pinecone'),('ashby','Modal','modal','https://jobs.ashbyhq.com/modal'),('ashby','Vanta','vanta','https://jobs.ashbyhq.com/vanta'),('ashby','Mercury','mercury','https://jobs.ashbyhq.com/mercury'),('ashby','Airtable','airtable','https://jobs.ashbyhq.com/airtable'),
('smartrecruiters','Ubisoft','Ubisoft2','https://jobs.smartrecruiters.com/Ubisoft2'),('smartrecruiters','Bosch','BoschGroup','https://jobs.smartrecruiters.com/BoschGroup'),('smartrecruiters','Visa','Visa','https://jobs.smartrecruiters.com/Visa'),
('recruitee','Mollie','mollie','https://mollie.recruitee.com'),('recruitee','WeTransfer','wetransfer','https://wetransfer.recruitee.com'),('recruitee','Canonical','canonical','https://canonical.recruitee.com')
on conflict(provider,board_identifier) do update set company_name=excluded.company_name,careers_url=excluded.careers_url;
