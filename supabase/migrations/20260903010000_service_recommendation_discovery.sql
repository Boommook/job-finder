-- Trusted backend persistence for recommendation discovery runs.
-- The authenticated-user RPC remains unchanged and continues to derive its user from auth.uid().
create function public.update_recommendation_discovery_for_user(
  p_user_id uuid,
  p_job_id uuid,
  p_prefilter_score smallint,
  p_prefilter_reasons text[],
  p_recommendation_state text,
  p_requested boolean,
  p_evaluated boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown recommendation user';
  end if;
  if p_recommendation_state not in ('new','candidate','evaluated','recommended','excluded','failed') then
    raise exception 'Invalid automatic recommendation state';
  end if;

  insert into public.user_job_discovery(
    user_id,job_id,last_seen_at,surfaced_at,prefilter_score,prefilter_reasons,
    recommendation_state,evaluation_requested_at,automatically_evaluated_at,last_error
  )
  values(
    p_user_id,p_job_id,v_now,v_now,p_prefilter_score,coalesce(p_prefilter_reasons,'{}'),
    p_recommendation_state,case when p_requested then v_now end,
    case when p_evaluated then v_now end,p_error
  )
  on conflict(user_id,job_id) do update set
    last_seen_at=v_now,
    surfaced_at=coalesce(public.user_job_discovery.surfaced_at,v_now),
    prefilter_score=excluded.prefilter_score,
    prefilter_reasons=excluded.prefilter_reasons,
    recommendation_state=case
      when public.user_job_discovery.recommendation_state='dismissed' then 'dismissed'
      else excluded.recommendation_state
    end,
    evaluation_requested_at=case
      when p_requested then v_now else public.user_job_discovery.evaluation_requested_at
    end,
    automatically_evaluated_at=case
      when p_evaluated then v_now else public.user_job_discovery.automatically_evaluated_at
    end,
    last_error=p_error,
    updated_at=v_now;
end;
$$;

revoke all on function public.update_recommendation_discovery_for_user(uuid,uuid,smallint,text[],text,boolean,boolean,text) from public;
revoke all on function public.update_recommendation_discovery_for_user(uuid,uuid,smallint,text[],text,boolean,boolean,text) from anon;
revoke all on function public.update_recommendation_discovery_for_user(uuid,uuid,smallint,text[],text,boolean,boolean,text) from authenticated;
grant execute on function public.update_recommendation_discovery_for_user(uuid,uuid,smallint,text[],text,boolean,boolean,text) to service_role;
