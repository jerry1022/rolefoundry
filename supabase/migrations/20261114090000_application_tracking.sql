-- Private, manually reported application cycles. No submission or messaging side effects.
create table public.applications (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 job_id uuid references public.jobs(id) on delete set null, job_key uuid not null,
 job_snapshot jsonb not null, cycle integer not null check(cycle>0), revision bigint not null default 1,
 stage text not null default 'Saved' check(stage in ('Saved','Applied','Interview','Offer','Closed')),
 note text not null default '', confirmation_reference text,
 resume_version_id uuid references public.resume_versions(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,job_key,cycle)
);
create unique index application_active_cycle on public.applications(user_id,job_key) where stage<>'Closed';
create index application_owner_history on public.applications(user_id,sequence desc);
create table public.application_events (
 id bigint generated always as identity primary key,
 application_id uuid not null references public.applications(id) on delete cascade,
 actor_id uuid not null references public.profiles(user_id) on delete cascade,
 revision bigint not null, kind text not null check(kind in ('tracked','stage','edited','follow-up','resume-removed')),
 previous_stage text, stage text not null, confirmation_reference text,
 created_at timestamptz not null default clock_timestamp(), unique(application_id,revision)
);
create table public.follow_up_tasks (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
 title text not null, due_at timestamptz not null, completed boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create index application_follow_up_due on public.follow_up_tasks(application_id,completed,due_at);
create table public.application_requests (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 operation text not null, request_key text not null, request_hash text not null,
 application_id uuid references public.applications(id) on delete set null, result_ref uuid,
 primary key(user_id,operation,request_key)
);
create table public.application_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(user_id) on delete set null,
 resource_id uuid, action text not null, created_at timestamptz not null default clock_timestamp()
);

-- Producer-owned read contracts, called only inside owner-authorized transactions.
create function public.catalog_tracking_snapshot(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('jobId',p_job,'jobVersionId',j->'versionId','title',j->'title','company',j->'company',
 'sources',(select jsonb_agg(jsonb_build_object('id',s->'id','name',s->'name','publisher',s->'publisher','url',s->'url','isDemo',s->'isDemo','freshness',s->'freshness')) from jsonb_array_elements(j->'sources') s))
 from (select public.catalog_job_json(p_job) j) source where j is not null
$$;
create function public.catalog_tracking_source_current(p_id uuid,p_url text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.job_sources l join public.sources s on s.id=l.source_id
 where l.id=p_id and l.original_url=p_url and s.status='active' and l.freshness<>'closed'
 and public.catalog_job_visible(l.job_id) and public.catalog_valid_link(s.id,l.original_url))
$$;
create function public.resume_tracking_reference(p_version uuid,p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',v.id,'documentId',d.id,'version',v.version,'filename',d.filename,'createdAt',v.created_at)
 from public.resume_versions v join public.resume_documents d on d.id=v.document_id
 where v.id=p_version and d.user_id=p_owner and d.deleted_at is null
$$;
create function public.application_private_lock() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_user();
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 perform public.identity_require_user(); return u;
end $$;
create function public.application_text(p text,n integer,allow_empty boolean default true) returns boolean language sql immutable set search_path='' as $$
 select coalesce((allow_empty or length(btrim(p))>0) and length(p)+(select count(*) from regexp_split_to_table(p,'') c where ascii(c)>65535)<=n
 and translate(p,chr(9)||chr(10)||chr(13),'') !~ '[[:cntrl:]]',false)
$$;
create function public.application_keys(p jsonb,required text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(case when jsonb_typeof(p)='object' then
 (select array_agg(x order by x) from jsonb_object_keys(p) x)=(select array_agg(x order by x) from unnest(required) x) else false end,false)
$$;
create function public.application_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'ownerId',a.user_id,'revision',a.revision,'cycle',a.cycle,'jobId',a.job_key,'jobVersionId',a.job_snapshot->'jobVersionId',
 'title',a.job_snapshot->'title','company',a.job_snapshot->'company','available',public.catalog_job_visible(a.job_id),
 'sources',(select coalesce(jsonb_agg(s||jsonb_build_object('available',public.catalog_tracking_source_current((s->>'id')::uuid,s->>'url'))),'[]'::jsonb) from jsonb_array_elements(a.job_snapshot->'sources') s),
 'stage',a.stage,'note',a.note,'confirmationReference',a.confirmation_reference,
 'resume',public.resume_tracking_reference(a.resume_version_id,a.user_id),
 'followUps',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'dueAt',f.due_at,'completed',f.completed,'createdAt',f.created_at) order by f.completed,f.due_at,f.id),'[]'::jsonb) from public.follow_up_tasks f where f.application_id=a.id),
 'createdAt',a.created_at,'updatedAt',a.updated_at) from public.applications a where a.id=p_id
$$;
create function public.application_event(p_id uuid,p_kind text,p_previous text) returns void language sql security definer set search_path='' as $$
 insert into public.application_events(application_id,actor_id,revision,kind,previous_stage,stage,confirmation_reference)
 select id,user_id,revision,p_kind,p_previous,stage,case when p_kind='stage' then confirmation_reference else null end from public.applications where id=p_id;
 insert into public.application_audit(actor_id,resource_id,action) select user_id,id,'application.'||p_kind from public.applications where id=p_id
$$;
create function public.application_manual_limit(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin if (select count(*) from public.application_events where application_id=p_id)>=500 then raise exception 'RF_APPLICATION_LIMIT';end if; end $$;
create function public.application_request_limit(p_user uuid,p_key text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 if (select count(*) from public.application_requests where user_id=p_user)>=2000 then raise exception 'RF_APPLICATION_LIMIT';end if;
end $$;
create function public.application_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();
begin if not exists(select 1 from public.applications where id=p_id and user_id=u) then raise exception 'RF_NOT_FOUND';end if;return public.application_json(p_id);end $$;
create function public.application_list(p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();v_data jsonb;v_last bigint;
begin
 if p_before is not null and p_before<1 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(public.application_json(id) order by sequence desc),'[]'::jsonb),min(sequence) into v_data,v_last from
 (select id,sequence from public.applications where user_id=u and (p_before is null or sequence<p_before) order by sequence desc limit 20) page;
 return jsonb_build_object('ownerId',u,'data',v_data,'lastSequence',case when exists(select 1 from public.applications where user_id=u and sequence<v_last) then v_last::text else null end);
end $$;
create function public.application_events_list(p_id uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();v_data jsonb;v_last bigint;
begin
 if not exists(select 1 from public.applications where id=p_id and user_id=u) then raise exception 'RF_NOT_FOUND';end if;
 if p_before is not null and p_before<1 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'revision',revision,'kind',kind,'previousStage',previous_stage,'stage',stage,'actorId',actor_id,'confirmationReference',confirmation_reference,'createdAt',created_at) order by id desc),'[]'::jsonb),min(id) into v_data,v_last
 from (select * from public.application_events where application_id=p_id and (p_before is null or id<p_before) order by id desc limit 20) page;
 return jsonb_build_object('data',v_data,'lastSequence',case when exists(select 1 from public.application_events where application_id=p_id and id<v_last) then v_last::text else null end);
end $$;
create function public.application_create(p_user uuid,p_job uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb;v_cycle integer;v_id uuid;
begin
 if (select count(*) from public.applications where user_id=p_user)>=500 then raise exception 'RF_APPLICATION_LIMIT';end if;
 v_snapshot:=public.catalog_tracking_snapshot(p_job);if v_snapshot is null then raise exception 'RF_NOT_FOUND';end if;
 select coalesce(max(cycle),0)+1 into v_cycle from public.applications where user_id=p_user and job_key=p_job;
 insert into public.applications(user_id,job_id,job_key,job_snapshot,cycle) values(p_user,p_job,p_job,v_snapshot,v_cycle) returning id into v_id;
 perform public.application_event(v_id,'tracked',null);return v_id;
end $$;
create function public.application_track(p_job uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();r public.application_requests%rowtype;v_id uuid;v_hash text:=md5(p_job::text);
begin
 if p_job is null or p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 select * into r from public.application_requests where user_id=u and operation='track' and request_key=p_key;
 if found then if r.request_hash<>v_hash or r.application_id is null then raise exception 'RF_CONFLICT';end if;return public.application_json(r.application_id);end if;
 perform public.application_request_limit(u,p_key);
 select id into v_id from public.applications where user_id=u and job_key=p_job order by (stage<>'Closed') desc,cycle desc limit 1;
 if not found then v_id:=public.application_create(u,p_job);end if;
 insert into public.application_requests values(u,'track',p_key,v_hash,v_id,null);return public.application_json(v_id);
end $$;
create function public.application_new_cycle(p_id uuid,p_expected bigint,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();a public.applications%rowtype;r public.application_requests%rowtype;v_id uuid;v_hash text:=md5(jsonb_build_array(p_id,p_expected)::text);
begin
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 select * into r from public.application_requests where user_id=u and operation='cycle' and request_key=p_key;
 if found then if r.request_hash<>v_hash or r.application_id is null then raise exception 'RF_CONFLICT';end if;return public.application_json(r.application_id);end if;
 select * into a from public.applications where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if a.revision is distinct from p_expected or a.stage<>'Closed' or exists(select 1 from public.applications where user_id=u and job_key=a.job_key and stage<>'Closed') then raise exception 'RF_CONFLICT';end if;
 perform public.application_request_limit(u,p_key);
 v_id:=public.application_create(u,a.job_key);
 insert into public.application_requests values(u,'cycle',p_key,v_hash,v_id,null);return public.application_json(v_id);
end $$;
create function public.application_edit(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();a public.applications%rowtype;v_resume uuid;
begin
 if not public.application_keys(p_data,array['expectedRevision','stage','note','resumeVersionId','confirmationReference'])
 or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or jsonb_typeof(p_data->'stage') is distinct from 'string'
 or jsonb_typeof(p_data->'note') is distinct from 'string' or not public.application_text(p_data->>'note',4000)
 or coalesce(p_data->>'stage','') not in ('Saved','Applied','Interview','Offer','Closed')
 or (p_data->'resumeVersionId'<>'null'::jsonb and (jsonb_typeof(p_data->'resumeVersionId') is distinct from 'string' or (p_data->>'resumeVersionId') !~ '^[a-fA-F0-9-]{36}$'))
 or (p_data->'confirmationReference'<>'null'::jsonb and (jsonb_typeof(p_data->'confirmationReference') is distinct from 'string' or not public.application_text(p_data->>'confirmationReference',300))) then raise exception 'RF_INVALID_INPUT';end if;
 v_resume:=(p_data->>'resumeVersionId')::uuid;
 select * into a from public.applications where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if a.revision is distinct from (p_data->>'expectedRevision')::bigint then raise exception 'RF_CONFLICT';end if;
 if a.stage='Closed' and p_data->>'stage'<>'Closed' then raise exception 'RF_CONFLICT';end if;
 if v_resume is not null and public.resume_tracking_reference(v_resume,u) is null then raise exception 'RF_NOT_FOUND';end if;
 if (a.stage,a.note,a.resume_version_id,a.confirmation_reference) is not distinct from (p_data->>'stage',p_data->>'note',v_resume,p_data->>'confirmationReference') then return public.application_json(p_id);end if;
 perform public.application_manual_limit(p_id);
 update public.applications set stage=p_data->>'stage',note=p_data->>'note',resume_version_id=v_resume,confirmation_reference=p_data->>'confirmationReference',revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 perform public.application_event(p_id,case when a.stage<>p_data->>'stage' then 'stage' else 'edited' end,a.stage);return public.application_json(p_id);
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.application_follow_up_validate(p_data jsonb,p_edit boolean) returns void language plpgsql set search_path='' as $$
declare v_due timestamptz;
begin
 if not public.application_keys(p_data,case when p_edit then array['expectedRevision','title','dueAt','completed'] else array['expectedRevision','title','dueAt'] end)
 or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or jsonb_typeof(p_data->'title') is distinct from 'string' or not public.application_text(p_data->>'title',200,false)
 or jsonb_typeof(p_data->'dueAt') is distinct from 'string' or (p_data->>'dueAt') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$'
 or (p_edit and jsonb_typeof(p_data->'completed') is distinct from 'boolean') then raise exception 'RF_INVALID_INPUT';end if;
 v_due:=(p_data->>'dueAt')::timestamptz;
 if not isfinite(v_due) or extract(year from v_due at time zone 'UTC') not between 2000 and 2100 then raise exception 'RF_INVALID_INPUT';end if;
 exception when invalid_datetime_format or datetime_field_overflow then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.application_follow_up_add(p_id uuid,p_data jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();a public.applications%rowtype;r public.application_requests%rowtype;v_id uuid;v_operation text:='follow-up:'||p_id::text;v_hash text:=md5(p_data::text);
begin
 perform public.application_follow_up_validate(p_data,false);
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 select * into r from public.application_requests where user_id=u and operation=v_operation and request_key=p_key;
 if found then if r.request_hash<>v_hash or r.application_id is null or not exists(select 1 from public.follow_up_tasks where id=r.result_ref) then raise exception 'RF_CONFLICT';end if;return public.application_json(r.application_id);end if;
 select * into a from public.applications where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if a.revision is distinct from (p_data->>'expectedRevision')::bigint then raise exception 'RF_CONFLICT';end if;
 if (select count(*) from public.follow_up_tasks where application_id=p_id)>=50 then raise exception 'RF_APPLICATION_LIMIT';end if;
 perform public.application_manual_limit(p_id);perform public.application_request_limit(u,p_key);
 insert into public.follow_up_tasks(application_id,title,due_at) values(p_id,btrim(p_data->>'title'),(p_data->>'dueAt')::timestamptz) returning id into v_id;
 update public.applications set revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 perform public.application_event(p_id,'follow-up',a.stage);
 insert into public.application_requests values(u,v_operation,p_key,v_hash,p_id,v_id);return public.application_json(p_id);
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.application_follow_up_edit(p_id uuid,p_follow_up uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();a public.applications%rowtype;f public.follow_up_tasks%rowtype;
begin
 perform public.application_follow_up_validate(p_data,true);
 select * into a from public.applications where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if a.revision is distinct from (p_data->>'expectedRevision')::bigint then raise exception 'RF_CONFLICT';end if;
 select * into f from public.follow_up_tasks where id=p_follow_up and application_id=p_id;if not found then raise exception 'RF_NOT_FOUND';end if;
 if (f.title,f.due_at,f.completed) is not distinct from (btrim(p_data->>'title'),(p_data->>'dueAt')::timestamptz,(p_data->>'completed')::boolean) then return public.application_json(p_id);end if;
 perform public.application_manual_limit(p_id);
 update public.follow_up_tasks set title=btrim(p_data->>'title'),due_at=(p_data->>'dueAt')::timestamptz,completed=(p_data->>'completed')::boolean where id=p_follow_up;
 update public.applications set revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 perform public.application_event(p_id,'follow-up',a.stage);return public.application_json(p_id);
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.application_follow_up_delete(p_id uuid,p_follow_up uuid,p_expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();a public.applications%rowtype;
begin
 select * into a from public.applications where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if a.revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
 delete from public.follow_up_tasks where id=p_follow_up and application_id=p_id;
 if not found then return public.application_json(p_id);end if;
 update public.applications set revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 perform public.application_event(p_id,'follow-up',a.stage);return public.application_json(p_id);
end $$;
create function public.application_delete(p_id uuid,p_expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.application_private_lock();a public.applications%rowtype;
begin
 select * into a from public.applications where id=p_id for update;
 if not found then return jsonb_build_object('deleted',true);end if;
 if a.user_id<>u then raise exception 'RF_NOT_FOUND';end if;
 if a.revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
 delete from public.applications where id=p_id;
 insert into public.application_audit(actor_id,resource_id,action) values(u,p_id,'application.deleted');return jsonb_build_object('deleted',true);
end $$;
-- An FK unlink on source deletion advances the optimistic revision without retaining
-- filename, source text or version IDs in an event. User edits already advance it.
create function public.application_resume_unlinked() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.resume_version_id is not null and new.resume_version_id is null and old.revision=new.revision then
  new.revision:=old.revision+1;new.updated_at:=clock_timestamp();
  if exists(select 1 from public.profiles where user_id=new.user_id) then
   insert into public.application_events(application_id,actor_id,revision,kind,previous_stage,stage) values(new.id,new.user_id,new.revision,'resume-removed',new.stage,new.stage);
   insert into public.application_audit(actor_id,resource_id,action) values(new.user_id,new.id,'application.resume-removed');
  end if;
 end if;return new;
end $$;
create trigger application_resume_unlinked before update of resume_version_id on public.applications for each row execute function public.application_resume_unlinked();

-- No raw member table access, even if another module adds permissive policies.
do $$ declare t text;r record;begin
 foreach t in array array['applications','application_events','follow_up_tasks','application_requests','application_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
 end loop;
 for r in select oid::regprocedure name from pg_proc where pronamespace='public'::regnamespace and (proname like 'application\_%' escape '\' or proname in ('catalog_tracking_snapshot','catalog_tracking_source_current','resume_tracking_reference')) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.name);
  execute format('grant execute on function %s to service_role',r.name);
 end loop;
end $$;
grant execute on function public.application_list(bigint),public.application_find(uuid),public.application_events_list(uuid,bigint),public.application_track(uuid,text),public.application_new_cycle(uuid,bigint,text),public.application_edit(uuid,jsonb),public.application_follow_up_add(uuid,jsonb,text),public.application_follow_up_edit(uuid,uuid,jsonb),public.application_follow_up_delete(uuid,uuid,bigint),public.application_delete(uuid,bigint) to authenticated;
-- Minimal owner version picker; it never copies confirmed fact text into tracking.
create function public.resume_tracking_choices(p_before uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();v_data jsonb;v_last uuid;
begin
 select coalesce(jsonb_agg(public.resume_tracking_reference(id,u) order by id desc),'[]'::jsonb),(array_agg(id order by id))[1] into v_data,v_last
 from (select v.id from public.resume_versions v join public.resume_documents d on d.id=v.document_id where d.user_id=u and d.deleted_at is null and (p_before is null or v.id<p_before) order by v.id desc limit 20) page;
 return jsonb_build_object('data',v_data,'lastId',case when exists(select 1 from public.resume_versions v join public.resume_documents d on d.id=v.document_id where d.user_id=u and d.deleted_at is null and v.id<v_last) then v_last::text else null end);
end $$;
revoke all on function public.resume_tracking_choices(uuid) from public,anon,authenticated;
grant execute on function public.resume_tracking_choices(uuid) to authenticated,service_role;
-- Business history is append-only; privacy deletion may still cascade rows.
create function public.application_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'RF_IMMUTABLE';end $$;
create trigger application_event_immutable before update on public.application_events for each row execute function public.application_history_immutable();
create function public.application_snapshot_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.user_id,new.job_key,new.job_snapshot,new.cycle,new.sequence,new.created_at) is distinct from (old.id,old.user_id,old.job_key,old.job_snapshot,old.cycle,old.sequence,old.created_at)
 or (new.job_id is distinct from old.job_id and new.job_id is not null) then raise exception 'RF_IMMUTABLE';end if;return new;
end $$;
create trigger application_snapshot_immutable before update on public.applications for each row execute function public.application_snapshot_immutable();
revoke all on function public.application_history_immutable(),public.application_snapshot_immutable() from public,anon,authenticated;
grant execute on function public.application_history_immutable(),public.application_snapshot_immutable() to service_role;
