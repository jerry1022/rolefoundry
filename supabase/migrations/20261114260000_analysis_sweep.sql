-- Reclaims optional-analysis reservations that no worker will complete. A reservation whose
-- domain work failed before the AI stage (or whose run already existed) is never started;
-- after an hour it is released so it stops counting against the weekly allowance. A started
-- task that never finished (worker crash, failed completion) becomes a refundable
-- infrastructure failure after a day instead of staying `running` forever.
create function public.identity_sweep_analyses(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_task public.identity_tasks%rowtype; v_count integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'RF_INVALID_INPUT'; end if;
  for v_task in
    select * from public.identity_tasks t
    where (t.status = 'queued' and t.created_at < clock_timestamp() - interval '1 hour')
       or (t.status = 'running' and coalesce(t.started_at, t.created_at) < clock_timestamp() - interval '1 day')
    order by t.created_at limit p_limit
  loop
    -- Same owner lock as reservation, start and finish.
    perform pg_advisory_xact_lock(hashtextextended('identity:' || v_task.user_id::text, 0));
    select * into v_task from public.identity_tasks where id = v_task.id for update;
    if v_task.status = 'queued' then
      update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where task_id = v_task.id and state = 'reserved';
      update public.identity_tasks set status = 'failed', failure_category = 'canceled', finished_at = clock_timestamp() where id = v_task.id;
    elsif v_task.status = 'running' then
      update public.identity_tasks set status = 'failed', failure_category = 'infrastructure', result_ref = null, finished_at = clock_timestamp() where id = v_task.id;
    else
      continue;
    end if;
    update public.identity_task_outbox set available = false where task_id = v_task.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.identity_sweep_analyses(integer) from public, anon, authenticated, service_role;
grant execute on function public.identity_sweep_analyses(integer) to service_role;

-- Follow the documented lock order (catalog -> dictionary -> owner -> task -> run) before
-- touching the run row, so ranked publication cannot deadlock with evidence deletion.
create or replace function public.matching_publish_ranked(p_task uuid, p_token uuid, p_results jsonb, p_ranking jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_recipe text := p_ranking->>'recipe'; v_state text := p_ranking->>'state'; v_code text := p_ranking->>'code';
  v_identity uuid; v_run uuid; v_user uuid;
begin
  if jsonb_typeof(p_ranking) <> 'object' or v_recipe is null or v_state is null then raise exception 'RF_INVALID_INPUT'; end if;
  select source_ref, user_id into v_run, v_user from public.tasks where id = p_task and kind = 'matches.refresh';
  if v_run is null then raise exception 'RF_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write', 0));
  perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write', 0));
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_user::text, 0));
  perform 1 from public.tasks where id = p_task for update;
  if p_ranking ? 'identityTaskId' and p_ranking->>'identityTaskId' is not null then
    v_identity := (p_ranking->>'identityTaskId')::uuid;
    if not exists (select 1 from public.identity_tasks i join public.match_runs r on r.id = v_run
      where i.id = v_identity and i.user_id = r.user_id and i.feature = 'matching'
        and i.idempotency_key = 'matching:' || r.idempotency_key) then raise exception 'RF_INVALID_INPUT'; end if;
  end if;
  update public.match_runs set ranking_recipe = v_recipe, ranking_state = v_state, ranking_code = v_code,
    semantic_task_id = v_identity
  where id = v_run and status = 'queued';
  return public.matching_publish_task(p_task, p_token, p_results);
exception when invalid_text_representation then raise exception 'RF_INVALID_INPUT';
end $$;
