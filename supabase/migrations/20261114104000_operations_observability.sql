-- Administrator-only metadata diagnostics; worker presence is self-reported, never authorization.
create table public.worker_instances(
 id uuid primary key,kinds text[] not null,lease_seconds integer not null,concurrency integer not null,
 state text not null check(state in ('active','draining','stopped')),started_at timestamptz not null default clock_timestamp(),last_seen_at timestamptz not null default clock_timestamp()
);
create index worker_instances_seen on public.worker_instances(last_seen_at desc);
create table public.operations_audit(
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(user_id) on delete set null,
 action text not null,resource_id uuid,created_at timestamptz not null default clock_timestamp()
);
create index operations_audit_retention on public.operations_audit(created_at);
-- Support bounded diagnostic paging without exposing raw task/event tables.
create index tasks_operations_page on public.tasks(created_at desc,id desc);
create index tasks_operations_kind_state_page on public.tasks(kind,status,created_at desc,id desc);
create index task_events_operations_page on public.task_events(task_id,id desc);
create function public.worker_report(p_worker uuid,p_kinds text[],p_seconds integer,p_concurrency integer,p_state text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_worker is null or p_seconds is null or p_seconds not between 5 and 300 or p_concurrency is null or p_concurrency not between 1 and 8 or p_state is null or p_state not in ('active','draining','stopped')
 or coalesce(cardinality(p_kinds),0) not between 1 and 20 or exists(select 1 from unnest(p_kinds) kind where kind is null or kind not in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete'))
 or cardinality(p_kinds)<>(select count(distinct kind) from unnest(p_kinds) kind) then raise exception 'RF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('workers:registry',0));
 delete from public.worker_instances where last_seen_at<clock_timestamp()-interval '30 days' or (state='stopped' and last_seen_at<clock_timestamp()-interval '7 days');
 if exists(select 1 from public.worker_instances where id=p_worker and ((state='stopped' and p_state<>'stopped') or (state='draining' and p_state='active'))) then raise exception 'RF_CONFLICT';end if;
 if not exists(select 1 from public.worker_instances where id=p_worker) and (select count(*) from public.worker_instances)>=1000 then raise exception 'RF_CONFLICT';end if;
 insert into public.worker_instances(id,kinds,lease_seconds,concurrency,state) values(p_worker,p_kinds,p_seconds,p_concurrency,p_state)
 on conflict(id) do update set kinds=p_kinds,lease_seconds=p_seconds,concurrency=p_concurrency,state=p_state,last_seen_at=clock_timestamp();
end $$;
create function public.operations_admin_lock(p_action text,p_resource uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_admin();begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_admin();
 delete from public.operations_audit where created_at<clock_timestamp()-interval '90 days';
 insert into public.operations_audit(actor_id,action,resource_id) values(u,p_action,p_resource);return u;
end $$;
create function public.operations_safe_code(p_code text) returns text language sql immutable set search_path='' as $$
 select case when p_code in ('RF_TRANSIENT','RF_FORBIDDEN','RF_STALE_INPUT','RF_CANCELED','RF_INVALID_INPUT','RF_RETRY_EXHAUSTED','RF_POISON') then p_code else null end
$$;
create function public.task_operations_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'kind',kind,'status',status,'attempts',attempt_count,'maxAttempts',max_attempts,'createdAt',created_at,'startedAt',started_at,'finishedAt',finished_at,'nextRunAt',next_run_at,'leaseExpiresAt',lease_expires_at,'heartbeatAt',heartbeat_at,'workerId',worker_id,'errorCode',public.operations_safe_code(safe_error),'resultAvailable',result_ref is not null)
 from public.tasks where id=p_id
$$;
create function public.operations_summary() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('summary.read');v_now timestamptz:=clock_timestamp();v_data jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'queued',queued,'ready',ready,'running',running,'failed24h',failed,'succeeded24h',succeeded,'retried24h',retried,'expiredLeases',expired,'oldestReadySeconds',oldest,'maxLeaseAgeSeconds',lease_age,'activeWorkers',workers) order by kind),'[]'::jsonb) into v_data
 from(select kind,
 (select count(*) from public.tasks t where t.kind=k.kind and status='queued') queued,
 (select count(*) from public.tasks t where t.kind=k.kind and status='queued' and next_run_at<=v_now) ready,
 (select count(*) from public.tasks t where t.kind=k.kind and status='running') running,
 (select count(*) from public.tasks t where t.kind=k.kind and status='failed' and finished_at>=v_now-interval '24 hours') failed,
 (select count(*) from public.tasks t where t.kind=k.kind and status='succeeded' and finished_at>=v_now-interval '24 hours') succeeded,
 (select count(*) from public.task_events e join public.tasks t on t.id=e.task_id where t.kind=k.kind and e.event='task.retry_scheduled' and e.created_at>=v_now-interval '24 hours') retried,
 (select count(*) from public.tasks t where t.kind=k.kind and status='running' and (lease_expires_at is null or lease_expires_at<=v_now)) expired,
 (select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(next_run_at))) end from public.tasks t where t.kind=k.kind and status='queued' and next_run_at<=v_now) oldest,
 (select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(coalesce(heartbeat_at,started_at,created_at)))) end from public.tasks t where t.kind=k.kind and status='running') lease_age,
 (select count(*) from public.worker_instances w where w.state='active' and w.last_seen_at>=v_now-interval '45 seconds' and k.kind=any(w.kinds)) workers
 from unnest(array['assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete']) k(kind)) counts;
 return jsonb_build_object('observedAt',v_now,'workerFreshSeconds',45,'kinds',v_data,'deliveryCount',(select count(*) from pgmq.q_rolefoundry_tasks),'poison24h',(select count(*) from public.task_events where event='queue.poison' and created_at>=v_now-interval '24 hours'));
end $$;
create function public.operations_tasks(p_kind text default null,p_status text default null,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('tasks.list');v_rows jsonb;v_last_created timestamptz;v_last_id uuid;
begin
 if (p_kind is not null and p_kind not in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete')) or (p_status is not null and p_status not in ('queued','running','succeeded','failed')) or (p_before is null)<>(p_id is null) then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(public.task_operations_json(id) order by created_at desc,id desc),'[]'::jsonb) into v_rows from(select id,created_at from public.tasks where (p_kind is null or kind=p_kind) and (p_status is null or status=p_status) and (p_before is null or (created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit 20) page;
 if jsonb_array_length(v_rows)>0 then v_last_created:=(v_rows->-1->>'createdAt')::timestamptz;v_last_id:=(v_rows->-1->>'id')::uuid;end if;
 return jsonb_build_object('data',v_rows,'next',case when exists(select 1 from public.tasks where (p_kind is null or kind=p_kind) and (p_status is null or status=p_status) and (created_at,id)<(v_last_created,v_last_id)) then jsonb_build_object('createdAt',v_last_created,'id',v_last_id) else null end);
end $$;
create function public.operations_task_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('task.read',p_id);v jsonb:=public.task_operations_json(p_id);begin if v is null then raise exception 'RF_NOT_FOUND';end if;return v;end $$;
create function public.operations_events(p_task uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('events.list',p_task);v_rows jsonb;v_last bigint;
begin
 if not exists(select 1 from public.tasks where id=p_task) then raise exception 'RF_NOT_FOUND';end if;
 if p_before is not null and p_before<1 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'event',case when event in ('task.queued','task.claimed','task.retry_scheduled','task.released','task.failed','task.succeeded','queue.poison') then event else 'event.unclassified' end,'code',public.operations_safe_code(safe_code),'createdAt',created_at,'workerId',worker_id) order by id desc),'[]'::jsonb),min(id) into v_rows,v_last
 from(select id,event,safe_code,created_at,worker_id from public.task_events where task_id=p_task and (p_before is null or id<p_before) order by id desc limit 20) page;
 return jsonb_build_object('data',v_rows,'next',case when exists(select 1 from public.task_events where task_id=p_task and id<v_last) then v_last::text else null end);
end $$;
create function public.operations_workers() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('workers.list');v_rows jsonb;v_now timestamptz:=clock_timestamp();begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kinds',kinds,'leaseSeconds',lease_seconds,'concurrency',concurrency,'reportedState',state,'observedState',case when state='stopped' then 'stopped' when last_seen_at<v_now-interval '45 seconds' then 'stale' else state end,'startedAt',started_at,'lastSeenAt',last_seen_at) order by last_seen_at desc,id),'[]'::jsonb) into v_rows from(select * from public.worker_instances order by last_seen_at desc,id limit 100) page;
 return jsonb_build_object('observedAt',v_now,'data',v_rows,'truncated',(select count(*)>100 from public.worker_instances));
end $$;
alter table public.worker_instances enable row level security;
alter table public.operations_audit enable row level security;
revoke all on public.worker_instances,public.operations_audit from public,anon,authenticated;
grant all on public.worker_instances,public.operations_audit to service_role;
do $$ declare r record;begin
 for r in select oid::regprocedure name from pg_proc where pronamespace='public'::regnamespace and (proname like 'operations\_%' escape '\' or proname in ('worker_report','task_operations_json')) loop
 execute format('revoke all on function %s from public,anon,authenticated',r.name);execute format('grant execute on function %s to service_role',r.name);end loop;
end $$;
grant execute on function public.operations_summary(),public.operations_tasks(text,text,timestamptz,uuid),public.operations_task_find(uuid),public.operations_events(uuid,bigint),public.operations_workers() to authenticated;
