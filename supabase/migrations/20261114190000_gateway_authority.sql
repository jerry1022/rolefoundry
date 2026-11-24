-- AI Gateway authority: reviewed recipients bound to consent versions, durable attempt/usage
-- records and provider usage aggregates. Nothing here sends a request or enables a provider.

-- Gateway purposes map onto existing consent/quota features; unmapped purposes are not admitted.
create function public.gateway_feature(p_purpose text) returns text language sql immutable set search_path = '' as $$
  select case p_purpose when 'resume.wording' then 'resume' end
$$;

-- A recipient may receive data only for a consent version a reviewer approved it under.
create table public.ai_recipient_approvals (
  purpose text not null references public.consent_policies(purpose),
  policy_version text not null check (length(policy_version) between 1 and 60),
  recipient text not null check (recipient ~ '^[a-z][a-z0-9-]{1,30}$'),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  approved_by uuid references public.profiles(user_id) on delete set null,
  approved_at timestamptz not null default now(),
  primary key (purpose, policy_version, recipient)
);

-- One immutable result per reserved identity task, plus its ordered attempts. No content is stored.
create table public.gateway_results (
  task_id uuid primary key references public.identity_tasks(id) on delete cascade,
  purpose text not null check (public.gateway_feature(purpose) is not null),
  state text not null check (state in ('succeeded','rejected','invalid-output','invalid-reference','provider-failed','stale','cancelled')),
  code text check (code ~ '^RF_[A-Z_]{2,60}$'),
  template_version text not null check (length(template_version) between 1 and 60),
  input_version text not null check (length(input_version) between 1 and 200),
  provider text check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  model text check (length(model) between 1 and 120),
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  recorded_at timestamptz not null default now(),
  check ((state = 'succeeded') = (code is null)),
  check ((state = 'succeeded') = (provider is not null and model is not null))
);
create table public.gateway_attempts (
  task_id uuid not null references public.gateway_results(task_id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 16),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  model text not null check (length(model) between 1 and 120),
  reported_model text check (length(reported_model) between 1 and 120),
  phase text not null check (phase in ('primary','fallback')),
  kind text not null check (kind in ('call','repair')),
  outcome text not null check (outcome in ('ok','timeout','throttled','unavailable','authentication','permission','quota','invalid-request','unsupported','cancelled','invalid-json','invalid-schema','invalid-reference')),
  fallback_reason text check (fallback_reason in ('timeout','throttled','unavailable')),
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  recorded_at timestamptz not null default now(),
  primary key (task_id, sequence),
  check ((phase = 'fallback') = (fallback_reason is not null))
);
create index gateway_attempts_recent on public.gateway_attempts(recorded_at, provider);
alter table public.ai_recipient_approvals enable row level security;
alter table public.gateway_results enable row level security;
alter table public.gateway_attempts enable row level security;
revoke all on public.ai_recipient_approvals, public.gateway_results, public.gateway_attempts
  from public, anon, authenticated, service_role;

-- Returns null when admitted, otherwise a safe code. Requires the identity task to be started
-- (budget consumed) under the caller-asserted owner, purpose and exact input version.
create function public.gateway_admit(p_task uuid, p_owner uuid, p_purpose text, p_input_version text, p_recipients text[])
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_feature text := public.gateway_feature(p_purpose); v_task public.identity_tasks%rowtype; v_version text;
begin
  if p_task is null or p_owner is null or p_input_version is null or p_recipients is null
    or cardinality(p_recipients) not between 1 and 16 or array_position(p_recipients, null) is not null then
    raise exception 'RF_INVALID_INPUT';
  end if;
  if v_feature is null then return 'RF_NOT_CONFIGURED'; end if;
  select * into v_task from public.identity_tasks where id = p_task;
  if not found or v_task.user_id <> p_owner or v_task.feature <> v_feature or v_task.input_version <> p_input_version then
    return 'RF_FORBIDDEN';
  end if;
  if v_task.status <> 'running' then return 'RF_CONFLICT'; end if;
  if not public.identity_task_authorized(p_task) then return 'RF_CONSENT_REQUIRED'; end if;
  select c.policy_version into v_version from public.consents c where c.id = v_task.consent_id;
  if exists (
    select 1 from unnest(p_recipients) r
    where not exists (select 1 from public.ai_recipient_approvals a
      where a.purpose = v_feature and a.policy_version = v_version and a.recipient = r)
  ) then return 'RF_RECIPIENT_NOT_APPROVED'; end if;
  return null;
end $$;

-- Publication guard: owner active, consent unrevoked, task still running on the same input.
create function public.gateway_current(p_task uuid, p_owner uuid, p_input_version text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.identity_tasks t
    where t.id = p_task and t.user_id = p_owner and t.input_version = p_input_version and t.status = 'running')
    and public.identity_task_authorized(p_task)
$$;

-- Idempotent: the same task can be recorded once; a different replay conflicts.
create function public.gateway_record(p_task uuid, p_result jsonb) returns void
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
  insert into public.gateway_results(task_id, purpose, state, code, template_version, input_version, provider, model, input_tokens, output_tokens, latency_ms)
  values (p_task, p_result->>'purpose', p_result->>'state', p_result->>'code', p_result->>'templateVersion', p_result->>'inputVersion',
    p_result->>'provider', p_result->>'model', (p_result->'usage'->>'inputTokens')::bigint, (p_result->'usage'->>'outputTokens')::bigint,
    (p_result->>'latencyMs')::integer);
  for i in 0 .. jsonb_array_length(v_attempts) - 1 loop
    insert into public.gateway_attempts(task_id, sequence, provider, model, reported_model, phase, kind, outcome, fallback_reason, latency_ms, input_tokens, output_tokens)
    values (p_task, i + 1, v_attempts->i->>'provider', v_attempts->i->>'model', v_attempts->i->>'reportedModel', v_attempts->i->>'phase',
      v_attempts->i->>'kind', v_attempts->i->>'outcome', v_attempts->i->>'fallbackReason', (v_attempts->i->>'latencyMs')::integer,
      (v_attempts->i->'usage'->>'inputTokens')::integer, (v_attempts->i->'usage'->>'outputTokens')::integer);
  end loop;
end $$;

-- Administrator review of recipients. Approval applies to one consent version; a new consent
-- version starts with no recipients.
create function public.gateway_recipients() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.identity_require_admin();
  return jsonb_build_object(
    'policies', (select coalesce(jsonb_agg(jsonb_build_object('purpose', p.purpose, 'version', p.version) order by p.purpose), '[]'::jsonb) from public.consent_policies p),
    'approvals', (select coalesce(jsonb_agg(jsonb_build_object('purpose', a.purpose, 'policyVersion', a.policy_version, 'recipient', a.recipient, 'reason', a.reason, 'approvedAt', a.approved_at) order by a.purpose, a.recipient), '[]'::jsonb)
      from public.ai_recipient_approvals a join public.consent_policies p on p.purpose = a.purpose and p.version = a.policy_version));
end $$;
create function public.gateway_approve_recipient(p_purpose text, p_recipient text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.identity_require_admin(); v_version text;
begin
  select version into v_version from public.consent_policies where purpose = p_purpose;
  if not found or p_recipient is null or p_recipient !~ '^[a-z][a-z0-9-]{1,30}$' or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'RF_INVALID_INPUT';
  end if;
  insert into public.ai_recipient_approvals(purpose, policy_version, recipient, reason, approved_by)
  values (p_purpose, v_version, p_recipient, btrim(p_reason), v_actor) on conflict do nothing;
  if not found then raise exception 'RF_CONFLICT'; end if;
  insert into public.identity_audit(actor_id, action, reason) values (v_actor, 'ai.recipient_approved', p_purpose || ':' || p_recipient || ' ' || btrim(p_reason));
end $$;
create function public.gateway_revoke_recipient(p_purpose text, p_recipient text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.identity_require_admin();
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT'; end if;
  delete from public.ai_recipient_approvals where purpose = p_purpose and recipient = p_recipient;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  insert into public.identity_audit(actor_id, action, reason) values (v_actor, 'ai.recipient_revoked', p_purpose || ':' || p_recipient || ' ' || btrim(p_reason));
end $$;

-- Provider usage for the last 24 hours: bounded by the reviewed recipient set (labels never come
-- from free-form model output).
create function public.gateway_usage_metrics() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'calls', calls, 'failures', failures, 'fallbacks', fallbacks,
    'inputTokens', input_tokens, 'outputTokens', output_tokens) order by provider), '[]'::jsonb)
  from (
    select a.provider, count(*) calls, count(*) filter (where a.outcome <> 'ok') failures, count(*) filter (where a.phase = 'fallback') fallbacks,
      coalesce(sum(a.input_tokens), 0) input_tokens, coalesce(sum(a.output_tokens), 0) output_tokens
    from public.gateway_attempts a
    where a.recorded_at > clock_timestamp() - interval '24 hours'
      and a.provider in (select recipient from public.ai_recipient_approvals)
    group by a.provider
    order by a.provider
    limit 16
  ) usage
$$;

-- Extend the telemetry snapshot without copying its body: keep the prior function as a base.
alter function public.telemetry_snapshot() rename to telemetry_snapshot_base;
create function public.telemetry_snapshot() returns jsonb language sql security definer set search_path = '' as $$
  select public.telemetry_snapshot_base() || jsonb_build_object('gateway', public.gateway_usage_metrics())
$$;

revoke all on function public.gateway_feature(text), public.gateway_admit(uuid,uuid,text,text,text[]), public.gateway_current(uuid,uuid,text),
  public.gateway_record(uuid,jsonb), public.gateway_recipients(), public.gateway_approve_recipient(text,text,text),
  public.gateway_revoke_recipient(text,text,text), public.gateway_usage_metrics(), public.telemetry_snapshot_base(), public.telemetry_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function public.gateway_admit(uuid,uuid,text,text,text[]), public.gateway_current(uuid,uuid,text),
  public.gateway_record(uuid,jsonb), public.telemetry_snapshot() to service_role;
grant execute on function public.gateway_recipients(), public.gateway_approve_recipient(text,text,text),
  public.gateway_revoke_recipient(text,text,text) to authenticated;
