-- An accepted erasure request outlives its Auth/profile subject and authorizes only that erasure task.
create table public.task_erasure_grants(
 task_id uuid primary key references public.tasks(id) on delete cascade,subject_id uuid not null,request_id uuid not null,
 active boolean not null default true,failures integer not null default 0 check(failures>=0)
);
create table public.account_deletions(
 id uuid primary key,subject_id uuid not null unique,receipt_hash text,contact_hash text,invitation_ids uuid[] not null default '{}',
 task_id uuid references public.tasks(id) on delete set null,
 phase text not null default 'queued' check(phase in ('queued','cleaning-files','removing-account','completed')),
 requested_at timestamptz not null default clock_timestamp(),completed_at timestamptz
);
create table public.account_deletion_events(
 id bigint generated always as identity primary key,request_id uuid not null references public.account_deletions(id) on delete cascade,
 task_id uuid,event text not null,actor_id uuid references public.profiles(user_id) on delete set null,created_at timestamptz not null default clock_timestamp()
);
create index account_deletion_events_request on public.account_deletion_events(request_id,id);
alter table public.tasks drop constraint tasks_user_id_fkey;
alter table public.tasks alter column user_id drop not null;
alter table public.tasks add constraint tasks_owner_required check(user_id is not null or kind='account.delete');
alter table public.tasks add constraint tasks_user_id_fkey foreign key(user_id) references public.profiles(user_id) on delete set null;
create function public.task_preserve_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||old.user_id::text,0));
 delete from public.tasks t where t.user_id=old.user_id and not (t.kind='account.delete' and exists(select 1 from public.task_erasure_grants g where g.task_id=t.id and g.subject_id=old.user_id and g.request_id=t.source_ref));
 return old;
end $$;
create trigger task_preserve_erasure before delete on public.profiles for each row execute function public.task_preserve_erasure();
create function public.task_owner_available(p_task uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(case when t.kind='account.delete' then exists(select 1 from public.task_erasure_grants g where g.task_id=t.id and g.request_id=t.source_ref and g.active and (t.user_id is null or g.subject_id=t.user_id)) else public.identity_is_active(t.user_id) end,false) from public.tasks t where t.id=p_task
$$;
create or replace function public.identity_is_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when auth.role()='authenticated' and p_user is distinct from auth.uid() then false
 else exists(select 1 from public.profiles p where p.user_id=p_user and p.status='active') and not exists(select 1 from public.account_deletions d where d.subject_id=p_user) end
$$;
create function public.account_deletion_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'status',case when d.phase='completed' then 'completed' when t.id is null or t.status='failed' then 'needs-attention' else d.phase end,'requestedAt',d.requested_at,'completedAt',d.completed_at,'retryAt',case when t.status='queued' then t.next_run_at else null end,'failures',coalesce(g.failures,0))
 from public.account_deletions d left join public.tasks t on t.id=d.task_id left join public.task_erasure_grants g on g.task_id=t.id where d.id=p_id
$$;
create function public.account_deletion_status(p_id uuid,p_secret text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or coalesce(p_secret,'')!~'^[a-f0-9]{64}$' or not exists(select 1 from public.account_deletions where id=p_id and receipt_hash=encode(extensions.digest(p_secret,'sha256'),'hex')) then raise exception 'RF_NOT_FOUND';end if;
 return public.account_deletion_json(p_id);
end $$;
create function public.account_deletion_request(p_id uuid,p_secret text,p_confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_user();v_task uuid;v_contact text;
begin
 if p_id is null or coalesce(p_secret,'')!~'^[a-f0-9]{64}$' or p_confirmation is distinct from 'DELETE' then raise exception 'RF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_user();
 if exists(select 1 from public.account_deletions where id=p_id or subject_id=u) then raise exception 'RF_CONFLICT';end if;
 select public.identity_email_hash(email) into v_contact from auth.users where id=u;
 perform public.task_cancel_for_user(u);
 v_task:=public.task_enqueue(u,'account.delete',p_id,'deletion-v1',p_id::text,'deletion-v1');
 insert into public.account_deletions(id,subject_id,receipt_hash,contact_hash,invitation_ids,task_id) values(p_id,u,encode(extensions.digest(p_secret,'sha256'),'hex'),v_contact,array(select id from public.invitations where used_by=u),v_task);
 insert into public.task_erasure_grants(task_id,subject_id,request_id) values(v_task,u,p_id);
 perform public.identity_deactivate_profile(u);
 update public.resume_storage_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())) where user_id=u or split_part(object_key,'/',1)=u::text;
 update public.account_export_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())) where user_id=u or split_part(object_key,'/',1)=u::text;
 insert into public.account_deletion_events(request_id,task_id,event,actor_id) values(p_id,v_task,'deletion.requested',u);
 return public.account_deletion_json(p_id);
end $$;
create function public.account_deletion_lock(p_task uuid,p_token uuid) returns public.account_deletions language plpgsql security definer set search_path='' as $$
declare d public.account_deletions%rowtype;t public.tasks%rowtype;
begin
 select * into d from public.account_deletions where task_id=p_task;if not found then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||d.subject_id::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not found or t.kind<>'account.delete' or t.input_version is distinct from 'deletion-v1' or t.source_ref<>d.id or t.status<>'running' or p_token is null or t.lease_token is distinct from p_token or t.lease_expires_at is null or t.lease_expires_at<=clock_timestamp() or not public.task_owner_available(t.id) or not exists(select 1 from public.task_erasure_grants g where g.task_id=t.id and g.active and g.request_id=d.id and g.subject_id=d.subject_id) then raise exception 'RF_CONFLICT';end if;
 if d.phase='completed' then raise exception 'RF_CONFLICT';end if;return d;
end $$;
create function public.account_deletion_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.account_deletions:=public.account_deletion_lock(p_task,p_token);
begin return jsonb_build_object('id',d.id,'subjectId',d.subject_id,'phase',d.phase);end $$;
create function public.account_deletion_files(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.account_deletions:=public.account_deletion_lock(p_task,p_token);v jsonb;
begin
 if d.phase='queued' then update public.account_deletions set phase='cleaning-files' where id=d.id;insert into public.account_deletion_events(request_id,task_id,event) values(d.id,p_task,'deletion.cleaning-files');end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'key',name)),'[]'::jsonb) into v from(
 select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports') and split_part(o.name,'/',1)=d.subject_id::text
 and not exists(select 1 from public.resume_storage_objects r where r.object_key=o.name and o.bucket_id='rolefoundry-resumes' and r.purge_after>clock_timestamp())
 and not exists(select 1 from public.account_export_objects r where r.object_key=o.name and o.bucket_id='rolefoundry-account-exports' and r.purge_after>clock_timestamp()) order by o.bucket_id,o.name limit 50) page;
 return v;
end $$;
create function public.account_deletion_begin_auth(p_task uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.account_deletions:=public.account_deletion_lock(p_task,p_token);
begin
 if exists(select 1 from public.resume_storage_objects where user_id=d.subject_id or split_part(object_key,'/',1)=d.subject_id::text)
 or exists(select 1 from public.account_export_objects where user_id=d.subject_id or split_part(object_key,'/',1)=d.subject_id::text)
 or exists(select 1 from storage.objects where bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports') and split_part(name,'/',1)=d.subject_id::text) then return false;end if;
 -- Unexpected ownership outside the application's canonical prefix requires operator review.
 if exists(select 1 from storage.objects where owner_id=d.subject_id::text) then raise exception 'RF_CONFLICT';end if;
 delete from public.invitations where used_by=d.subject_id or id=any(d.invitation_ids);
 delete from public.identity_otp_requests where email_hash=d.contact_hash and requested_at<=d.requested_at;
 update public.identity_audit set reason=null where actor_id=d.subject_id or subject_id=d.subject_id;
 update public.assessment_audit set reason=null where actor_id=d.subject_id;
 update public.dictionary_audit set reason='Account removed' where actor_id=d.subject_id;
 update public.course_audit set reason='Account removed' where actor_id=d.subject_id;
 if d.phase<>'removing-account' then update public.account_deletions set phase='removing-account' where id=d.id;insert into public.account_deletion_events(request_id,task_id,event) values(d.id,p_task,'deletion.removing-account');end if;
 return true;
end $$;
create function public.account_deletion_defer(p_task uuid,p_token uuid,p_seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare d public.account_deletions:=public.account_deletion_lock(p_task,p_token);v_message bigint;
begin
 if p_seconds is null or p_seconds not between 1 and 60 then raise exception 'RF_INVALID_INPUT';end if;
 update public.tasks set status='queued',attempt_count=greatest(0,attempt_count-1),worker_id=null,lease_token=null,lease_expires_at=null,next_run_at=clock_timestamp()+make_interval(secs=>p_seconds) where id=p_task returning queue_message_id into v_message;
 perform pgmq.set_vt('rolefoundry_tasks',v_message,p_seconds);insert into public.task_events(task_id,event) values(p_task,'task.deferred');
end $$;
create function public.account_deletion_finish(p_task uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.account_deletions:=public.account_deletion_lock(p_task,p_token);
begin
 if d.phase<>'removing-account' or exists(select 1 from auth.users where id=d.subject_id) or exists(select 1 from public.profiles where user_id=d.subject_id)
 or exists(select 1 from public.resume_storage_objects where user_id=d.subject_id or split_part(object_key,'/',1)=d.subject_id::text)
 or exists(select 1 from public.account_export_objects where user_id=d.subject_id or split_part(object_key,'/',1)=d.subject_id::text)
 or exists(select 1 from storage.objects where split_part(name,'/',1)=d.subject_id::text and bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports')) then raise exception 'RF_CONFLICT';end if;
 update public.account_deletions set phase='completed',completed_at=clock_timestamp(),contact_hash=null,invitation_ids='{}' where id=d.id;
 update public.task_erasure_grants set active=false where task_id=p_task;
 update public.tasks set user_id=null,status='succeeded',result_ref=d.id,finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=p_task;
 insert into public.task_events(task_id,event) values(p_task,'task.succeeded');insert into public.account_deletion_events(request_id,task_id,event) values(d.id,p_task,'deletion.completed');
end $$;
create function public.account_deletion_late_files() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;v jsonb;begin
 select d.subject_id into u from public.account_deletions d where d.phase='completed' and exists(select 1 from storage.objects o where o.bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports') and split_part(o.name,'/',1)=d.subject_id::text) order by d.completed_at,d.id limit 1;
 if u is null then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'key',name)),'[]'::jsonb) into v from(select bucket_id,name from storage.objects where bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports') and split_part(name,'/',1)=u::text order by bucket_id,name limit 50) page;
 return jsonb_build_array(jsonb_build_object('subjectId',u,'files',v));
end $$;
create function public.account_deletion_admin_find(p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_admin();v_id uuid;begin
 select request_id into v_id from public.task_erasure_grants where task_id=p_task;if v_id is null then raise exception 'RF_NOT_FOUND';end if;return public.account_deletion_json(v_id);
end $$;
create function public.account_deletion_resume(p_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.account_deletions%rowtype;v_actor uuid;v_task uuid;v_message bigint;v_failures integer;
begin
 if auth.role() is distinct from 'service_role' then v_actor:=public.identity_require_admin();end if;
 if p_reason is null or p_reason not in ('storage-restored','directory-restored','configuration-restored','operator-reviewed') then raise exception 'RF_INVALID_INPUT';end if;
 select * into d from public.account_deletions where id=p_id;if not found then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||d.subject_id::text,0));select * into d from public.account_deletions where id=p_id for update;
 if d.phase='completed' or exists(select 1 from public.tasks where id=d.task_id and status<>'failed') then raise exception 'RF_CONFLICT';end if;
 select failures into v_failures from public.task_erasure_grants where task_id=d.task_id;
 update public.task_erasure_grants set active=false where task_id=d.task_id;
 insert into public.tasks(user_id,kind,source_ref,input_version,idempotency_key,request_hash) values((select user_id from public.profiles where user_id=d.subject_id),'account.delete',d.id,'deletion-v1',gen_random_uuid()::text,'deletion-v1') returning id into v_task;
 insert into public.task_erasure_grants(task_id,subject_id,request_id,failures) values(v_task,d.subject_id,d.id,coalesce(v_failures,0));
 select pgmq.send('rolefoundry_tasks',jsonb_build_object('taskId',v_task)) into v_message;update public.tasks set queue_message_id=v_message where id=v_task;
 update public.account_deletions set task_id=v_task where id=d.id;insert into public.task_events(task_id,event) values(v_task,'task.queued');
 insert into public.account_deletion_events(request_id,task_id,event,actor_id) values(d.id,v_task,'deletion.resumed:'||p_reason,v_actor);return public.account_deletion_json(d.id);
end $$;

CREATE OR REPLACE FUNCTION public.task_read(p_worker uuid, p_kinds text[], p_seconds integer DEFAULT 30, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record;t public.tasks%rowtype;v_token uuid;v_result jsonb:='[]'::jsonb;v_task_id uuid;v_scan integer;
begin
 if p_worker is null or p_seconds is null or p_seconds not between 5 and 300 or p_quantity is null or p_quantity not between 1 and 8 or coalesce(cardinality(p_kinds),0) not between 1 and 20 then raise exception 'RF_INVALID_INPUT';end if;
 -- Skip terminal/poison deliveries without mistaking them for an empty queue.
 -- Read one at a time so unclaimed work is never hidden by an over-sized batch.
 for v_scan in 1..64 loop
  exit when jsonb_array_length(v_result)>=p_quantity;
  select * into m from pgmq.read('rolefoundry_tasks',p_seconds,1);
  exit when not found;
  if jsonb_typeof(m.message) is distinct from 'object' or not m.message?'taskId' or m.message->>'taskId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or (select count(*) from jsonb_object_keys(m.message))<>1 then
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
  v_token:=gen_random_uuid();update public.tasks set status='running',attempt_count=attempt_count+1,worker_id=p_worker,lease_token=v_token,lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),heartbeat_at=clock_timestamp(),started_at=coalesce(started_at,clock_timestamp()) where id=t.id;
  insert into public.task_events(task_id,worker_id,event) values(t.id,p_worker,'task.claimed');v_result:=v_result||jsonb_build_array(jsonb_build_object('taskId',t.id,'messageId',m.msg_id::text,'kind',t.kind,'token',v_token,'leaseSeconds',p_seconds));
 end loop;return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION public.task_heartbeat(p_task uuid, p_token uuid, p_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_message bigint;
begin if p_seconds is null or p_seconds not between 5 and 300 then raise exception 'RF_INVALID_INPUT';end if;
 update public.tasks t set lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),heartbeat_at=clock_timestamp() where id=p_task and lease_token=p_token and status='running' and lease_expires_at>clock_timestamp() and public.task_owner_available(t.id) returning queue_message_id into v_message;
 if not found then return false;end if;perform pgmq.set_vt('rolefoundry_tasks',v_message,p_seconds);return true;end $function$
;

CREATE OR REPLACE FUNCTION public.task_cancel_for_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 update public.tasks set status='failed',safe_error='RF_FORBIDDEN',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null,worker_id=null where user_id=p_user and status in ('queued','running') and not(kind='account.delete' and exists(select 1 from public.task_erasure_grants g where g.task_id=public.tasks.id and g.active and g.subject_id=p_user and g.request_id=public.tasks.source_ref));
 update public.assessment_attempts set status='failed' where user_id=p_user and status in ('draft','submitted');
end $function$
;

CREATE OR REPLACE FUNCTION public.task_fail(p_task uuid, p_token uuid, p_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tasks%rowtype;v_delay integer;v_error text;v_user uuid;
begin
 if p_category is null or p_category not in ('infrastructure','timeout','validation','forbidden','stale','canceled') then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(t0.user_id,g.subject_id) into v_user from public.tasks t0 left join public.task_erasure_grants g on g.task_id=t0.id where t0.id=p_task;if v_user is null then return jsonb_build_object('status','missing');end if;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 select * into t from public.tasks where id=p_task for update;if not found then return jsonb_build_object('status','missing');end if;
 if t.status in ('succeeded','failed') then return jsonb_build_object('status',t.status);end if;
 if t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then return jsonb_build_object('status','lease_lost');end if;
 if p_category in ('infrastructure','timeout') and t.kind='account.delete' and public.task_owner_available(t.id) then
  update public.task_erasure_grants set failures=failures+1 where task_id=t.id returning least(3600,5*power(2,least(failures-1,10))::integer) into v_delay;
  update public.tasks set status='queued',safe_error='RF_TRANSIENT',worker_id=null,lease_token=null,lease_expires_at=null,next_run_at=clock_timestamp()+make_interval(secs=>v_delay) where id=t.id;
  perform pgmq.set_vt('rolefoundry_tasks',t.queue_message_id,v_delay);insert into public.task_events(task_id,event,safe_code) values(t.id,'task.retry_scheduled','RF_TRANSIENT');return jsonb_build_object('status','queued');
 end if;
 if p_category in ('infrastructure','timeout') and t.attempt_count<t.max_attempts and public.identity_is_active(t.user_id) then
  v_delay:=power(2,t.attempt_count-1)::integer+floor(random()*2)::integer;
  update public.tasks set status='queued',safe_error='RF_TRANSIENT',worker_id=null,lease_token=null,lease_expires_at=null,next_run_at=clock_timestamp()+make_interval(secs=>v_delay) where id=p_task;
  perform pgmq.set_vt('rolefoundry_tasks',t.queue_message_id,v_delay);insert into public.task_events(task_id,event,safe_code) values(p_task,'task.retry_scheduled','RF_TRANSIENT');return jsonb_build_object('status','queued');
 end if;
 v_error:=case p_category when 'forbidden' then 'RF_FORBIDDEN' when 'stale' then 'RF_STALE_INPUT' when 'canceled' then 'RF_CANCELED' when 'validation' then 'RF_INVALID_INPUT' else 'RF_RETRY_EXHAUSTED' end;
 update public.tasks set status='failed',safe_error=v_error,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null where id=p_task;
 update public.assessment_attempts set status='failed' where task_id=p_task and status='submitted';
 if t.kind='account.delete' then update public.task_erasure_grants set failures=failures+1 where task_id=t.id;end if;
 insert into public.task_events(task_id,event,safe_code) values(p_task,'task.failed',v_error);return jsonb_build_object('status','failed');
end $function$
;

CREATE OR REPLACE FUNCTION public.task_fail_after(p_task uuid, p_token uuid, p_category text, p_retry_after integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid;t public.tasks%rowtype;v_owned boolean;v_result jsonb;v_next timestamptz;
begin
 if p_task is null or p_token is null or p_category is null or p_category not in ('infrastructure','timeout','validation','forbidden','stale','canceled') or p_retry_after is null or p_retry_after not between 0 and 86400 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(t0.user_id,g.subject_id) into u from public.tasks t0 left join public.task_erasure_grants g on g.task_id=t0.id where t0.id=p_task;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.task_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',id,'kind',kind,'status',status,'attempts',attempt_count,'maxAttempts',max_attempts,'retryPolicy',case when kind='account.delete' and exists(select 1 from public.task_erasure_grants g where g.task_id=public.tasks.id and g.request_id=public.tasks.source_ref) then 'until-complete' else 'bounded' end,'createdAt',created_at,'startedAt',started_at,'finishedAt',finished_at,'leaseExpiresAt',lease_expires_at,'resultRef',result_ref,'errorCode',safe_error) from public.tasks where id=p_id
$function$
;

CREATE OR REPLACE FUNCTION public.task_operations_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',id,'kind',kind,'status',status,'attempts',attempt_count,'maxAttempts',max_attempts,'retryPolicy',case when kind='account.delete' and exists(select 1 from public.task_erasure_grants g where g.task_id=public.tasks.id and g.request_id=public.tasks.source_ref) then 'until-complete' else 'bounded' end,'createdAt',created_at,'startedAt',started_at,'finishedAt',finished_at,'nextRunAt',next_run_at,'leaseExpiresAt',lease_expires_at,'heartbeatAt',heartbeat_at,'workerId',worker_id,'errorCode',public.operations_safe_code(safe_error),'resultAvailable',result_ref is not null)
 from public.tasks where id=p_id
$function$
;

CREATE OR REPLACE FUNCTION public.identity_activate()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := auth.uid(); v_email text; v_inv public.invitations%rowtype; v_profile public.profiles%rowtype;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then raise exception 'RF_UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:' || v_user::text, 0));
  select u.email into v_email from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'RF_UNAUTHORIZED'; end if;
  select * into v_profile from public.profiles p where p.user_id = v_user;
  if found then
    if v_profile.status <> 'active' or exists(select 1 from public.account_deletions where subject_id=v_user) then raise exception 'RF_FORBIDDEN'; end if;
    return jsonb_build_object('userId', v_user, 'role', v_profile.role);
  end if;
  select * into v_inv from public.invitations i where i.email_hash = public.identity_email_hash(v_email) for update;
  if not found or v_inv.used_at is not null or v_inv.expires_at <= clock_timestamp() then raise exception 'RF_INVITATION_REQUIRED'; end if;
  update public.invitations set used_at = clock_timestamp(), used_by = v_user where id = v_inv.id and used_at is null;
  insert into public.profiles(user_id) values(v_user);
  insert into public.identity_audit(actor_id, subject_id, action, resource_id) values(v_user, v_user, 'invitation.redeemed', v_inv.id);
  return jsonb_build_object('userId', v_user, 'role', 'member');
end $function$
;

do $$ declare t text;begin foreach t in array array['account_deletions','account_deletion_events','task_erasure_grants'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
do $$ declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'account_deletion_%' or proname in ('task_owner_available','task_preserve_erasure')) loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);end loop;end $$;
grant execute on function public.account_deletion_status(uuid,text) to anon,authenticated;
grant execute on function public.account_deletion_request(uuid,text,text),public.account_deletion_resume(uuid,text),public.account_deletion_admin_find(uuid) to authenticated;

create or replace function public.operations_events(p_task uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('events.list',p_task);v_rows jsonb;v_last bigint;
begin
 if not exists(select 1 from public.tasks where id=p_task) then raise exception 'RF_NOT_FOUND';end if;
 if p_before is not null and p_before<1 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'event',case when event in ('task.queued','task.deferred','task.claimed','task.retry_scheduled','task.released','task.failed','task.succeeded','queue.poison') then event else 'event.unclassified' end,'code',public.operations_safe_code(safe_code),'createdAt',created_at,'workerId',worker_id) order by id desc),'[]'::jsonb),min(id) into v_rows,v_last
 from(select id,event,safe_code,created_at,worker_id from public.task_events where task_id=p_task and (p_before is null or id<p_before) order by id desc limit 20) page;
 return jsonb_build_object('data',v_rows,'next',case when exists(select 1 from public.task_events where task_id=p_task and id<v_last) then v_last::text else null end);
end $$;
