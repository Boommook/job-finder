-- Make confirmation an explicit, owner-scoped, non-destructive database operation.
create or replace function public.confirm_candidate_item(p_kind text, p_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  case p_kind
    when 'skill' then update public.candidate_skills set confirmed=true where id=p_id and user_id=v_user returning id into v_id;
    when 'experience' then update public.candidate_experiences set confirmed=true where id=p_id and user_id=v_user returning id into v_id;
    when 'project' then update public.candidate_projects set confirmed=true where id=p_id and user_id=v_user returning id into v_id;
    when 'education' then update public.candidate_education set confirmed=true where id=p_id and user_id=v_user returning id into v_id;
    else raise exception 'Unsupported candidate item kind';
  end case;
  if v_id is null then raise exception 'Candidate item not found'; end if;
  return v_id;
end; $$;
revoke all on function public.confirm_candidate_item(text,uuid) from public;
grant execute on function public.confirm_candidate_item(text,uuid) to authenticated;
