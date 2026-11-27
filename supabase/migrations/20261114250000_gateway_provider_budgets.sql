-- Rolling 24-hour token budgets per provider, shared by every worker instance. A call reserves
-- an estimate first and settles with provider-reported usage; failed calls keep their estimate
-- because a provider may have charged for them. No request content is stored.
create table public.gateway_token_reservations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  estimate integer not null check (estimate between 1 and 1000000),
  actual integer check (actual between 0 and 10000000),
  created_at timestamptz not null default now()
);
create index gateway_token_reservations_window on public.gateway_token_reservations(provider, created_at);
alter table public.gateway_token_reservations enable row level security;
revoke all on public.gateway_token_reservations from public, anon, authenticated, service_role;

-- Returns a reservation ID, or null when the reservation would exceed the 24-hour cap.
create function public.gateway_budget_reserve(p_provider text, p_tokens integer, p_daily_cap bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_used bigint; v_id uuid;
begin
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9-]{1,30}$' or p_tokens is null or p_tokens not between 1 and 1000000
    or p_daily_cap is null or p_daily_cap not between 1 and 1000000000 then raise exception 'RF_INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gateway-budget:' || p_provider, 0));
  -- Old rows no longer count; keep the table bounded.
  delete from public.gateway_token_reservations where provider = p_provider and created_at < clock_timestamp() - interval '2 days';
  select coalesce(sum(coalesce(actual, estimate)), 0) into v_used from public.gateway_token_reservations
    where provider = p_provider and created_at > clock_timestamp() - interval '24 hours';
  if v_used + p_tokens > p_daily_cap then return null; end if;
  insert into public.gateway_token_reservations(provider, estimate) values (p_provider, p_tokens) returning id into v_id;
  return v_id;
end $$;

-- Settles once with the provider-reported total; a repeated settle keeps the first value.
create function public.gateway_budget_settle(p_provider text, p_id uuid, p_actual integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_provider is null or p_id is null or p_actual is null or p_actual not between 0 and 10000000 then raise exception 'RF_INVALID_INPUT'; end if;
  update public.gateway_token_reservations set actual = p_actual where id = p_id and provider = p_provider and actual is null;
  return found;
end $$;

revoke all on function public.gateway_budget_reserve(text, integer, bigint), public.gateway_budget_settle(text, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.gateway_budget_reserve(text, integer, bigint), public.gateway_budget_settle(text, uuid, integer) to service_role;
