-- Respect an approved feed's Retry-After without keeping a worker lease asleep.
-- Existing handlers keep their original task_fail contract and backoff.
create function public.task_fail_after(p_task uuid,p_token uuid,p_category text,p_retry_after integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;t public.tasks%rowtype;v_owned boolean;v_result jsonb;v_next timestamptz;
begin
 if p_task is null or p_token is null or p_category is null or p_category not in ('infrastructure','timeout','validation','forbidden','stale','canceled') or p_retry_after is null or p_retry_after not between 0 and 86400 then raise exception 'RF_INVALID_INPUT';end if;
 select user_id into u from public.tasks where id=p_task;
 if u is null then return jsonb_build_object('status','missing');end if;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not found then return jsonb_build_object('status','missing');end if;
 v_owned:=t.status='running' and t.lease_token is not distinct from p_token and t.lease_expires_at>clock_timestamp();
 v_result:=public.task_fail(p_task,p_token,p_category);
 if v_owned and v_result->>'status'='queued' and p_retry_after>0 then
  update public.tasks set next_run_at=greatest(next_run_at,clock_timestamp()+make_interval(secs=>p_retry_after)) where id=p_task returning next_run_at into v_next;
  perform pgmq.set_vt('rolefoundry_tasks',t.queue_message_id,greatest(1,ceil(extract(epoch from v_next-clock_timestamp()))::integer));
 end if;
 return v_result;
end $$;
revoke all on function public.task_fail_after(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.task_fail_after(uuid,uuid,text,integer) to service_role;
