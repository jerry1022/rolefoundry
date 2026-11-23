-- Domain-authorized recovery creates a new task; old attempts/messages are never reset.
create table public.task_replays(
 request_id uuid primary key,previous_task_id uuid not null unique references public.tasks(id) on delete cascade,
 task_id uuid references public.tasks(id) on delete set null,actor_id uuid references public.profiles(user_id) on delete set null,
 reason text not null check(reason in ('configuration-restored','storage-restored','directory-restored','operator-reviewed')),
 created_at timestamptz not null default clock_timestamp()
);
create index tasks_replay_history on public.tasks(user_id,kind,source_ref);
alter table public.task_replays enable row level security;
revoke all on public.task_replays from public,anon,authenticated,service_role;
grant select on public.task_replays to service_role;

-- Private domain adapters validate the last accepted input and bind only its new execution.
-- The coordinator holds producer/dictionary/course/owner locks before invoking these helpers.
create function public.assessment_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;a public.assessment_attempts%rowtype;answers jsonb;
begin
 select * into t from public.tasks where id=p_previous;
 select * into a from public.assessment_attempts where id=t.source_ref and user_id=t.user_id for update;
 if not found or a.status<>'failed' or a.task_id is distinct from t.id or a.revision::text is distinct from t.input_version
 or exists(select 1 from public.assessment_results where attempt_id=a.id) then raise exception 'RF_STALE_INPUT';end if;
 select coalesce(jsonb_object_agg(r.attempt_item_id::text,r.answer_index),'{}'::jsonb) into answers from public.responses r join public.attempt_items i on i.id=r.attempt_item_id where i.attempt_id=a.id;
 perform public.assessment_validate_answers(a.id,answers,true);
 if p_next is not null then
  update public.assessment_attempts set task_id=p_next,status='submitted',revision=revision+1 where id=a.id;
  insert into public.assessment_audit(actor_id,action,resource_id) values(auth.uid(),'assessment.admin_replay',a.id);
 end if;return (a.revision+1)::text;
end $$;
create function public.matching_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;r public.match_runs%rowtype;
begin
 select * into t from public.tasks where id=p_previous;
 select * into r from public.match_runs where id=t.source_ref and user_id=t.user_id for update;
 if not found or r.task_id is distinct from t.id or r.status<>'queued' or r.input_hash is distinct from t.input_version
 or r.input_snapshot is null or md5(r.input_snapshot::text)<>r.input_hash or not coalesce(public.matching_inputs_current(r.id),false)
 or exists(select 1 from public.match_results where run_id=r.id) then raise exception 'RF_STALE_INPUT';end if;
 if p_next is not null then update public.match_runs set task_id=p_next where id=r.id;insert into public.match_audit(actor_id,run_id,action) values(auth.uid(),r.id,'run.admin_replay');end if;
 return r.input_hash;
end $$;
create function public.learning_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;r public.learning_plans%rowtype;
begin
 select * into t from public.tasks where id=p_previous;
 select * into r from public.learning_plans where id=t.source_ref and user_id=t.user_id for update;
 if not found or r.task_id is distinct from t.id or r.status<>'queued' or r.output is not null or r.input_hash is distinct from t.input_version
 or r.input_snapshot is null or md5(r.input_snapshot::text)<>r.input_hash or not coalesce(public.learning_inputs_current(r.id),false)
 or exists(select 1 from public.learning_steps where plan_id=r.id) then raise exception 'RF_STALE_INPUT';end if;
 if p_next is not null then update public.learning_plans set task_id=p_next where id=r.id;end if;return r.input_hash;
end $$;
create function public.resume_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;d public.resume_documents%rowtype;p public.revision_proposals%rowtype;e public.resume_exports%rowtype;v_hash text;
begin
 select * into t from public.tasks where id=p_previous;
 if t.kind='resume.parse' then
  select * into d from public.resume_documents where id=t.source_ref and user_id=t.user_id and deleted_at is null for update;
  if not found or d.parse_task_id is distinct from t.id or d.status<>'queued' or d.source_hash is null or d.source_hash is distinct from t.input_version or d.current_version<>0 or d.draft is not null
  or (d.source_kind='file' and not exists(select 1 from public.resume_storage_objects r join storage.objects o on o.bucket_id='rolefoundry-resumes' and o.name=r.object_key where r.document_id=d.id and r.user_id=d.user_id and r.object_key=d.source_key and r.kind='source' and r.purge_after is null and r.cleanup_token is null))
  or (d.source_kind='text' and (d.source_text is null or md5(jsonb_build_object('text',d.source_text)::text)<>d.source_hash)) then raise exception 'RF_STALE_INPUT';end if;
  v_hash:=d.source_hash;
  if p_next is not null then update public.resume_documents set parse_task_id=p_next,processing_error=null,revision=revision+1 where id=d.id;end if;
 elsif t.kind='resume.revise' then
  select p1.* into p from public.revision_proposals p1 join public.resume_documents d1 on d1.id=p1.document_id where p1.id=t.source_ref and d1.user_id=t.user_id and d1.deleted_at is null for update of p1;
  if not found or p.task_id is distinct from t.id or p.status<>'queued' or p.output is not null or p.input_hash is distinct from t.input_version or md5(p.input_snapshot::text)<>p.input_hash or not public.resume_proposal_current(p.id) then raise exception 'RF_STALE_INPUT';end if;
  v_hash:=p.input_hash;if p_next is not null then update public.revision_proposals set task_id=p_next where id=p.id;end if;
 elsif t.kind='resume.export' then
  select e1.* into e from public.resume_exports e1 join public.resume_documents d1 on d1.id=e1.document_id where e1.id=t.source_ref and d1.user_id=t.user_id and d1.deleted_at is null for update of e1;
  if not found or e.task_id is distinct from t.id or e.object_key is not null or e.input_hash is distinct from t.input_version or public.resume_version_json(e.version_id) is null or md5(public.resume_version_json(e.version_id)::text)<>e.input_hash then raise exception 'RF_STALE_INPUT';end if;
  v_hash:=e.input_hash;if p_next is not null then update public.resume_exports set task_id=p_next,processing_error=null where id=e.id;end if;
 else raise exception 'RF_INVALID_INPUT';end if;
 if p_next is not null then insert into public.resume_audit(actor_id,resource_id,action) values(auth.uid(),t.source_ref,'resume.admin_replay');end if;return v_hash;
end $$;
create function public.ingestion_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;b public.import_batches%rowtype;r public.ingestion_feed_runs%rowtype;f public.ingestion_feed_settings%rowtype;policy jsonb;
begin
 select * into t from public.tasks where id=p_previous;
 if not exists(select 1 from public.profiles where user_id=t.user_id and status='active' and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 if t.kind='catalog.import' then
  select * into b from public.import_batches where id=t.source_ref for update;policy:=public.ingestion_source_json(b.source_id);
  if not found or b.created_by is distinct from t.user_id or b.task_id is distinct from t.id or b.input_hash is distinct from t.input_version or b.stage<>'queued' or b.output is not null
   or b.source_fingerprint is distinct from policy->>'fingerprint' or policy->>'status' is distinct from 'active'
   or (b.context_snapshot is not null and b.context_snapshot is distinct from public.ingestion_context(b.id))
   or exists(select 1 from public.review_items where batch_id=b.id) then raise exception 'RF_STALE_INPUT';end if;
  perform public.ingestion_require_mode(b.source_id,b.input_origin);
  if p_next is not null then update public.import_batches set task_id=p_next where id=b.id;end if;
 elsif t.kind='catalog.fetch' then
  select * into r from public.ingestion_feed_runs where id=t.source_ref for update;
  select * into f from public.ingestion_feed_settings where source_id=r.source_id for update;policy:=public.ingestion_source_json(r.source_id);
  if r.id is null or f.source_id is null or r.created_by is distinct from t.user_id or r.task_id is distinct from t.id or r.input_hash is distinct from t.input_version or r.batch_id is not null
   or r.source_fingerprint is distinct from policy->>'fingerprint' or policy->>'status' is distinct from 'active' or not f.enabled or f.manual_pause or f.pause_until>clock_timestamp()
   or f.revision<>r.settings_revision or f.feed_id is distinct from r.feed_id or f.feed_revision is distinct from r.feed_revision
   or exists(select 1 from public.ingestion_feed_runs x join public.tasks pending on pending.id=x.task_id where x.source_id=r.source_id and x.id<>r.id and pending.status in ('queued','running')) then raise exception 'RF_STALE_INPUT';end if;
  perform public.ingestion_require_mode(r.source_id,'feed');
  if p_next is not null then update public.ingestion_feed_runs set task_id=p_next,last_error=null where id=r.id;end if;
 else raise exception 'RF_INVALID_INPUT';end if;
 if p_next is not null then insert into public.ingestion_audit(actor_id,resource_id,action) values(auth.uid(),t.source_ref,'task.admin_replay');end if;return t.input_version;
end $$;
create function public.account_export_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;e public.account_exports%rowtype;f jsonb;
begin
 select * into t from public.tasks where id=p_previous;
 select * into e from public.account_exports where id=t.source_ref and user_id=t.user_id for update;
 if not found or e.task_id is distinct from t.id or e.payload is null or e.invalidated_at is not null or e.expires_at<=clock_timestamp() or e.object_key is not null or t.input_version<>'account-v1' then raise exception 'RF_STALE_INPUT';end if;
 -- Do not recreate a snapshot or extend its expiry; all sealed source bytes must still be retained.
 for f in select value from jsonb_array_elements(e.payload->'files') loop
  if not exists(select 1 from public.resume_storage_objects r join storage.objects o on o.bucket_id='rolefoundry-resumes' and o.name=r.object_key where r.object_key=f->>'key' and r.user_id=t.user_id and r.purge_after is null and r.cleanup_token is null) then raise exception 'RF_STALE_INPUT';end if;
 end loop;
 if p_next is not null then update public.account_exports set task_id=p_next where id=e.id;insert into public.identity_audit(actor_id,subject_id,action,resource_id) values(auth.uid(),t.user_id,'account.export_admin_replay',e.id);end if;return t.input_version;
end $$;
create function public.task_replay_binding(p_previous uuid,p_next uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare kind text;begin
 select t.kind into kind from public.tasks t where id=p_previous;
 case
 when kind='assessment.grade' then return public.assessment_replay_binding(p_previous,p_next);
 when kind='matches.refresh' then return public.matching_replay_binding(p_previous,p_next);
 when kind='learning.plan' then return public.learning_replay_binding(p_previous,p_next);
 when kind in ('resume.parse','resume.revise','resume.export') then return public.resume_replay_binding(p_previous,p_next);
 when kind in ('catalog.import','catalog.fetch') then return public.ingestion_replay_binding(p_previous,p_next);
 when kind='account.export' then return public.account_export_replay_binding(p_previous,p_next);
 when kind='account.delete' then
  if not exists(select 1 from public.account_deletions d join public.task_erasure_grants g on g.task_id=d.task_id where d.task_id=p_previous and d.id=(select source_ref from public.tasks where id=p_previous) and g.request_id=d.id and g.subject_id=d.subject_id and d.phase<>'completed') then raise exception 'RF_STALE_INPUT';end if;
  return 'deletion-v1';
 else raise exception 'RF_INVALID_INPUT';end case;
end $$;
create function public.operations_replay_lock(p_task uuid) returns public.tasks language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_admin();owner uuid;t public.tasks%rowtype;subject uuid;
begin
 -- Fetch row and owner separately; record authority is rechecked after the ordered locks.
 select * into t from public.tasks where id=p_task;if not found then raise exception 'RF_NOT_FOUND';end if;
 select coalesce(t.user_id,(select subject_id from public.task_erasure_grants where task_id=t.id)) into owner;
 if t.kind in ('catalog.import','catalog.fetch') then perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));else perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 if t.kind in ('catalog.import','catalog.fetch') then perform pg_advisory_xact_lock(hashtextextended('courses:write',0));else perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));end if;
 for subject in select distinct x from unnest(array[u,owner]) x where x is not null order by x loop perform pg_advisory_xact_lock(hashtextextended('identity:'||subject::text,0));end loop;
 perform public.identity_require_admin();select * into t from public.tasks where id=p_task for update;if not found then raise exception 'RF_NOT_FOUND';end if;return t;
end $$;
create function public.operations_replay_check(p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;v_next uuid;v_feed jsonb;
begin
 select * into t from public.tasks where id=p_task;
 select task_id into v_next from public.task_replays where previous_task_id=t.id;
 if found then return jsonb_build_object('available',false,'reason','already-replayed','nextTaskId',v_next,'feed',null);end if;
 if t.status<>'failed' or t.result_ref is not null then return jsonb_build_object('available',false,'reason','not-terminal','nextTaskId',null,'feed',null);end if;
 if t.kind<>'account.delete' then
  if t.safe_error is distinct from 'RF_RETRY_EXHAUSTED' then return jsonb_build_object('available',false,'reason','permanent','nextTaskId',null,'feed',null);end if;
  if not exists(select 1 from public.profiles where user_id=t.user_id and status='active') or exists(select 1 from public.account_deletions where subject_id=t.user_id) then return jsonb_build_object('available',false,'reason','owner-unavailable','nextTaskId',null,'feed',null);end if;
  if (select count(*) from public.tasks where user_id=t.user_id and (status in ('queued','running')) )>=20 or (select count(*) from public.tasks where user_id=t.user_id and kind=t.kind and source_ref=t.source_ref)>=5 then return jsonb_build_object('available',false,'reason','limit','nextTaskId',null,'feed',null);end if;
 end if;
 begin perform public.task_replay_binding(t.id);
 exception when raise_exception then
  if sqlerrm in ('RF_STALE_INPUT','RF_CONFLICT','RF_FORBIDDEN','RF_INVALID_INPUT','RF_NOT_FOUND') then return jsonb_build_object('available',false,'reason','source-stale','nextTaskId',null,'feed',null);end if;raise;
 end;
 if t.kind='catalog.fetch' then
  select jsonb_build_object('id',r.feed_id,'revision',r.feed_revision,'kind',s.kind) into v_feed from public.ingestion_feed_runs r join public.sources s on s.id=r.source_id where r.id=t.source_ref;
 end if;
 return jsonb_build_object('available',true,'reason',null,'nextTaskId',null,'feed',v_feed);
end $$;
create function public.operations_replay_context(p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.operations_replay_lock(p_task);
begin
 insert into public.operations_audit(actor_id,action,resource_id) values(auth.uid(),'replay.inspect',t.id);
 return public.operations_replay_check(t.id);
end $$;
create function public.operations_task_replay(p_task uuid,p_request uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.operations_replay_lock(p_task);r public.task_replays%rowtype;v_context jsonb;v_next uuid;v_version text;v_message bigint;v_request uuid;
begin
 if p_request is null or p_reason is null or p_reason not in ('configuration-restored','storage-restored','directory-restored','operator-reviewed') then raise exception 'RF_INVALID_INPUT';end if;
 select * into r from public.task_replays where request_id=p_request;
 if found then
  if r.previous_task_id<>t.id or r.actor_id is distinct from auth.uid() or r.reason<>p_reason then raise exception 'RF_CONFLICT';end if;
  return jsonb_build_object('previousTaskId',t.id,'taskId',r.task_id);
 end if;
 v_context:=public.operations_replay_check(t.id);if v_context->'available' is distinct from 'true'::jsonb then raise exception 'RF_CONFLICT';end if;
 if t.kind='account.delete' then
  select id into v_request from public.account_deletions where task_id=t.id;
  perform public.account_deletion_resume(v_request,p_reason);select task_id into v_next from public.account_deletions where id=v_request;
 else
  v_version:=public.task_replay_binding(t.id);
  insert into public.tasks(user_id,kind,source_ref,input_version,idempotency_key,request_hash,max_attempts) values(t.user_id,t.kind,t.source_ref,v_version,'ops-replay:'||p_request::text,t.request_hash,t.max_attempts) returning id into v_next;
  select pgmq.send('rolefoundry_tasks',jsonb_build_object('taskId',v_next)) into v_message;
  update public.tasks set queue_message_id=v_message where id=v_next;
  perform public.task_replay_binding(t.id,v_next);
  insert into public.task_events(task_id,event) values(v_next,'task.queued');
 end if;
 insert into public.task_replays(request_id,previous_task_id,task_id,actor_id,reason) values(p_request,t.id,v_next,auth.uid(),p_reason);
 insert into public.operations_audit(actor_id,action,resource_id) values(auth.uid(),'task.replay.requested',t.id);
 -- Archive the old terminal delivery as history; never send its message again.
 if t.queue_message_id is not null then perform pgmq.archive('rolefoundry_tasks',t.queue_message_id);end if;
 return jsonb_build_object('previousTaskId',t.id,'taskId',v_next);
 exception when unique_violation then raise exception 'RF_CONFLICT';
end $$;
-- Helpers are deliberately not service/browser-callable; only the admin coordinator owns dispatch.
do $$declare r record;begin
 for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('assessment_replay_binding','matching_replay_binding','learning_replay_binding','resume_replay_binding','ingestion_replay_binding','account_export_replay_binding','task_replay_binding','operations_replay_lock','operations_replay_check','operations_replay_context','operations_task_replay') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end $$;
grant execute on function public.operations_replay_context(uuid),public.operations_task_replay(uuid,uuid,text) to authenticated;
