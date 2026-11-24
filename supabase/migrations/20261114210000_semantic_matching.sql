-- Optional semantic tie-breaking for matching reports. Structured rules-v1 results and their
-- validation are unchanged; only the order inside structurally equal results may differ, and
-- every run records which ranking actually applied.
alter table public.match_runs
  add column ranking_recipe text not null default 'rules-v1'
    check (ranking_recipe in ('rules-v1', 'rules-v1+semantic-rank-v1')),
  add column ranking_state text not null default 'not-requested'
    check (ranking_state in ('not-requested', 'applied', 'fallback')),
  add column ranking_code text check (ranking_code ~ '^RF_[A-Z_]{2,60}$'),
  add column semantic_task_id uuid unique references public.identity_tasks(id) on delete set null,
  add constraint match_runs_ranking_consistent check (
    (ranking_state = 'applied') = (ranking_recipe = 'rules-v1+semantic-rank-v1')
    and (ranking_state = 'fallback') = (ranking_code is not null));

-- The identity reservation is created before the run, keyed by the run's idempotency key, so a
-- worker can never start before its reservation exists. Requires the current matching lease.
create function public.matching_semantic_task(p_task uuid, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tasks%rowtype; r public.match_runs%rowtype; v_identity uuid;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  if t.kind <> 'matches.refresh' or t.status <> 'running' or t.lease_token is distinct from p_token
    or t.lease_expires_at <= clock_timestamp() then raise exception 'RF_CONFLICT'; end if;
  select * into r from public.match_runs where id = t.source_ref and task_id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  select i.id into v_identity from public.identity_tasks i
    where i.user_id = r.user_id and i.feature = 'matching' and i.idempotency_key = 'matching:' || r.idempotency_key;
  if v_identity is null then return null; end if;
  return jsonb_build_object('identityTaskId', v_identity, 'ownerId', r.user_id, 'inputVersion', 'matching-key:' || r.idempotency_key);
end $$;

-- Records the applied ranking and publishes in one transaction. A redelivery after commit keeps
-- the original ranking because only queued runs are updated.
create function public.matching_publish_ranked(p_task uuid, p_token uuid, p_results jsonb, p_ranking jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_recipe text := p_ranking->>'recipe'; v_state text := p_ranking->>'state'; v_code text := p_ranking->>'code';
  v_identity uuid; v_run uuid;
begin
  if jsonb_typeof(p_ranking) <> 'object' or v_recipe is null or v_state is null then raise exception 'RF_INVALID_INPUT'; end if;
  select source_ref into v_run from public.tasks where id = p_task and kind = 'matches.refresh';
  if v_run is null then raise exception 'RF_NOT_FOUND'; end if;
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
end $$;

-- Extend report JSON without copying its body.
alter function public.matching_run_json(uuid, integer) rename to matching_run_json_base;
create function public.matching_run_json(p_run uuid, p_after integer default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when base is null then null else base || jsonb_build_object('ranking', jsonb_build_object(
    'recipe', r.ranking_recipe, 'state', r.ranking_state, 'code', r.ranking_code)) end
  from public.matching_run_json_base(p_run, p_after) base
  left join public.match_runs r on r.id = p_run
$$;

revoke all on function public.matching_semantic_task(uuid, uuid), public.matching_publish_ranked(uuid, uuid, jsonb, jsonb),
  public.matching_run_json_base(uuid, integer), public.matching_run_json(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.matching_semantic_task(uuid, uuid), public.matching_publish_ranked(uuid, uuid, jsonb, jsonb) to service_role;
