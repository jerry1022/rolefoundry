-- Administrator AI usage report built from the content-free gateway records. Only counts,
-- tokens, latency and estimated spend leave the database; no request or output text exists.
create index gateway_results_recent on public.gateway_results(recorded_at, purpose);

create function public.gateway_usage_report(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz;
begin
  perform public.identity_require_admin();
  if p_days is null or p_days not in (1, 7, 30) then raise exception 'RF_INVALID_INPUT'; end if;
  v_since := clock_timestamp() - make_interval(days => p_days);
  return jsonb_build_object(
    'windowDays', p_days,
    'since', v_since,
    -- One row per provider and configured model; attempts include retries, repairs and fallbacks.
    'providers', (select coalesce(jsonb_agg(to_jsonb(p) order by p.calls desc, p.provider, p.model), '[]'::jsonb) from (
      select a.provider, a.model,
        count(*)::integer as calls,
        (count(*) filter (where a.outcome <> 'ok'))::integer as failures,
        (count(*) filter (where a.phase = 'fallback'))::integer as fallbacks,
        (count(*) filter (where a.kind = 'repair'))::integer as repairs,
        coalesce(sum(a.input_tokens), 0)::bigint as "inputTokens",
        coalesce(sum(a.output_tokens), 0)::bigint as "outputTokens",
        coalesce(sum(a.cost_micros), 0)::bigint as "costMicros",
        -- Successful calls with no estimate (route unpriced or usage unreported): spend is incomplete.
        (count(*) filter (where a.outcome = 'ok' and a.cost_micros is null))::integer as "unpricedCalls",
        percentile_disc(0.5) within group (order by a.latency_ms) as "p50LatencyMs",
        percentile_disc(0.95) within group (order by a.latency_ms) as "p95LatencyMs"
      from public.gateway_attempts a
      where a.recorded_at >= v_since
      group by a.provider, a.model
      order by count(*) desc
      limit 32) p),
    -- One row per purpose; results are per task, so retries do not inflate them.
    'purposes', (select coalesce(jsonb_agg(to_jsonb(r) order by r.purpose), '[]'::jsonb) from (
      select g.purpose,
        count(*)::integer as results,
        (count(*) filter (where g.state = 'succeeded'))::integer as succeeded,
        (count(*) filter (where g.state = 'rejected'))::integer as rejected,
        (count(*) filter (where g.state in ('invalid-output', 'invalid-reference')))::integer as invalid,
        (count(*) filter (where g.state = 'provider-failed'))::integer as "providerFailed",
        (count(*) filter (where g.state in ('stale', 'cancelled')))::integer as abandoned,
        coalesce(sum(g.cost_micros), 0)::bigint as "costMicros"
      from public.gateway_results g
      where g.recorded_at >= v_since
      group by g.purpose) r),
    -- UTC calendar days that have attempts, oldest first.
    'daily', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb) from (
      select to_char(a.recorded_at at time zone 'UTC', 'YYYY-MM-DD') as day,
        count(*)::integer as calls,
        coalesce(sum(a.input_tokens), 0)::bigint + coalesce(sum(a.output_tokens), 0)::bigint as tokens,
        coalesce(sum(a.cost_micros), 0)::bigint as "costMicros"
      from public.gateway_attempts a
      where a.recorded_at >= v_since
      group by 1) d)
  );
end $$;
revoke all on function public.gateway_usage_report(integer) from public, anon;
grant execute on function public.gateway_usage_report(integer) to authenticated;
