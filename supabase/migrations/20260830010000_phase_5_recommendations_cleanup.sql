-- Phase 5 cleanup: global feed filtering/ranking and durable discovery writes.
-- Ranking contract (mirrored in src/lib/recommendations/ranking.ts):
-- current evaluation = 100 + overall score + apply 25 / consider 12 / skip -20
--                      + freshness (0..15 days);
-- no current evaluation = min(prefilter score, 99) + freshness * 0.5.

create function public.get_recommendation_feed(
  p_candidate_profile_hash text,
  p_prompt_version text,
  p_recommended_score integer,
  p_search text default null,
  p_status text default 'all',
  p_view text default 'all',
  p_company text default null,
  p_source text default null,
  p_arrangement text default 'all',
  p_sort text default 'match',
  p_offset integer default 0,
  p_limit integer default 50
)
returns table(job jsonb,user_status text,eligible_total bigint)
language sql stable security invoker set search_path='' as $$
with pref as (
  select coalesce(employment_types,'{}') employment_types,
    coalesce(remote_preference,'flexible') remote_preference,
    minimum_salary,coalesce(excluded_keywords,'{}') excluded_keywords,
    coalesce(sponsorship_required,false) sponsorship_required
  from public.job_preferences where user_id=(select auth.uid())
), p as (
  select coalesce((select employment_types from pref),'{}') employment_types,
    coalesce((select remote_preference from pref),'flexible') remote_preference,
    (select minimum_salary from pref) minimum_salary,
    coalesce((select excluded_keywords from pref),'{}') excluded_keywords,
    coalesce((select sponsorship_required from pref),false) sponsorship_required
), eligible as (
  select j.*,coalesce(s.status::text,'new') status,d.viewed_at,d.prefilter_score,
    e.overall_score,e.recommendation,e.created_at evaluation_created_at,
    case when e.id is null then false else true end has_current_evaluation,
    greatest(0,15-floor(extract(epoch from (now()-coalesce(j.posted_at,j.discovered_at)))/86400)) freshness_days
  from public.jobs j cross join p
  left join public.user_job_statuses s on s.job_id=j.id and s.user_id=(select auth.uid())
  left join public.user_job_discovery d on d.job_id=j.id and d.user_id=(select auth.uid())
  left join lateral (
    select je.* from public.job_evaluations je
    where je.user_id=(select auth.uid()) and je.job_id=j.id
      and je.candidate_profile_hash=p_candidate_profile_hash
      and je.job_content_hash=coalesce(j.content_hash,'')
      and je.prompt_version=p_prompt_version
    order by je.created_at desc,je.id desc limit 1
  ) e on true
  where coalesce(s.status::text,'new')<>'rejected'
    and (p_status='all' or coalesce(s.status::text,'new')=p_status)
    and (p_company is null or j.company=p_company)
    and (p_source is null or j.source=p_source)
    and (p_arrangement='all' or j.workplace_type=p_arrangement)
    and (p_search is null or trim(p_search)='' or concat_ws(' ',j.title,j.company,j.location,j.description) ilike '%'||p_search||'%')
    and (s.status in ('saved','applied') or (j.is_active
      and (cardinality(p.employment_types)=0 or j.employment_type is null or j.employment_type=any(p.employment_types))
      and (p.remote_preference='flexible' or j.workplace_type is null or j.workplace_type=p.remote_preference)
      and (p.minimum_salary is null or j.salary_min is null or j.compensation_interval<>'yearly' or j.salary_min>=p.minimum_salary)
      and (not p.sponsorship_required or j.sponsorship is distinct from false)
      and not exists(select 1 from unnest(p.excluded_keywords) keyword where trim(keyword)<>'' and concat_ws(E'\n',j.title,j.company,j.description) ilike '%'||trim(keyword)||'%')))
), viewed as (
  select eligible.*,
    case when has_current_evaluation then
      100+overall_score+(case recommendation when 'apply' then 25 when 'consider' then 12 else -20 end)+freshness_days
    else least(99,coalesce(prefilter_score,0))+(freshness_days*0.5) end recommendation_rank
  from eligible
  where (p_view not in ('recommended','new')
    or (p_view='new' and viewed_at is null)
    or (p_view='recommended' and has_current_evaluation and overall_score>=p_recommended_score and recommendation in ('apply','consider')))
), numbered as (
  select viewed.*,count(*) over() total from viewed
  order by
    case when p_sort='match' or p_view='recommended' then recommendation_rank end desc nulls last,
    case when p_sort='posted' then posted_at end desc nulls last,
    case when p_sort='discovered' then discovered_at end desc nulls last,
    discovered_at desc,id asc
  offset greatest(p_offset,0) limit least(greatest(p_limit,1),50)
)
select to_jsonb(numbered)-array['status','total','viewed_at','prefilter_score','overall_score','recommendation','evaluation_created_at','has_current_evaluation','freshness_days','recommendation_rank'],status,total
from numbered
union all
select null::jsonb,'new',(select count(*) from viewed)
where not exists(select 1 from numbered);
$$;
grant execute on function public.get_recommendation_feed(text,text,integer,text,text,text,text,text,text,text,integer,integer) to authenticated;

create function public.touch_job_discovery(p_job_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.user_job_discovery(user_id,job_id,last_seen_at,surfaced_at)
  select v_user,id,now(),now() from unnest(p_job_ids) id
  on conflict(user_id,job_id) do update set last_seen_at=excluded.last_seen_at,
    surfaced_at=coalesce(public.user_job_discovery.surfaced_at,excluded.surfaced_at),updated_at=now();
end; $$;
grant execute on function public.touch_job_discovery(uuid[]) to authenticated;

create function public.mark_job_discovery_viewed(p_job_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.user_job_discovery(user_id,job_id,last_seen_at,surfaced_at,viewed_at)
  values(v_user,p_job_id,now(),now(),now())
  on conflict(user_id,job_id) do update set last_seen_at=excluded.last_seen_at,
    surfaced_at=coalesce(public.user_job_discovery.surfaced_at,excluded.surfaced_at),
    viewed_at=coalesce(public.user_job_discovery.viewed_at,excluded.viewed_at),updated_at=now();
end; $$;
grant execute on function public.mark_job_discovery_viewed(uuid) to authenticated;

create function public.set_job_discovery_dismissed(p_job_id uuid,p_dismissed boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.user_job_discovery(user_id,job_id,recommendation_state,dismissed_at)
  values(v_user,p_job_id,case when p_dismissed then 'dismissed' else 'new' end,case when p_dismissed then now() end)
  on conflict(user_id,job_id) do update set
    recommendation_state=case when p_dismissed then 'dismissed' when public.user_job_discovery.recommendation_state='dismissed' then 'new' else public.user_job_discovery.recommendation_state end,
    dismissed_at=case when p_dismissed then coalesce(public.user_job_discovery.dismissed_at,now()) else null end,updated_at=now();
end; $$;
grant execute on function public.set_job_discovery_dismissed(uuid,boolean) to authenticated;

create function public.update_recommendation_discovery(
  p_job_id uuid,p_prefilter_score smallint,p_prefilter_reasons text[],p_recommendation_state text,
  p_requested boolean,p_evaluated boolean,p_error text default null
)
returns void language plpgsql security invoker set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_recommendation_state not in ('new','candidate','evaluated','recommended','excluded','failed') then raise exception 'Invalid automatic recommendation state'; end if;
  insert into public.user_job_discovery(user_id,job_id,last_seen_at,surfaced_at,prefilter_score,prefilter_reasons,recommendation_state,evaluation_requested_at,automatically_evaluated_at,last_error)
  values(v_user,p_job_id,v_now,v_now,p_prefilter_score,coalesce(p_prefilter_reasons,'{}'),p_recommendation_state,case when p_requested then v_now end,case when p_evaluated then v_now end,p_error)
  on conflict(user_id,job_id) do update set last_seen_at=v_now,
    surfaced_at=coalesce(public.user_job_discovery.surfaced_at,v_now),prefilter_score=excluded.prefilter_score,
    prefilter_reasons=excluded.prefilter_reasons,
    recommendation_state=case when public.user_job_discovery.recommendation_state='dismissed' then 'dismissed' else excluded.recommendation_state end,
    evaluation_requested_at=case when p_requested then v_now else public.user_job_discovery.evaluation_requested_at end,
    automatically_evaluated_at=case when p_evaluated then v_now else public.user_job_discovery.automatically_evaluated_at end,
    last_error=p_error,updated_at=v_now;
end; $$;
grant execute on function public.update_recommendation_discovery(uuid,smallint,text[],text,boolean,boolean,text) to authenticated;
