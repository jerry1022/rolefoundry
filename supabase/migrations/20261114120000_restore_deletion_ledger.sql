-- Recovery-only overlay: never accept a ledger on a live/source database.
create table public.recovery_deletion_overlays(
 run_id text not null,ledger_digest text not null,entry_count integer not null,
 applied_at timestamptz not null default clock_timestamp(),applied_by text not null default session_user,
 primary key(run_id,ledger_digest)
);
alter table public.recovery_deletion_overlays enable row level security;
revoke all on public.recovery_deletion_overlays from public,anon,authenticated,service_role;
grant select on public.recovery_deletion_overlays to service_role;
create function public.recovery_require_target(p_run text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_run is null or p_run !~ '^[a-f0-9]{32}$'
 or current_database() is distinct from 'rf_restore_'||p_run
 or (select shobj_description(oid,'pg_database') from pg_database where datname=current_database())
    is distinct from 'RoleFoundry disposable recovery rehearsal '||p_run then
  raise exception 'RF_RECOVERY_TARGET_REQUIRED';
 end if;
end $$;

-- One audit minimization policy is shared by live and restored erasure before FK links disappear.
create function public.account_deletion_minimize_audit(p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 select subject_id into u from public.account_deletions where id=p_request;
 if u is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 update public.identity_audit set reason=null where actor_id=u or subject_id=u;
 update public.assessment_audit set reason=null where actor_id=u;
 update public.dictionary_audit set reason='Account removed' where actor_id=u;
 update public.course_audit set reason='Account removed' where actor_id=u;
end $$;
revoke all on function public.account_deletion_minimize_audit(uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_minimize_audit(uuid) to service_role;

create function public.recovery_apply_deletion_ledger(p_run text,p_ledger jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e jsonb;d public.account_deletions%rowtype;u uuid;r uuid;t uuid;m bigint;
 requested timestamptz;completed timestamptz;exported timestamptz;v_contact text;v_invitations uuid[];
 v_result jsonb:='[]';v_digest text;v_exists boolean;
begin
 perform public.recovery_require_target(p_run);
 -- Serialize all overlays, then acquire domain locks in the same order as live erasure.
 perform pg_advisory_xact_lock(hashtextextended('recovery:deletion-ledger',0));
 if p_ledger is null or octet_length(p_ledger::text)>8388608
 or jsonb_typeof(p_ledger) is distinct from 'object' then raise exception 'RF_INVALID_LEDGER';end if;
 if (select count(*) from jsonb_object_keys(p_ledger))<>3
 or p_ledger->'version' is distinct from '1'::jsonb
 or jsonb_typeof(p_ledger->'exportedAt') is distinct from 'string'
 or jsonb_typeof(p_ledger->'entries') is distinct from 'array' then raise exception 'RF_INVALID_LEDGER';end if;
 if jsonb_array_length(p_ledger->'entries')>10000 then raise exception 'RF_INVALID_LEDGER';end if;
 begin exported:=(p_ledger->>'exportedAt')::timestamptz;
 exception when others then raise exception 'RF_INVALID_LEDGER';end;
 if not isfinite(exported) or (p_ledger->>'exportedAt')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'RF_INVALID_LEDGER';end if;
 -- Validate the whole ledger before changing anything. A failure rolls back the complete overlay.
 for e in select value from jsonb_array_elements(p_ledger->'entries') loop
  if jsonb_typeof(e) is distinct from 'object' then raise exception 'RF_INVALID_LEDGER';end if;
  if (select count(*) from jsonb_object_keys(e))<>4 or not(e ?& array['requestId','subjectId','requestedAt','completedAt'])
  or jsonb_typeof(e->'requestId') is distinct from 'string' or jsonb_typeof(e->'subjectId') is distinct from 'string'
  or (e->>'requestId')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  or (e->>'subjectId')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  or jsonb_typeof(e->'requestedAt') is distinct from 'string'
  or jsonb_typeof(e->'completedAt') not in ('null','string') then raise exception 'RF_INVALID_LEDGER';end if;
  begin requested:=(e->>'requestedAt')::timestamptz;completed:=(e->>'completedAt')::timestamptz;
  exception when others then raise exception 'RF_INVALID_LEDGER';end;
  if not isfinite(requested) or requested>exported
  or (e->>'requestedAt')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
  or (completed is not null and (not isfinite(completed) or completed<requested or completed>exported
      or (e->>'completedAt')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$')) then raise exception 'RF_INVALID_LEDGER';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_ledger->'entries') x group by x->>'subjectId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_ledger->'entries') x group by x->>'requestId' having count(*)>1) then raise exception 'RF_INVALID_LEDGER';end if;
 v_digest:=encode(extensions.digest(p_ledger::text,'sha256'),'hex');
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));
 for e in select value from jsonb_array_elements(p_ledger->'entries') order by value->>'subjectId' loop
  u:=(e->>'subjectId')::uuid;r:=(e->>'requestId')::uuid;requested:=(e->>'requestedAt')::timestamptz;
  perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
  if exists(select 1 from public.account_deletions where (id=r and subject_id<>u) or (subject_id=u and id<>r)) then raise exception 'RF_LEDGER_CONFLICT';end if;
  select * into d from public.account_deletions where id=r for update;v_exists:=found;
  if v_exists and abs(extract(epoch from d.requested_at-requested))>=0.001 then raise exception 'RF_LEDGER_CONFLICT';end if;
  -- A repeated apply reuses its fenced, pending task. Completed clean targets stay completed.
  if v_exists and ((d.phase='completed' and not exists(select 1 from auth.users where id=u)
     and not exists(select 1 from public.profiles where user_id=u)
     and not exists(select 1 from public.resume_storage_objects where user_id=u or split_part(object_key,'/',1)=u::text)
     and not exists(select 1 from public.account_export_objects where user_id=u or split_part(object_key,'/',1)=u::text)
     and not exists(select 1 from storage.objects where owner_id=u::text or (bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports') and split_part(name,'/',1)=u::text)))
   or (d.phase<>'completed' and exists(select 1 from public.tasks t join public.task_erasure_grants g on g.task_id=t.id
       where t.id=d.task_id and t.status in ('queued','running') and t.kind='account.delete' and t.source_ref=r and g.subject_id=u and g.request_id=r and g.active)
       and exists(select 1 from public.account_deletion_events where request_id=r and task_id=d.task_id and event='deletion.restore-applied'))) then
   v_result:=v_result||jsonb_build_array(jsonb_build_object('requestId',r,'taskId',d.task_id,'action','unchanged'));continue;
  end if;
  select public.identity_email_hash(email) into v_contact from auth.users where id=u;
  select coalesce(array_agg(id),'{}') into v_invitations from public.invitations where used_by=u;
  update public.tasks t set status='failed',safe_error='RF_CANCELED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null,worker_id=null
   where t.status in ('queued','running') and (t.user_id=u or exists(select 1 from public.task_erasure_grants g where g.task_id=t.id and g.subject_id=u));
  update public.task_erasure_grants set active=false where subject_id=u;
  insert into public.tasks(user_id,kind,source_ref,input_version,idempotency_key,request_hash)
   values((select user_id from public.profiles where user_id=u),'account.delete',r,'deletion-v1',gen_random_uuid()::text,'deletion-v1') returning id into t;
  insert into public.task_erasure_grants(task_id,subject_id,request_id) values(t,u,r);
  select pgmq.send('rolefoundry_tasks',jsonb_build_object('taskId',t)) into m;
  update public.tasks set queue_message_id=m where id=t;
  insert into public.account_deletions(id,subject_id,task_id,requested_at,contact_hash,invitation_ids)
   values(r,u,t,requested,v_contact,v_invitations)
   on conflict(id) do update set task_id=t,phase='queued',completed_at=null,
    contact_hash=coalesce(excluded.contact_hash,public.account_deletions.contact_hash),
    invitation_ids=array(select distinct unnest(public.account_deletions.invitation_ids||excluded.invitation_ids));
  -- Restored services are disconnected: no in-flight writes exist. Preserve any persisted grace.
  update public.resume_storage_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())),cleanup_token=null,cleanup_expires_at=null where user_id=u or split_part(object_key,'/',1)=u::text;
  update public.account_export_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())),cleanup_token=null,cleanup_expires_at=null where user_id=u or split_part(object_key,'/',1)=u::text;
  -- Profile cascade removes business records and ordinary tasks; the registered erasure survives.
  -- Auth/Storage are deliberately removed through their service APIs by the normal handler.
  -- Detach both FK paths before the profile/document cascades; retain canonical keys for cleanup.
  if exists(select 1 from public.resume_storage_objects where user_id=u and split_part(object_key,'/',1)<>u::text)
  or exists(select 1 from public.account_export_objects where user_id=u and split_part(object_key,'/',1)<>u::text) then raise exception 'RF_LEDGER_CONFLICT';end if;
  update public.resume_storage_objects set user_id=null,document_id=null where user_id=u or split_part(object_key,'/',1)=u::text;
  update public.account_export_objects set user_id=null,export_id=null where user_id=u or split_part(object_key,'/',1)=u::text;
  perform public.account_deletion_minimize_audit(r);
  delete from public.profiles where user_id=u;
  insert into public.task_events(task_id,event) values(t,'task.queued');
  insert into public.account_deletion_events(request_id,task_id,event) values(r,t,'deletion.restore-applied');
  v_result:=v_result||jsonb_build_array(jsonb_build_object('requestId',r,'taskId',t,'action','queued'));
 end loop;
 insert into public.recovery_deletion_overlays(run_id,ledger_digest,entry_count) values(p_run,v_digest,jsonb_array_length(p_ledger->'entries')) on conflict do nothing;
 return jsonb_build_object('entries',v_result,'ledgerDigest',v_digest);
end $$;

-- Even an invitation created later must not reactivate a subject retained in the deletion ledger.
create or replace function public.identity_activate() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_email text;v_inv public.invitations%rowtype;v_profile public.profiles%rowtype;
begin
 if v_user is null or auth.role() is distinct from 'authenticated' then raise exception 'RF_UNAUTHORIZED';end if;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 if exists(select 1 from public.account_deletions where subject_id=v_user) then raise exception 'RF_FORBIDDEN';end if;
 select email into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if v_email is null then raise exception 'RF_UNAUTHORIZED';end if;
 select * into v_profile from public.profiles where user_id=v_user;
 if found then
  if v_profile.status<>'active' then raise exception 'RF_FORBIDDEN';end if;
  return jsonb_build_object('userId',v_user,'role',v_profile.role);
 end if;
 select * into v_inv from public.invitations where email_hash=public.identity_email_hash(v_email) for update;
 if not found or v_inv.used_at is not null or v_inv.expires_at<=clock_timestamp() then raise exception 'RF_INVITATION_REQUIRED';end if;
 update public.invitations set used_at=clock_timestamp(),used_by=v_user where id=v_inv.id and used_at is null;
 insert into public.profiles(user_id) values(v_user);
 insert into public.identity_audit(actor_id,subject_id,action,resource_id) values(v_user,v_user,'invitation.redeemed',v_inv.id);
 return jsonb_build_object('userId',v_user,'role','member');
end $$;
revoke all on function public.recovery_require_target(text),public.recovery_apply_deletion_ledger(text,jsonb) from public,anon,authenticated;
grant execute on function public.recovery_require_target(text),public.recovery_apply_deletion_ledger(text,jsonb) to service_role;

create or replace function public.account_deletion_begin_auth(p_task uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.account_deletions:=public.account_deletion_lock(p_task,p_token);
begin
 if exists(select 1 from public.resume_storage_objects where user_id=d.subject_id or split_part(object_key,'/',1)=d.subject_id::text)
 or exists(select 1 from public.account_export_objects where user_id=d.subject_id or split_part(object_key,'/',1)=d.subject_id::text)
 or exists(select 1 from storage.objects where bucket_id in ('rolefoundry-resumes','rolefoundry-account-exports') and split_part(name,'/',1)=d.subject_id::text) then return false;end if;
 -- Unexpected ownership outside the application's canonical prefix requires operator review.
 if exists(select 1 from storage.objects where owner_id=d.subject_id::text) then raise exception 'RF_CONFLICT';end if;
 delete from public.invitations where used_by=d.subject_id or id=any(d.invitation_ids);
 delete from public.identity_otp_requests where email_hash=d.contact_hash and requested_at<=d.requested_at;
 perform public.account_deletion_minimize_audit(d.id);
 if d.phase<>'removing-account' then update public.account_deletions set phase='removing-account' where id=d.id;insert into public.account_deletion_events(request_id,task_id,event) values(d.id,p_task,'deletion.removing-account');end if;
 return true;
end $$;
