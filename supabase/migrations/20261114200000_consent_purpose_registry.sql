-- Consent purposes become a registry: tables reference consent_policies and functions check
-- membership, so a new purpose is one reviewed INSERT instead of edits across the schema.
alter table public.consent_policies drop constraint consent_policies_purpose_check;
alter table public.consent_policies add constraint consent_policies_purpose_format
  check (purpose ~ '^[a-z][a-z-]{2,30}$');
alter table public.quota_policies drop constraint quota_policies_feature_check,
  add constraint quota_policies_feature_registered foreign key (feature) references public.consent_policies(purpose);
alter table public.identity_tasks drop constraint identity_tasks_feature_check,
  add constraint identity_tasks_feature_registered foreign key (feature) references public.consent_policies(purpose);
alter table public.usage_reservations drop constraint usage_reservations_feature_check,
  add constraint usage_reservations_feature_registered foreign key (feature) references public.consent_policies(purpose);

create function public.identity_purpose_registered(p_purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_purpose is not null and exists (select 1 from public.consent_policies where purpose = p_purpose)
$$;
revoke all on function public.identity_purpose_registered(text) from public, anon, authenticated, service_role;

create or replace function public.identity_revoke_consent(p_purpose text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user();
begin
  if not public.identity_purpose_registered(p_purpose) then raise exception 'RF_INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_user::text, 0));
  perform public.identity_require_user();
  update public.consents set revoked_at = clock_timestamp() where user_id = v_user and purpose = p_purpose and revoked_at is null;
  update public.usage_reservations r set state = 'released', updated_at = clock_timestamp()
    where r.user_id = v_user and r.feature = p_purpose and r.state = 'reserved';
  update public.identity_task_outbox o set available = false where o.task_id in
    (select t.id from public.identity_tasks t where t.user_id = v_user and t.feature = p_purpose and t.status in ('queued', 'running'));
  update public.identity_tasks set status = 'failed', failure_category = 'consent', result_ref = null, finished_at = clock_timestamp()
    where user_id = v_user and feature = p_purpose and status in ('queued', 'running');
  insert into public.identity_audit(actor_id, subject_id, action, reason) values(v_user, v_user, 'consent.revoked', p_purpose);
end $$;

create or replace function public.identity_set_quota_policy(p_feature text, p_weekly_limit integer, p_effective_from timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.identity_require_admin(); v_id bigint;
begin
  if not public.identity_purpose_registered(p_feature) or p_weekly_limit is null or p_weekly_limit not between 0 and 10000
    or p_effective_from is null or p_effective_from <> public.identity_week_start(p_effective_from)
    or p_effective_from < public.identity_week_start(clock_timestamp()) + interval '7 days' then raise exception 'RF_INVALID_INPUT'; end if;
  insert into public.quota_policies(feature, effective_from, weekly_limit, created_by) values(p_feature, p_effective_from, p_weekly_limit, v_actor)
    on conflict(feature, effective_from) do update set weekly_limit = excluded.weekly_limit, created_by = excluded.created_by, created_at = clock_timestamp()
      where public.quota_policies.effective_from > clock_timestamp()
        and not exists(select 1 from public.usage_reservations r where r.policy_id = public.quota_policies.id)
    returning id into v_id;
  if v_id is null then raise exception 'RF_CONFLICT'; end if;
  insert into public.identity_audit(actor_id, action, reason) values(v_actor, 'quota.policy.scheduled', p_feature || ':' || p_weekly_limit::text || ':' || p_effective_from::text);
  return jsonb_build_object('id', v_id, 'effectiveFrom', p_effective_from);
exception when unique_violation then raise exception 'RF_CONFLICT';
end $$;


create or replace function public.identity_reserve_analysis(p_user uuid, p_feature text, p_resource_ref uuid, p_input_version text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_week timestamptz := public.identity_week_start(now()); v_consent uuid; v_policy public.quota_policies%rowtype;
  v_hash text; v_task public.identity_tasks%rowtype; v_used integer;
begin
  if p_user is null or not public.identity_purpose_registered(p_feature) or p_resource_ref is null
    or p_input_version is null or length(p_input_version) not between 1 and 200
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || p_user::text, 0));
  if not public.identity_is_active(p_user) then raise exception 'RF_FORBIDDEN'; end if;
  select c.id into v_consent from public.consents c join public.consent_policies p on p.purpose = c.purpose and p.version = c.policy_version
    where c.user_id = p_user and c.purpose = p_feature and c.revoked_at is null;
  if v_consent is null then raise exception 'RF_CONSENT_REQUIRED'; end if;
  v_hash := encode(extensions.digest(jsonb_build_object('feature', p_feature, 'resource', p_resource_ref, 'version', p_input_version)::text, 'sha256'), 'hex');
  select * into v_task from public.identity_tasks t where t.user_id = p_user and t.feature = p_feature and t.idempotency_key = p_idempotency_key;
  if found then
    if v_task.input_hash <> v_hash then raise exception 'RF_CONFLICT'; end if;
    return jsonb_build_object('taskId', v_task.id, 'status', v_task.status);
  end if;
  select * into v_policy from public.quota_policies q where q.feature = p_feature and q.effective_from <= v_week order by q.effective_from desc limit 1;
  if not found then raise exception 'RF_NOT_CONFIGURED'; end if;
  select count(*) into v_used from public.usage_reservations r where r.user_id = p_user and r.feature = p_feature and r.period_start = v_week and r.state in ('reserved', 'consumed');
  if v_used >= v_policy.weekly_limit then raise exception 'RF_QUOTA_EXCEEDED'; end if;
  insert into public.identity_tasks(user_id, feature, resource_ref, input_version, idempotency_key, input_hash, consent_id)
    values(p_user, p_feature, p_resource_ref, p_input_version, p_idempotency_key, v_hash, v_consent) returning * into v_task;
  insert into public.usage_reservations(user_id, task_id, feature, period_start, policy_id, limit_snapshot)
    values(p_user, v_task.id, p_feature, v_week, v_policy.id, v_policy.weekly_limit);
  insert into public.identity_task_outbox(task_id) values(v_task.id);
  return jsonb_build_object('taskId', v_task.id, 'status', v_task.status);
end $$;

-- Semantic ranking consent: separate from resume analysis so each can be granted or revoked alone.
insert into public.consent_policies(purpose, version, description) values
  ('matching', '2026-11-24', 'Allow your confirmed skill evidence and published job requirements to be sent to the AI recipients approved for this policy version, to rank roles by how well your evidence supports them. Rule-based matching keeps working without this permission.');
insert into public.quota_policies(feature, effective_from, weekly_limit) values ('matching', '2020-01-06T00:00:00Z', 5);

create or replace function public.gateway_feature(p_purpose text) returns text language sql immutable set search_path = '' as $$
  select case p_purpose when 'resume.wording' then 'resume' when 'matching.semantic-rank' then 'matching' end
$$;
