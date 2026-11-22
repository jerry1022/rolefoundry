-- Private, owner-requested data portability. No Auth secrets or shared editorial records.
alter table public.tasks drop constraint tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check(kind in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete','account.export'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rolefoundry-account-exports','rolefoundry-account-exports',false,67108864,array['application/zip']);
create table public.account_exports(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,
 task_id uuid unique references public.tasks(id) on delete set null,request_key text not null,payload jsonb,
 object_key text,sha256 text,byte_count integer,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',invalidated_at timestamptz,
 unique(user_id,request_key)
);
create index account_exports_owner on public.account_exports(user_id,created_at desc,id desc);
create table public.account_export_objects(
 id uuid primary key default gen_random_uuid(),export_id uuid references public.account_exports(id) on delete set null,
 user_id uuid references public.profiles(user_id) on delete set null,object_key text not null unique,
 write_deadline timestamptz,purge_after timestamptz not null,cleanup_token uuid,cleanup_expires_at timestamptz
);
create index account_export_objects_due on public.account_export_objects(purge_after);
create function public.account_export_private_lock() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_user();begin
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_user();return u;
end $$;
create function public.account_export_snapshot(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb:='{}'::jsonb;v_files jsonb;begin
 select v_data||jsonb_build_object('preferences',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select user_id,name,track,workplaces,weekly_hours,revision,updated_at from public.career_preferences t where t.user_id=u) r;
 select v_data||jsonb_build_object('consents',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,purpose,policy_version,granted_at,revoked_at from public.consents t where t.user_id=u) r;
 select v_data||jsonb_build_object('usage',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,task_id,feature,period_start,limit_snapshot,state,created_at,updated_at from public.usage_reservations t where t.user_id=u) r;
 select v_data||jsonb_build_object('evidence',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,source,current_version,created_at from public.evidence t where t.user_id=u) r;
 select v_data||jsonb_build_object('evidenceVersions',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,evidence_id,version,label,context,observed_at,source_ref,source_version,rubric_version,outcome,review_state,created_at,dictionary_version from public.evidence_versions t where t.user_id=u) r;
 select v_data||jsonb_build_object('evidenceSkills',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select evidence_version_id,skill_id,canonical_skill_id from public.evidence_skill_links t where exists(select 1 from public.evidence_versions e where e.id=t.evidence_version_id and e.user_id=u)) r;
 select v_data||jsonb_build_object('skillClaims',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select evidence_version_id,claimed_level from public.skill_claims t where exists(select 1 from public.evidence_versions e where e.id=t.evidence_version_id and e.user_id=u)) r;
 select v_data||jsonb_build_object('portfolioReferences',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select evidence_version_id,url from public.portfolio_references t where exists(select 1 from public.evidence_versions e where e.id=t.evidence_version_id and e.user_id=u)) r;
 select v_data||jsonb_build_object('bookmarks',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select job_id,job_version_id,title_snapshot,company_snapshot,source_url_snapshot,created_at from public.bookmarks t where t.user_id=u) r;
 select v_data||jsonb_build_object('assessments',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,track,revision,status,task_id,created_at,submitted_at from public.assessment_attempts t where t.user_id=u) r;
 select v_data||jsonb_build_object('assessmentItems',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,attempt_id,question_version_id,ordinal from public.attempt_items t where exists(select 1 from public.assessment_attempts a where a.id=t.attempt_id and a.user_id=u)) r;
 select v_data||jsonb_build_object('responses',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select attempt_item_id,answer_index from public.responses t where exists(select 1 from public.attempt_items i join public.assessment_attempts a on a.id=i.attempt_id where i.id=t.attempt_item_id and a.user_id=u)) r;
 select v_data||jsonb_build_object('assessmentResults',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,attempt_id,recipe,correct,total,observations,created_at from public.assessment_results t where exists(select 1 from public.assessment_attempts a where a.id=t.attempt_id and a.user_id=u)) r;
 select v_data||jsonb_build_object('matchRuns',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,task_id,target_job_id,input_snapshot,profile_revision,catalog_revision,dictionary_version,status,created_at,finished_at,invalidated_at from public.match_runs t where t.user_id=u) r;
 select v_data||jsonb_build_object('matchResults',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select run_id,job_id,job_version_id,rank,result from public.match_results t where exists(select 1 from public.match_runs m where m.id=t.run_id and m.user_id=u)) r;
 select v_data||jsonb_build_object('gapItems',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select run_id,job_id,ordinal,gap from public.gap_items t where exists(select 1 from public.match_runs m where m.id=t.run_id and m.user_id=u)) r;
 select v_data||jsonb_build_object('learningProgress',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select course_id,course_version_id,title_snapshot,completed,updated_at from public.learning_progress t where t.user_id=u) r;
 select v_data||jsonb_build_object('learningPlans',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,job_id,task_id,input_snapshot,output,status,weekly_hours,progress_revision,created_at,invalidated_at from public.learning_plans t where t.user_id=u) r;
 select v_data||jsonb_build_object('learningSteps',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,plan_id,ordinal,data,completed,course_id,course_version_id from public.learning_steps t where exists(select 1 from public.learning_plans p where p.id=t.plan_id and p.user_id=u)) r;
 select v_data||jsonb_build_object('practice',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,plan_id,step_id,url,summary,created_at from public.practice_submissions t where t.user_id=u) r;
 select v_data||jsonb_build_object('resumeDocuments',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,filename,source_kind,media_type,byte_count,source_text,source_hash,revision,current_version,status,parse_task_id,draft,created_at,deleted_at from public.resume_documents t where t.user_id=u) r;
 select v_data||jsonb_build_object('resumeVersions',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,document_id,version,content,dictionary_version,created_at from public.resume_versions t where exists(select 1 from public.resume_documents d where d.id=t.document_id and d.user_id=u)) r;
 select v_data||jsonb_build_object('resumeClaims',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,document_id,fact_id,part,evidence_id,source_version_id from public.resume_claim_links t where exists(select 1 from public.resume_documents d where d.id=t.document_id and d.user_id=u)) r;
 select v_data||jsonb_build_object('resumeProposals',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,document_id,version_id,job_id,job_version_id,task_id,input_snapshot,output,status,accepted_ids,accepted_version_id,profile_revision,dictionary_version,catalog_revision,created_at from public.revision_proposals t where exists(select 1 from public.resume_documents d where d.id=t.document_id and d.user_id=u)) r;
 select v_data||jsonb_build_object('resumeExports',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,document_id,version_id,task_id,sha256,byte_count,created_at from public.resume_exports t where exists(select 1 from public.resume_documents d where d.id=t.document_id and d.user_id=u)) r;
 select v_data||jsonb_build_object('applications',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,job_id,job_key,job_snapshot,cycle,revision,stage,note,confirmation_reference,resume_version_id,created_at,updated_at from public.applications t where t.user_id=u) r;
 select v_data||jsonb_build_object('applicationEvents',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id::text,application_id,revision,kind,previous_stage,stage,confirmation_reference,created_at from public.application_events t where exists(select 1 from public.applications a where a.id=t.application_id and a.user_id=u)) r;
 select v_data||jsonb_build_object('followUps',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,application_id,title,due_at,completed,created_at from public.follow_up_tasks t where exists(select 1 from public.applications a where a.id=t.application_id and a.user_id=u)) r;
 select v_data||jsonb_build_object('tasks',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,kind,status,attempt_count,max_attempts,created_at,started_at,finished_at from public.tasks t where t.user_id=u) r;
 select v_data||jsonb_build_object('analysisTasks',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,feature,resource_ref,input_version,consent_id,status,failure_category,result_ref,created_at,started_at,finished_at from public.identity_tasks t where t.user_id=u) r;

 select v_data||jsonb_build_object('exportHistory',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,task_id,created_at,expires_at,invalidated_at,byte_count from public.account_exports where user_id=u) r;
 select v_data||jsonb_build_object('accountActivity',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into v_data from(select id,action,resource_id,created_at from public.identity_audit where actor_id=u and (subject_id is null or subject_id=u)) r;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'path',path,'sha256',sha256,'byteCount',bytes) order by path),'[]'::jsonb) into v_files from(
 select d.source_key key,'files/'||d.id::text||'/source.'||case when d.media_type='application/pdf' then 'pdf' else 'docx' end path,d.source_hash sha256,d.byte_count bytes
 from public.resume_documents d join public.resume_storage_objects o on o.object_key=d.source_key
 where d.user_id=u and d.deleted_at is null and d.source_kind='file' and d.source_hash is not null and o.purge_after is null
 union all
 select e.object_key,'files/'||d.id::text||'/'||e.id::text||'.pdf',e.sha256,e.byte_count
 from public.resume_exports e join public.resume_documents d on d.id=e.document_id join public.resume_storage_objects o on o.object_key=e.object_key
 join public.tasks t on t.id=e.task_id where d.user_id=u and d.deleted_at is null and t.status='succeeded' and o.purge_after is null
 ) files;
 return jsonb_build_object('schemaVersion',1,'exportedAt',clock_timestamp(),'account',(select jsonb_build_object('id',a.id,'email',a.email,'createdAt',a.created_at,'lastSignInAt',a.last_sign_in_at,'updatedAt',a.updated_at,'emailConfirmedAt',a.email_confirmed_at,'phone',a.phone,'phoneConfirmedAt',a.phone_confirmed_at,'userMetadata',coalesce(a.raw_user_meta_data,'{}'::jsonb),'identities',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'provider',i.provider,'createdAt',i.created_at,'updatedAt',i.updated_at,'lastSignInAt',i.last_sign_in_at)),'[]'::jsonb) from auth.identities i where i.user_id=a.id),'role',p.role) from auth.users a join public.profiles p on p.user_id=a.id where a.id=u),'data',v_data,'files',v_files);
end $$;
create function public.account_export_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'taskId',e.task_id,'status',case when e.invalidated_at is not null then 'invalidated' when e.expires_at<=clock_timestamp() then 'expired' when e.object_key is not null and t.status='succeeded' then 'ready' else coalesce(t.status,'failed') end,'createdAt',e.created_at,'expiresAt',e.expires_at,'byteCount',e.byte_count)
 from public.account_exports e left join public.tasks t on t.id=e.task_id where e.id=p_id
$$;
create function public.account_export_request(p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.account_export_private_lock();v_existing public.account_exports%rowtype;v_payload jsonb;v_id uuid;v_task uuid;
begin
 if p_key is null or p_key !~ '^[a-zA-Z0-9_-]{8,120}$' then raise exception 'RF_INVALID_INPUT';end if;
 select * into v_existing from public.account_exports where user_id=u and request_key=p_key;if found then return public.account_export_json(v_existing.id);end if;
 if exists(select 1 from public.account_exports e join public.tasks t on t.id=e.task_id where e.user_id=u and e.invalidated_at is null and e.expires_at>clock_timestamp() and t.status in ('queued','running'))
 or (select count(*) from public.account_exports where user_id=u and created_at>clock_timestamp()-interval '24 hours')>=3 then raise exception 'RF_ACCOUNT_EXPORT_LIMIT';end if;
 v_payload:=public.account_export_snapshot(u);
 if octet_length(v_payload::text)>16777216 or jsonb_array_length(v_payload->'files')>100 or (select coalesce(sum((f->>'byteCount')::bigint),0) from jsonb_array_elements(v_payload->'files') f)>50331648 then raise exception 'RF_ACCOUNT_EXPORT_LIMIT';end if;
 insert into public.account_exports(user_id,request_key,payload) values(u,p_key,v_payload) returning id into v_id;
 v_task:=public.task_enqueue(u,'account.export',v_id,'account-v1',p_key,'account-v1');update public.account_exports set task_id=v_task where id=v_id;
 insert into public.identity_audit(actor_id,subject_id,action,resource_id) values(u,u,'account.export_requested',v_id);
 return public.account_export_json(v_id);
end $$;
create function public.account_export_list(p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.account_export_private_lock();v_rows jsonb;v_before timestamptz;v_id uuid;
begin
 if (p_before is null)<>(p_id is null) then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(public.account_export_json(id) order by created_at desc,id desc),'[]'::jsonb) into v_rows from(select id,created_at from public.account_exports where user_id=u and (p_before is null or (created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit 20) page;
 if jsonb_array_length(v_rows)>0 then v_before:=(v_rows->-1->>'createdAt')::timestamptz;v_id:=(v_rows->-1->>'id')::uuid;end if;
 return jsonb_build_object('data',v_rows,'next',case when exists(select 1 from public.account_exports where user_id=u and (created_at,id)<(v_before,v_id)) then jsonb_build_object('createdAt',v_before,'id',v_id) else null end);
end $$;
create function public.account_export_access(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.account_export_private_lock();v jsonb;
begin
 select jsonb_build_object('key',e.object_key,'sha256',e.sha256,'byteCount',e.byte_count) into v from public.account_exports e join public.tasks t on t.id=e.task_id where e.id=p_id and e.user_id=u and e.invalidated_at is null and e.expires_at>clock_timestamp() and t.status='succeeded' and e.object_key is not null;
 if v is null then raise exception 'RF_NOT_FOUND';end if;
 insert into public.identity_audit(actor_id,subject_id,action,resource_id) values(u,u,'account.export_downloaded',p_id);return v;
end $$;
create function public.account_export_delete(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.account_export_private_lock();e public.account_exports%rowtype;begin
 select * into e from public.account_exports where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 update public.tasks set status='failed',safe_error='RF_CANCELED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=e.task_id and status in ('queued','running');
 update public.account_exports set payload=null,object_key=null,invalidated_at=coalesce(invalidated_at,clock_timestamp()) where id=e.id;
 update public.account_export_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())) where export_id=e.id;
 insert into public.identity_audit(actor_id,subject_id,action,resource_id) values(u,u,'account.export_deleted',e.id);return public.account_export_json(e.id);
end $$;
create function public.account_export_task_lock(p_task uuid,p_token uuid) returns public.tasks language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;u uuid;
begin
 select user_id into u from public.tasks where id=p_task;if u is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(u) then raise exception 'RF_FORBIDDEN';end if;
 if t.kind<>'account.export' or t.status<>'running' or p_token is null or t.lease_token is distinct from p_token or t.lease_expires_at is null or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 if not exists(select 1 from public.account_exports e where e.id=t.source_ref and e.user_id=u and e.task_id=t.id and e.payload is not null and e.invalidated_at is null and e.expires_at>clock_timestamp() and e.object_key is null) then raise exception 'RF_STALE_INPUT';end if;return t;
end $$;
create function public.account_export_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.account_export_task_lock(p_task,p_token);begin return (select payload from public.account_exports where id=t.source_ref);end $$;
create function public.account_export_prepare(p_task uuid,p_token uuid) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.account_export_task_lock(p_task,p_token);v_key text:=t.user_id::text||'/'||t.source_ref::text||'/'||p_token::text||'.zip';begin
 insert into public.account_export_objects(export_id,user_id,object_key,write_deadline,purge_after) values(t.source_ref,t.user_id,v_key,clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '150 seconds')
 on conflict(object_key) do update set write_deadline=excluded.write_deadline,purge_after=excluded.purge_after;return v_key;
end $$;
create function public.account_export_publish(p_task uuid,p_token uuid,p_key text,p_sha256 text,p_bytes integer) returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.account_export_task_lock(p_task,p_token);v_key text:=t.user_id::text||'/'||t.source_ref::text||'/'||p_token::text||'.zip';v_expiry timestamptz;
begin
 if p_key is distinct from v_key or coalesce(p_sha256,'') !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 67108864 or not exists(select 1 from public.account_export_objects where object_key=p_key and export_id=t.source_ref and write_deadline>clock_timestamp() and cleanup_token is null) then raise exception 'RF_INVALID_INPUT';end if;
 update public.account_exports set payload=null,object_key=p_key,sha256=p_sha256,byte_count=p_bytes where id=t.source_ref returning expires_at into v_expiry;
 update public.account_export_objects set write_deadline=null,purge_after=v_expiry where object_key=p_key;
 update public.tasks set status='succeeded',result_ref=t.source_ref,finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=t.id;
 insert into public.task_events(task_id,event) values(t.id,'task.succeeded');
end $$;
create function public.account_export_invalidate(u uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 update public.tasks set status='failed',safe_error='RF_CANCELED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where kind='account.export' and user_id=u and status in ('queued','running');
 update public.account_exports set payload=null,object_key=null,invalidated_at=clock_timestamp() where user_id=u and invalidated_at is null;
 update public.account_export_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())) where user_id=u;
end $$;
create function public.account_export_privacy_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform public.account_export_invalidate(old.user_id);
 elsif tg_table_name='profiles' then if new.status='inactive' then perform public.account_export_invalidate(old.user_id);end if;
 elsif tg_table_name='resume_documents' then if new.deleted_at is not null then perform public.account_export_invalidate(old.user_id);end if;end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger account_export_evidence_delete before delete on public.evidence for each row execute function public.account_export_privacy_change();
create trigger account_export_resume_delete before delete or update of deleted_at on public.resume_documents for each row execute function public.account_export_privacy_change();
create trigger account_export_profile_delete before delete or update of status on public.profiles for each row execute function public.account_export_privacy_change();
do $$ declare t text;begin foreach t in array array['bookmarks','assessment_attempts','match_runs','learning_plans','practice_submissions','applications'] loop execute format('create trigger account_export_private_delete before delete on public.%I for each row execute function public.account_export_privacy_change()',t);end loop;end $$;
create function public.account_export_child_delete() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;begin select user_id into u from public.applications where id=old.application_id;if u is not null then perform public.account_export_invalidate(u);end if;return old;end $$;
create trigger account_export_follow_up_delete before delete on public.follow_up_tasks for each row execute function public.account_export_child_delete();
create function public.account_export_cleanup_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.account_export_objects%rowtype;v jsonb:='[]'::jsonb;v_token uuid;
begin
 update public.account_exports set payload=null where payload is not null and expires_at<=clock_timestamp();
 delete from public.account_exports e where e.created_at<clock_timestamp()-interval '30 days' and not exists(select 1 from public.account_export_objects o where o.export_id=e.id);
 for r in select * from public.account_export_objects where purge_after<=clock_timestamp() and (cleanup_expires_at is null or cleanup_expires_at<=clock_timestamp()) order by purge_after,id limit 10 for update skip locked loop
 v_token:=gen_random_uuid();update public.account_export_objects set cleanup_token=v_token,cleanup_expires_at=clock_timestamp()+interval '30 seconds' where id=r.id;
 v:=v||jsonb_build_array(jsonb_build_object('id',r.id,'key',r.object_key,'token',v_token));end loop;return v;
end $$;
create function public.account_export_cleanup_ack(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.account_export_objects where id=p_id and cleanup_token=p_token and cleanup_expires_at>clock_timestamp() and purge_after<=clock_timestamp();if not found then raise exception 'RF_CONFLICT';end if;end $$;
alter table public.account_exports enable row level security;
alter table public.account_export_objects enable row level security;
revoke all on public.account_exports,public.account_export_objects from public,anon,authenticated;
grant all on public.account_exports,public.account_export_objects to service_role;
do $$ declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'account_export_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);end loop;end $$;
grant execute on function public.account_export_request(text),public.account_export_list(timestamptz,uuid),public.account_export_access(uuid),public.account_export_delete(uuid) to authenticated;

create or replace function public.worker_report(p_worker uuid,p_kinds text[],p_seconds integer,p_concurrency integer,p_state text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_worker is null or p_seconds is null or p_seconds not between 5 and 300 or p_concurrency is null or p_concurrency not between 1 and 8 or p_state is null or p_state not in ('active','draining','stopped')
 or coalesce(cardinality(p_kinds),0) not between 1 and 20 or exists(select 1 from unnest(p_kinds) kind where kind is null or kind not in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete','account.export'))
 or cardinality(p_kinds)<>(select count(distinct kind) from unnest(p_kinds) kind) then raise exception 'RF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('workers:registry',0));
 delete from public.worker_instances where last_seen_at<clock_timestamp()-interval '30 days' or (state='stopped' and last_seen_at<clock_timestamp()-interval '7 days');
 if exists(select 1 from public.worker_instances where id=p_worker and ((state='stopped' and p_state<>'stopped') or (state='draining' and p_state='active'))) then raise exception 'RF_CONFLICT';end if;
 if not exists(select 1 from public.worker_instances where id=p_worker) and (select count(*) from public.worker_instances)>=1000 then raise exception 'RF_CONFLICT';end if;
 insert into public.worker_instances(id,kinds,lease_seconds,concurrency,state) values(p_worker,p_kinds,p_seconds,p_concurrency,p_state)
 on conflict(id) do update set kinds=p_kinds,lease_seconds=p_seconds,concurrency=p_concurrency,state=p_state,last_seen_at=clock_timestamp();
end $$;

create or replace function public.operations_summary() returns jsonb language plpgsql security definer set search_path='' as $$
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
 from unnest(array['assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete','account.export']) k(kind)) counts;
 return jsonb_build_object('observedAt',v_now,'workerFreshSeconds',45,'kinds',v_data,'deliveryCount',(select count(*) from pgmq.q_rolefoundry_tasks),'poison24h',(select count(*) from public.task_events where event='queue.poison' and created_at>=v_now-interval '24 hours'));
end $$;

create or replace function public.operations_tasks(p_kind text default null,p_status text default null,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.operations_admin_lock('tasks.list');v_rows jsonb;v_last_created timestamptz;v_last_id uuid;
begin
 if (p_kind is not null and p_kind not in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete','account.export')) or (p_status is not null and p_status not in ('queued','running','succeeded','failed')) or (p_before is null)<>(p_id is null) then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(public.task_operations_json(id) order by created_at desc,id desc),'[]'::jsonb) into v_rows from(select id,created_at from public.tasks where (p_kind is null or kind=p_kind) and (p_status is null or status=p_status) and (p_before is null or (created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit 20) page;
 if jsonb_array_length(v_rows)>0 then v_last_created:=(v_rows->-1->>'createdAt')::timestamptz;v_last_id:=(v_rows->-1->>'id')::uuid;end if;
 return jsonb_build_object('data',v_rows,'next',case when exists(select 1 from public.tasks where (p_kind is null or kind=p_kind) and (p_status is null or status=p_status) and (created_at,id)<(v_last_created,v_last_id)) then jsonb_build_object('createdAt',v_last_created,'id',v_last_id) else null end);
end $$;
