create index if not exists tasks_queue_delivery on public.tasks(queue_message_id);
-- Per-acquisition resource admission; process-wide handler slots remain owned by TaskWorker.
create function public.task_resource_pool(p_kind text) returns text language sql immutable set search_path='' as $$
 select case
  when p_kind in ('resume.parse','resume.export','account.export') then 'documents'
  when p_kind='catalog.fetch' then 'fetch'
  when p_kind in ('assessment.grade','matches.refresh','learning.plan','resume.revise','catalog.import','account.delete') then 'general'
  else null end
$$;
CREATE OR REPLACE FUNCTION public.task_read_resources(p_worker uuid, p_kinds text[], p_seconds integer, p_quantity integer, p_limits jsonb default null)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record;t public.tasks%rowtype;v_token uuid;v_result jsonb:='[]'::jsonb;v_task_id uuid;v_scan integer;v_limits jsonb;v_used jsonb:='{}';v_pool text;v_value jsonb;v_skipped bigint[]:='{}';v_message bigint;v_filter jsonb;
begin
 if p_worker is null or p_seconds is null or p_seconds not between 5 and 300 or p_quantity is null or p_quantity not between 1 and 8 or coalesce(cardinality(p_kinds),0) not between 1 and 20 then raise exception 'RF_INVALID_INPUT';end if;
 v_limits:=coalesce(p_limits,jsonb_build_object('documents',p_quantity,'fetch',p_quantity,'general',p_quantity));
 if jsonb_typeof(v_limits) is distinct from 'object' then raise exception 'RF_INVALID_INPUT';end if;
 if (select count(*) from jsonb_object_keys(v_limits))<>3 then raise exception 'RF_INVALID_INPUT';end if;
 for v_pool,v_value in select key,value from jsonb_each(v_limits) loop
  if v_pool not in ('documents','fetch','general') or jsonb_typeof(v_value) is distinct from 'number' then raise exception 'RF_INVALID_INPUT';end if;
  if (v_value::text)::numeric<>trunc((v_value::text)::numeric) or (v_value::text)::numeric not between 0 and 8 then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if not exists(select 1 from jsonb_each(v_limits) where (value::text)::numeric>0) then return v_result;end if;
 -- Skip terminal/poison deliveries without mistaking them for an empty queue.
 -- Read one at a time so unclaimed work is never hidden by an over-sized batch.
 for v_scan in 1..64 loop
  exit when jsonb_array_length(v_result)>=p_quantity;
  -- Select an eligible visible message before the standard pgmq conditional read.
  -- Paused/full pools do not hide or obstruct work in the other pools.
  select q.msg_id,q.message into m from pgmq.q_rolefoundry_tasks q
  left join public.tasks candidate on candidate.queue_message_id=q.msg_id
  where q.vt<=clock_timestamp() and (
   candidate.id is null or q.message is distinct from jsonb_build_object('taskId',candidate.id::text)
   or candidate.status in ('succeeded','failed') or not public.task_owner_available(candidate.id)
   or (candidate.kind=any(p_kinds) and candidate.next_run_at<=clock_timestamp()
    and (candidate.status<>'running' or candidate.lease_expires_at is null or candidate.lease_expires_at<=clock_timestamp())
    and coalesce((v_used->>public.task_resource_pool(candidate.kind))::integer,0)<(v_limits->>public.task_resource_pool(candidate.kind))::integer)
  ) order by q.msg_id limit 1 for update of q skip locked;
  exit when not found;
  -- Reject malformed selected payloads before containment filtering (an empty object is a wildcard).
  if jsonb_typeof(m.message) is distinct from 'object' or not m.message?'taskId' or m.message->>'taskId' is null or m.message->>'taskId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or (select count(*) from jsonb_object_keys(m.message))<>1 then
   perform pgmq.archive('rolefoundry_tasks',m.msg_id);insert into public.task_events(worker_id,event,safe_code) values(p_worker,'queue.poison','RF_POISON');continue;
  end if;
  v_filter:=m.message;
  select * into m from pgmq.read('rolefoundry_tasks',p_seconds,1,v_filter);
  if not found then continue;end if;
  if jsonb_typeof(m.message) is distinct from 'object' or not m.message?'taskId' or m.message->>'taskId' is null or m.message->>'taskId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or (select count(*) from jsonb_object_keys(m.message))<>1 then
   perform pgmq.archive('rolefoundry_tasks',m.msg_id);insert into public.task_events(worker_id,event,safe_code) values(p_worker,'queue.poison','RF_POISON');continue;
  end if;
  v_task_id:=(m.message->>'taskId')::uuid;select * into t from public.tasks where id=v_task_id for update;
  if not found then perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if t.queue_message_id<>m.msg_id then perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if t.status in ('succeeded','failed') then perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if not public.task_owner_available(t.id) then update public.tasks set status='failed',safe_error='RF_FORBIDDEN',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=t.id;update public.assessment_attempts set status='failed' where task_id=t.id and status='submitted';perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if not t.kind=any(p_kinds) then perform pgmq.set_vt('rolefoundry_tasks',m.msg_id,3);continue;end if;
  if (t.status='running' and t.lease_expires_at>clock_timestamp()) or t.next_run_at>clock_timestamp() then continue;end if;
  if t.attempt_count>=t.max_attempts and not exists(select 1 from public.task_erasure_grants g where g.task_id=t.id and g.active and g.request_id=t.source_ref and t.kind='account.delete') then update public.tasks set status='failed',safe_error='RF_RETRY_EXHAUSTED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=t.id;update public.assessment_attempts set status='failed' where task_id=t.id and status='submitted';perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  v_pool:=public.task_resource_pool(t.kind);
  if v_pool is null then raise exception 'RF_INVALID_INPUT';end if;
  if coalesce((v_used->>v_pool)::integer,0)>=(v_limits->>v_pool)::integer then
   v_skipped:=array_append(v_skipped,m.msg_id);continue;
  end if;
  v_used:=v_used||jsonb_build_object(v_pool,coalesce((v_used->>v_pool)::integer,0)+1);
  v_token:=gen_random_uuid();update public.tasks set status='running',attempt_count=attempt_count+1,worker_id=p_worker,lease_token=v_token,lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),heartbeat_at=clock_timestamp(),started_at=coalesce(started_at,clock_timestamp()) where id=t.id;
  insert into public.task_events(task_id,worker_id,event) values(t.id,p_worker,'task.claimed');v_result:=v_result||jsonb_build_array(jsonb_build_object('taskId',t.id,'messageId',m.msg_id::text,'kind',t.kind,'token',v_token,'leaseSeconds',p_seconds));
 end loop;
 -- Do not hide capacity-blocked work from the next acquisition or consume task attempts.
 foreach v_message in array v_skipped loop perform pgmq.set_vt('rolefoundry_tasks',v_message,0);end loop;
 return v_result;
end $function$
;
-- Retain the old RPC contract and all erasure/owner/retry semantics through one implementation.
create or replace function public.task_read(p_worker uuid,p_kinds text[],p_seconds integer default 30,p_quantity integer default 1)
returns jsonb language sql security definer set search_path='' as $$
 select public.task_read_resources(p_worker,p_kinds,p_seconds,p_quantity,null)
$$;
revoke all on function public.task_resource_pool(text),public.task_read_resources(uuid,text[],integer,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.task_read_resources(uuid,text[],integer,integer,jsonb) to service_role;
