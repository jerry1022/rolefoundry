-- Estimated provider spend from deployment-configured pricing (micro-dollars). Null means the
-- route had no pricing or the provider reported no usage; cost is never guessed.
alter table public.gateway_attempts add column cost_micros bigint check (cost_micros >= 0);
alter table public.gateway_results add column cost_micros bigint check (cost_micros >= 0);

create or replace function public.gateway_record(p_task uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_attempts jsonb := p_result->'attempts'; v_existing public.gateway_results%rowtype; i integer;
begin
  if p_task is null or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(v_attempts) <> 'array'
    or jsonb_array_length(v_attempts) > 16 then raise exception 'RF_INVALID_INPUT'; end if;
  if not exists (select 1 from public.identity_tasks where id = p_task) then raise exception 'RF_NOT_FOUND'; end if;
  select * into v_existing from public.gateway_results where task_id = p_task;
  if found then
    if v_existing.state = p_result->>'state' and v_existing.input_version = p_result->>'inputVersion' then return; end if;
    raise exception 'RF_CONFLICT';
  end if;
  insert into public.gateway_results(task_id, purpose, state, code, template_version, input_version, provider, model, input_tokens, output_tokens, latency_ms, cost_micros)
  values (p_task, p_result->>'purpose', p_result->>'state', p_result->>'code', p_result->>'templateVersion', p_result->>'inputVersion',
    p_result->>'provider', p_result->>'model', (p_result->'usage'->>'inputTokens')::bigint, (p_result->'usage'->>'outputTokens')::bigint,
    (p_result->>'latencyMs')::integer, (p_result->>'costMicros')::bigint);
  for i in 0 .. jsonb_array_length(v_attempts) - 1 loop
    insert into public.gateway_attempts(task_id, sequence, provider, model, reported_model, phase, kind, outcome, fallback_reason, latency_ms, input_tokens, output_tokens, cost_micros)
    values (p_task, i + 1, v_attempts->i->>'provider', v_attempts->i->>'model', v_attempts->i->>'reportedModel', v_attempts->i->>'phase',
      v_attempts->i->>'kind', v_attempts->i->>'outcome', v_attempts->i->>'fallbackReason', (v_attempts->i->>'latencyMs')::integer,
      (v_attempts->i->'usage'->>'inputTokens')::integer, (v_attempts->i->'usage'->>'outputTokens')::integer, (v_attempts->i->>'costMicros')::bigint);
  end loop;
end $$;

create or replace function public.gateway_usage_metrics() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'calls', calls, 'failures', failures, 'fallbacks', fallbacks,
    'inputTokens', input_tokens, 'outputTokens', output_tokens, 'costMicros', cost_micros) order by provider), '[]'::jsonb)
  from (
    select a.provider, count(*) calls, count(*) filter (where a.outcome <> 'ok') failures, count(*) filter (where a.phase = 'fallback') fallbacks,
      coalesce(sum(a.input_tokens), 0) input_tokens, coalesce(sum(a.output_tokens), 0) output_tokens, coalesce(sum(a.cost_micros), 0) cost_micros
    from public.gateway_attempts a
    where a.recorded_at > clock_timestamp() - interval '24 hours'
      and a.provider in (select recipient from public.ai_recipient_approvals)
    group by a.provider
    order by a.provider
    limit 16
  ) usage
$$;
