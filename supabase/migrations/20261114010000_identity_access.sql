-- Module 01: all private mutations execute in the database under explicit grants.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  invited_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique check (length(email_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  issued_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.consent_policies (
  purpose text primary key check (purpose in ('assessment', 'resume')),
  version text not null,
  description text not null
);
insert into public.consent_policies values
  ('assessment', '2026-11-14', 'Allow your assessment answers and relevant skill evidence to be sent to the configured AI provider for assessment analysis.'),
  ('resume', '2026-11-14', 'Allow your confirmed resume content and target job requirements to be sent to the configured AI provider for resume analysis.');
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  purpose text not null references public.consent_policies(purpose),
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index identity_one_active_consent on public.consents(user_id, purpose) where revoked_at is null;
create table public.quota_policies (
  id bigint generated always as identity primary key,
  feature text not null check (feature in ('assessment', 'resume')),
  effective_from timestamptz not null,
  weekly_limit integer not null check (weekly_limit between 0 and 10000),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique(feature, effective_from)
);
insert into public.quota_policies(feature, effective_from, weekly_limit) values
  ('assessment', '2020-01-06T00:00:00Z', 3), ('resume', '2020-01-06T00:00:00Z', 5);
create table public.identity_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  feature text not null check (feature in ('assessment', 'resume')),
  resource_ref uuid not null,
  input_version text not null check (length(input_version) between 1 and 200),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  input_hash text not null,
  consent_id uuid not null references public.consents(id),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  failure_category text check (failure_category in ('infrastructure', 'validation', 'consent', 'deleted', 'canceled')),
  result_ref uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique(user_id, feature, idempotency_key)
);
create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  task_id uuid not null unique references public.identity_tasks(id) on delete cascade,
  feature text not null check (feature in ('assessment', 'resume')),
  period_start timestamptz not null,
  policy_id bigint not null references public.quota_policies(id),
  limit_snapshot integer not null,
  state text not null default 'reserved' check (state in ('reserved', 'consumed', 'released', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index identity_usage_lookup on public.usage_reservations(user_id, feature, period_start, state);
create table public.identity_task_outbox (
  task_id uuid primary key references public.identity_tasks(id) on delete cascade,
  available boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.identity_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(user_id) on delete set null,
  subject_id uuid references public.profiles(user_id) on delete set null,
  action text not null,
  resource_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
create table public.identity_otp_requests (
  email_hash text primary key,
  requested_at timestamptz not null
);

create function public.identity_email_hash(p_email text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(lower(btrim(p_email)), 'sha256'), 'hex')
$$;
create function public.identity_week_start(p_time timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select date_trunc('week', p_time at time zone 'UTC') at time zone 'UTC'
$$;
create function public.identity_is_active(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when auth.role() = 'authenticated' and p_user is distinct from auth.uid() then false
    else exists(select 1 from public.profiles p where p.user_id = p_user and p.status = 'active') end
$$;
create function public.identity_require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then raise exception 'RF_UNAUTHORIZED'; end if;
  if not public.identity_is_active(v_user) then raise exception 'RF_FORBIDDEN'; end if;
  return v_user;
end $$;
create function public.identity_require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user();
begin
  if not exists(select 1 from public.profiles p where p.user_id = v_user and p.role = 'admin') then raise exception 'RF_FORBIDDEN'; end if;
  return v_user;
end $$;

-- Auth invokes this hook even if signup is attempted directly against GoTrue.
create function public.identity_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.invitations i
    where i.email_hash = public.identity_email_hash(event->'user'->>'email')
      and i.used_at is null and i.expires_at > clock_timestamp()) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign-in is available by invitation only.'));
  end if;
  return '{}'::jsonb;
end $$;

-- Service-only admission and resend throttle. The HTTP response is always generic.
create function public.identity_otp_admission(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hash text := public.identity_email_hash(p_email); v_last timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('otp:' || v_hash, 0));
  if exists(select 1 from public.profiles p join auth.users u on u.id = p.user_id
    where public.identity_email_hash(u.email) = v_hash and p.status = 'inactive') then return false; end if;
  if not exists(select 1 from public.profiles p join auth.users u on u.id = p.user_id
    where public.identity_email_hash(u.email) = v_hash and p.status = 'active')
    and not exists(select 1 from public.invitations i where i.email_hash = v_hash and i.used_at is null and i.expires_at > clock_timestamp()) then return false; end if;
  select r.requested_at into v_last from public.identity_otp_requests r where r.email_hash = v_hash;
  if v_last > clock_timestamp() - interval '60 seconds' then return false; end if;
  insert into public.identity_otp_requests values(v_hash, clock_timestamp())
    on conflict (email_hash) do update set requested_at = excluded.requested_at;
  return true;
end $$;

create function public.identity_activate() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_email text; v_inv public.invitations%rowtype; v_profile public.profiles%rowtype;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then raise exception 'RF_UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_user::text, 0));
  select u.email into v_email from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'RF_UNAUTHORIZED'; end if;
  select * into v_profile from public.profiles p where p.user_id = v_user;
  if found then
    if v_profile.status <> 'active' then raise exception 'RF_FORBIDDEN'; end if;
    return jsonb_build_object('userId', v_user, 'role', v_profile.role);
  end if;
  select * into v_inv from public.invitations i where i.email_hash = public.identity_email_hash(v_email) for update;
  if not found or v_inv.used_at is not null or v_inv.expires_at <= clock_timestamp() then raise exception 'RF_INVITATION_REQUIRED'; end if;
  update public.invitations set used_at = clock_timestamp(), used_by = v_user where id = v_inv.id and used_at is null;
  insert into public.profiles(user_id) values(v_user);
  insert into public.identity_audit(actor_id, subject_id, action, resource_id) values(v_user, v_user, 'invitation.redeemed', v_inv.id);
  return jsonb_build_object('userId', v_user, 'role', 'member');
end $$;
create function public.identity_current_actor() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user(); v_role text;
begin
  select p.role into v_role from public.profiles p where p.user_id = v_user;
  return jsonb_build_object('userId', v_user, 'role', v_role);
end $$;
create function public.identity_create_invitation(p_email text, p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.identity_require_admin(); v_inv public.invitations%rowtype;
begin
  if p_email is null or length(p_email) > 254 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '90 days' then raise exception 'RF_INVALID_INPUT'; end if;
  insert into public.invitations(email_hash, expires_at, issued_by)
    values(public.identity_email_hash(p_email), p_expires_at, v_actor)
    on conflict(email_hash) do update set expires_at = excluded.expires_at, issued_by = excluded.issued_by
      where public.invitations.used_at is null returning * into v_inv;
  if not found then raise exception 'RF_CONFLICT'; end if;
  insert into public.identity_audit(actor_id, action, resource_id) values(v_actor, 'invitation.issued', v_inv.id);
  return jsonb_build_object('id', v_inv.id, 'expiresAt', v_inv.expires_at);
end $$;

create function public.identity_policies() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('purpose', p.purpose, 'version', p.version, 'description', p.description) order by p.purpose), '[]'::jsonb)
    from public.consent_policies p
$$;
create function public.identity_grant_consent(p_purpose text, p_policy_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user(); v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_user::text, 0));
  perform public.identity_require_user();
  if not exists(select 1 from public.consent_policies p where p.purpose = p_purpose and p.version = p_policy_version) then raise exception 'RF_CONSENT_VERSION'; end if;
  select c.id into v_id from public.consents c where c.user_id = v_user and c.purpose = p_purpose and c.policy_version = p_policy_version and c.revoked_at is null;
  if v_id is not null then return jsonb_build_object('id', v_id); end if;
  update public.consents set revoked_at = clock_timestamp() where user_id = v_user and purpose = p_purpose and revoked_at is null;
  insert into public.consents(user_id, purpose, policy_version) values(v_user, p_purpose, p_policy_version) returning id into v_id;
  insert into public.identity_audit(actor_id, subject_id, action, resource_id) values(v_user, v_user, 'consent.granted', v_id);
  return jsonb_build_object('id', v_id);
end $$;
create function public.identity_revoke_consent(p_purpose text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user();
begin
  if p_purpose is null or p_purpose not in ('assessment', 'resume') then raise exception 'RF_INVALID_INPUT'; end if;
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
create function public.identity_list_consents() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'purpose', c.purpose, 'policyVersion', c.policy_version, 'grantedAt', c.granted_at) order by c.purpose), '[]'::jsonb)
    into v_result from public.consents c where c.user_id = v_user and c.revoked_at is null;
  return v_result;
end $$;
create function public.identity_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := public.identity_require_user(); v_week timestamptz := public.identity_week_start(now()); v_result jsonb;
begin
  select jsonb_agg(jsonb_build_object('feature', q.feature, 'limit', q.weekly_limit, 'periodStart', v_week,
    'reserved', (select count(*) from public.usage_reservations r where r.user_id = v_user and r.feature = q.feature and r.period_start = v_week and r.state = 'reserved'),
    'consumed', (select count(*) from public.usage_reservations r where r.user_id = v_user and r.feature = q.feature and r.period_start = v_week and r.state = 'consumed')) order by q.feature)
    into v_result from (select distinct on (p.feature) p.* from public.quota_policies p where p.effective_from <= v_week order by p.feature, p.effective_from desc) q;
  return coalesce(v_result, '[]'::jsonb);
end $$;
create function public.identity_set_quota_policy(p_feature text, p_weekly_limit integer, p_effective_from timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.identity_require_admin(); v_id bigint;
begin
  if p_feature is null or p_feature not in ('assessment', 'resume') or p_weekly_limit is null or p_weekly_limit not between 0 and 10000
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

-- Privileged domain services derive p_user from a verified session. These functions
-- cannot be called by browser roles, even if they discover the RPC names.
create function public.identity_reserve_analysis(p_user uuid, p_feature text, p_resource_ref uuid, p_input_version text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_week timestamptz := public.identity_week_start(now()); v_consent uuid; v_policy public.quota_policies%rowtype;
  v_hash text; v_task public.identity_tasks%rowtype; v_used integer;
begin
  if p_user is null or p_feature is null or p_feature not in ('assessment', 'resume') or p_resource_ref is null
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
create function public.identity_task_authorized(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.identity_tasks t join public.profiles u on u.user_id = t.user_id
    join public.consents c on c.id = t.consent_id join public.consent_policies p on p.purpose = c.purpose and p.version = c.policy_version
    where t.id = p_task and t.status in ('queued', 'running') and u.status = 'active' and c.revoked_at is null)
$$;
create function public.identity_start_task(p_task uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_task public.identity_tasks%rowtype;
begin
  select * into v_task from public.identity_tasks t where t.id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_task.user_id::text, 0));
  select * into v_task from public.identity_tasks t where t.id = p_task for update;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  if v_task.status = 'running' and public.identity_task_authorized(p_task) then return jsonb_build_object('status', 'running'); end if;
  if v_task.status <> 'queued' then raise exception 'RF_CONFLICT'; end if;
  update public.identity_task_outbox set available = false where task_id = p_task;
  if not public.identity_task_authorized(p_task) then
    update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where task_id = p_task and state = 'reserved';
    update public.identity_tasks set status = 'failed', failure_category = 'consent', finished_at = clock_timestamp() where id = p_task;
    return jsonb_build_object('status', 'failed');
  end if;
  update public.usage_reservations set state = 'consumed', updated_at = clock_timestamp() where task_id = p_task and state = 'reserved';
  if not found then raise exception 'RF_CONFLICT'; end if;
  update public.identity_tasks set status = 'running', started_at = clock_timestamp() where id = p_task;
  return jsonb_build_object('status', 'running');
end $$;
create function public.identity_release_reservation(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_task public.identity_tasks%rowtype; v_state text;
begin
  select * into v_task from public.identity_tasks t where t.id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_task.user_id::text, 0));
  select r.state into v_state from public.usage_reservations r where r.task_id = p_task for update;
  if v_state = 'released' then return; end if;
  if v_state <> 'reserved' then raise exception 'RF_CONFLICT'; end if;
  update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where task_id = p_task;
  update public.identity_tasks set status = 'failed', failure_category = 'canceled', finished_at = clock_timestamp() where id = p_task;
  update public.identity_task_outbox set available = false where task_id = p_task;
end $$;
create function public.identity_finish_task(p_task uuid, p_result_ref uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_task public.identity_tasks%rowtype;
begin
  select * into v_task from public.identity_tasks t where t.id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_task.user_id::text, 0));
  select * into v_task from public.identity_tasks t where t.id = p_task for update;
  if v_task.status = 'succeeded' then
    if v_task.result_ref = p_result_ref then return jsonb_build_object('status', 'succeeded'); end if;
    raise exception 'RF_CONFLICT';
  end if;
  if v_task.status = 'failed' then return jsonb_build_object('status', 'failed'); end if;
  if not public.identity_task_authorized(p_task) then
    update public.identity_tasks set status = 'failed', result_ref = null, failure_category = 'consent', finished_at = clock_timestamp() where id = p_task;
    update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where task_id = p_task and state = 'reserved';
    return jsonb_build_object('status', 'failed');
  end if;
  if v_task.status <> 'running' or p_result_ref is null then raise exception 'RF_CONFLICT'; end if;
  update public.identity_tasks set status = 'succeeded', result_ref = p_result_ref, finished_at = clock_timestamp() where id = p_task;
  return jsonb_build_object('status', 'succeeded');
end $$;
create function public.identity_fail_task(p_task uuid, p_category text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_task public.identity_tasks%rowtype;
begin
  if p_category is null or p_category not in ('infrastructure', 'validation') then raise exception 'RF_INVALID_INPUT'; end if;
  select * into v_task from public.identity_tasks t where t.id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_task.user_id::text, 0));
  select * into v_task from public.identity_tasks t where t.id = p_task for update;
  if v_task.status = 'failed' then return; end if;
  if v_task.status not in ('queued', 'running') then raise exception 'RF_CONFLICT'; end if;
  update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where task_id = p_task and state = 'reserved';
  update public.identity_tasks set status = 'failed', result_ref = null, failure_category = p_category, finished_at = clock_timestamp() where id = p_task;
  update public.identity_task_outbox set available = false where task_id = p_task;
end $$;
create function public.identity_refund_reservation(p_task uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.identity_require_admin(); v_task public.identity_tasks%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT'; end if;
  select * into v_task from public.identity_tasks t where t.id = p_task;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_task.user_id::text, 0));
  select * into v_task from public.identity_tasks t where t.id = p_task for update;
  if v_task.status <> 'failed' or v_task.failure_category <> 'infrastructure' then raise exception 'RF_CONFLICT'; end if;
  update public.usage_reservations set state = 'refunded', updated_at = clock_timestamp() where task_id = p_task and state = 'consumed';
  if not found then raise exception 'RF_CONFLICT'; end if;
  insert into public.identity_audit(actor_id, subject_id, action, resource_id, reason) values(v_actor, v_task.user_id, 'quota.refunded', p_task, btrim(p_reason));
end $$;
create function public.identity_deactivate_profile(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('identity:' || p_user::text, 0));
  update public.profiles set status = 'inactive' where user_id = p_user;
  update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where user_id = p_user and state = 'reserved';
  update public.identity_task_outbox o set available = false where o.task_id in
    (select t.id from public.identity_tasks t where t.user_id = p_user and t.status in ('queued', 'running'));
  update public.identity_tasks set status = 'failed', result_ref = null, failure_category = 'deleted', finished_at = clock_timestamp()
    where user_id = p_user and status in ('queued', 'running');
end $$;

-- RLS and table privileges: members cannot write roles, consent or quota state directly.
do $$ declare t text; begin
  foreach t in array array['profiles','invitations','consent_policies','consents','quota_policies','identity_tasks','usage_reservations','identity_task_outbox','identity_audit','identity_otp_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant select on public.profiles, public.consents, public.usage_reservations, public.identity_tasks to authenticated;
create policy identity_own_profile on public.profiles for select to authenticated using (user_id = auth.uid() and public.identity_is_active(auth.uid()));
create policy identity_own_consents on public.consents for select to authenticated using (user_id = auth.uid() and public.identity_is_active(auth.uid()));
create policy identity_own_usage on public.usage_reservations for select to authenticated using (user_id = auth.uid() and public.identity_is_active(auth.uid()));
create policy identity_own_tasks on public.identity_tasks for select to authenticated using (user_id = auth.uid() and public.identity_is_active(auth.uid()));

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'identity_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
grant execute on function public.identity_is_active(uuid), public.identity_require_user(), public.identity_require_admin(),
  public.identity_activate(), public.identity_current_actor(), public.identity_create_invitation(text,timestamptz),
  public.identity_grant_consent(text,text), public.identity_revoke_consent(text), public.identity_list_consents(),
  public.identity_usage(), public.identity_set_quota_policy(text,integer,timestamptz), public.identity_refund_reservation(uuid,text) to authenticated;
grant execute on function public.identity_policies() to anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.identity_before_user_created(jsonb) to supabase_auth_admin;
