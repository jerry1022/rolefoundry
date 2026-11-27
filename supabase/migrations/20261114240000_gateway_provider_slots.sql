-- Provider-wide concurrency for AI gateway calls across every worker instance. Slots are leased
-- so a crashed worker frees its slot when the lease expires; no request content is stored.
create table public.gateway_provider_slots (
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  slot smallint not null check (slot between 1 and 64),
  token uuid not null,
  expires_at timestamptz not null,
  primary key (provider, slot)
);
alter table public.gateway_provider_slots enable row level security;
revoke all on public.gateway_provider_slots from public, anon, authenticated, service_role;

-- Returns a slot token, or null when all `p_limit` slots are held by unexpired leases.
create function public.gateway_slot_acquire(p_provider text, p_limit integer, p_seconds integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_slot integer; v_token uuid := gen_random_uuid();
begin
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9-]{1,30}$' or p_limit is null or p_limit not between 1 and 64
    or p_seconds is null or p_seconds not between 5 and 600 then raise exception 'RF_INVALID_INPUT'; end if;
  -- One provider's slots are allocated serially; other providers are unaffected.
  perform pg_advisory_xact_lock(hashtextextended('gateway-slots:' || p_provider, 0));
  -- A lowered limit retires higher-numbered slots once their leases expire.
  delete from public.gateway_provider_slots where provider = p_provider and slot > p_limit and expires_at <= v_now;
  select n into v_slot from generate_series(1, p_limit) n
    where not exists (select 1 from public.gateway_provider_slots s where s.provider = p_provider and s.slot = n and s.expires_at > v_now)
    order by n limit 1;
  if v_slot is null then return null; end if;
  insert into public.gateway_provider_slots(provider, slot, token, expires_at)
    values (p_provider, v_slot, v_token, v_now + make_interval(secs => p_seconds))
  on conflict (provider, slot) do update set token = excluded.token, expires_at = excluded.expires_at;
  return v_token;
end $$;

-- Releasing requires the exact token, so a late worker cannot free a reassigned slot.
create function public.gateway_slot_release(p_provider text, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_provider is null or p_token is null then raise exception 'RF_INVALID_INPUT'; end if;
  delete from public.gateway_provider_slots where provider = p_provider and token = p_token;
  return found;
end $$;

revoke all on function public.gateway_slot_acquire(text, integer, integer), public.gateway_slot_release(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.gateway_slot_acquire(text, integer, integer), public.gateway_slot_release(text, uuid) to service_role;
