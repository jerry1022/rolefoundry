-- Approved remote retrieval shares immutable batches and reviewed producer publication.
alter table public.tasks drop constraint tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check(kind in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete'));
alter table public.import_batches add column input_origin text not null default 'upload' check(input_origin in ('upload','feed'));
create table public.ingestion_feed_settings(
 source_id uuid primary key references public.sources(id),revision bigint not null default 1,
 feed_id text not null,feed_revision text not null check(feed_revision ~ '^[a-f0-9]{64}$'),enabled boolean not null default false,
 interval_seconds integer not null check(interval_seconds between 900 and 604800),
 owner_id uuid references public.profiles(user_id) on delete set null,next_fetch_at timestamptz not null default clock_timestamp(),
 manual_pause boolean not null default false,pause_until timestamptz,provider_wait text,last_error text,
 updated_at timestamptz not null default clock_timestamp()
);
create table public.ingestion_feed_runs(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,
 source_id uuid not null references public.sources(id),request_key text not null,settings_revision bigint not null,
 source_fingerprint text not null,feed_id text not null,feed_revision text not null,input_hash text not null,
 created_by uuid references public.profiles(user_id) on delete set null,task_id uuid references public.tasks(id) on delete set null,
 batch_id uuid references public.import_batches(id),last_error text,created_at timestamptz not null default clock_timestamp(),
 unique(source_id,request_key)
);
create index ingestion_feed_due on public.ingestion_feed_settings(next_fetch_at) where enabled and not manual_pause;
create index ingestion_feed_run_history on public.ingestion_feed_runs(sequence desc);
create or replace function public.ingestion_source_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'kind',s.kind,'status',case when s.status='active' and (coalesce(cfg.uploads_enabled,false) or coalesce(f.enabled,false)) then 'active' else 'revoked' end,
 'fingerprint',md5(jsonb_build_array(s.import_policy_revision,coalesce(cfg.revision,0),s.status,s.allowed_hosts,s.permitted_fields,s.authorization_basis,s.rights_summary,p.id,p.path_prefixes,p.url_identity,coalesce(f.revision,0),f.feed_id,f.feed_revision)::text),
 'allowedHosts',s.allowed_hosts,'permittedFields',s.permitted_fields,'allowClosure',coalesce(cfg.allow_closure,false),
 'provider',case when p.id is null then null else jsonb_build_object('id',p.id,'pathPrefixes',p.path_prefixes,'urlIdentity',p.url_identity) end)
 from public.sources s left join public.ingestion_settings cfg on cfg.source_id=s.id left join public.ingestion_feed_settings f on f.source_id=s.id left join public.course_source_providers cp on cp.source_id=s.id left join public.course_providers p on p.id=cp.provider_id where s.id=p_id
$$;
-- Upload capability stays independent of feed capability, including when reading source settings.
create or replace function public.ingestion_source_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();v jsonb:=public.ingestion_source_json(p_id);
begin if v is null then raise exception 'RF_NOT_FOUND';end if;
 if not coalesce((select uploads_enabled from public.ingestion_settings where source_id=p_id),false) then v:=jsonb_set(v,'{status}','"revoked"');end if;return v;end $$;
create or replace function public.ingestion_settings_list() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();begin
 return coalesce((select jsonb_agg((public.ingestion_source_json(s.id)||jsonb_build_object('status',case when s.status='active' and coalesce(c.uploads_enabled,false) then 'active' else 'revoked' end,'name',s.name,'sourceStatus',s.status,'revision',coalesce(c.revision,0),'uploadsEnabled',coalesce(c.uploads_enabled,false))) order by s.created_at desc) from public.sources s left join public.ingestion_settings c on c.source_id=s.id),'[]'::jsonb);
end $$;
create function public.ingestion_require_mode(p_source uuid,p_origin text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_origin not in ('upload','feed') or p_origin is null or not exists(select 1 from public.sources where id=p_source and status='active')
 or (p_origin='upload' and not coalesce((select uploads_enabled from public.ingestion_settings where source_id=p_source),false))
 or (p_origin='feed' and not coalesce((select enabled from public.ingestion_feed_settings where source_id=p_source),false)) then raise exception 'RF_FORBIDDEN';end if;
end $$;

create or replace function public.ingestion_validate_content(p_source uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.sources%rowtype;c public.ingestion_settings%rowtype;r jsonb;field text;permission text;positions integer[]:='{}';external_ids text[]:='{}';v_position integer;
begin
 select * into s from public.sources where id=p_source;select * into c from public.ingestion_settings where source_id=p_source;
 if s.status is distinct from 'active' or (c.uploads_enabled is distinct from true and not coalesce((select enabled from public.ingestion_feed_settings where source_id=p_source),false)) then raise exception 'RF_FORBIDDEN';end if;
 if not public.ingestion_keys(p,array['rows','rejected','total']) or jsonb_typeof(p->'rows') is distinct from 'array' or jsonb_typeof(p->'rejected') is distinct from 'array' or jsonb_typeof(p->'total') is distinct from 'number'
 or (p->>'total')::integer not between 0 and 100 or jsonb_array_length(p->'rows')+jsonb_array_length(p->'rejected')<>(p->>'total')::integer or octet_length(p::text)>2097152 then raise exception 'RF_INVALID_INPUT';end if;
 for r in select value from jsonb_array_elements(p->'rows') loop
  if not public.ingestion_keys(r,array['position','externalId','url','state','fields']) or jsonb_typeof(r->'position') is distinct from 'number' or jsonb_typeof(r->'externalId') is distinct from 'string'
  or length(btrim(r->>'externalId')) not between 1 and 200 or jsonb_typeof(r->'url') is distinct from 'string' or jsonb_typeof(r->'fields') is distinct from 'object'
  or coalesce(r->>'state','') not in ('active','closed') or (r->>'state'='closed' and not c.allow_closure) or octet_length(r::text)>65536 then raise exception 'RF_INVALID_INPUT';end if;
  v_position:=(r->>'position')::integer;if v_position<1 or v_position>(p->>'total')::integer or v_position=any(positions) or r->>'externalId'=any(external_ids) then raise exception 'RF_INVALID_INPUT';end if;
  positions:=array_append(positions,v_position);external_ids:=array_append(external_ids,r->>'externalId');
  if (s.kind='jobs' and not public.catalog_valid_link(p_source,r->>'url')) or (s.kind='courses' and not public.learning_valid_source(p_source,(select provider_id from public.course_source_providers where source_id=p_source),r->>'url')) then raise exception 'RF_INVALID_INPUT';end if;
  for field in select jsonb_object_keys(r->'fields') loop
   if s.kind='jobs' then
    if not field=any(array['company','title','track','specialization','location','workplace','level','salary','summary','responsibilities','requirements','conditions','expiresAt']) or (field='expiresAt' and not c.allow_closure) or (field<>'expiresAt' and not field=any(s.permitted_fields)) then raise exception 'RF_INVALID_INPUT';end if;
   else
    permission:=case when field in ('prerequisiteSkills','prerequisiteCourseIds') then 'prerequisites' when field in ('officialMinutes','editorialMinutes','durationNote') then 'duration' else field end;
    if not field=any(array['title','summary','skills','prerequisiteSkills','prerequisiteCourseIds','language','difficulty','format','officialMinutes','editorialMinutes','durationNote','practice']) or not permission=any(s.permitted_fields) then raise exception 'RF_INVALID_INPUT';end if;
   end if;
  end loop;
 end loop;
 for r in select value from jsonb_array_elements(p->'rejected') loop
  if not public.ingestion_keys(r,array['position','externalId','issues']) or jsonb_typeof(r->'position') is distinct from 'number' or jsonb_typeof(r->'issues') is distinct from 'array' or jsonb_array_length(r->'issues') not between 1 and 30
  or (r->'externalId'<>'null'::jsonb and (jsonb_typeof(r->'externalId') is distinct from 'string' or length(r->>'externalId')>200)) then raise exception 'RF_INVALID_INPUT';end if;
  v_position:=(r->>'position')::integer;if v_position<1 or v_position>(p->>'total')::integer or v_position=any(positions) then raise exception 'RF_INVALID_INPUT';end if;positions:=array_append(positions,v_position);
  if exists(select 1 from jsonb_array_elements(r->'issues') i where not public.ingestion_keys(i,array['code','field','blocking']) or i->>'code' not in ('invalid-record','duplicate-external-id','invalid-url','forbidden-field','invalid-field','invalid-cell','invalid-columns','unmapped-skill','ambiguous-skill','required-field','cross-source-match','explicit-closure','closure-not-permitted','unchanged') or jsonb_typeof(i->'blocking') is distinct from 'boolean' or i->>'field' not in ('record','externalId','url','state','unknown','company','title','track','specialization','location','workplace','level','salary','summary','responsibilities','requirements','conditions','expiresAt','skills','prerequisiteSkills','prerequisiteCourseIds','language','difficulty','format','officialMinutes','editorialMinutes','durationNote','practice')) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create or replace function public.ingestion_batch_submit(p_source uuid,p_batch text,p_fingerprint text,p_content jsonb,p_key text,p_raw_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();b public.import_batches%rowtype;r public.import_requests%rowtype;v_hash text;v_task uuid;v_id uuid;
begin
 if p_raw_hash is null or p_raw_hash !~ '^[a-f0-9]{64}$' or p_batch is null or length(btrim(p_batch)) not between 1 and 120 or p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 v_hash:=md5(jsonb_build_array(p_source,p_batch,p_fingerprint,p_content,p_raw_hash)::text);
 select * into r from public.import_requests where actor_id=u and request_key=p_key;
 if found then if r.request_hash<>v_hash then raise exception 'RF_CONFLICT';end if;return public.ingestion_batch_json(r.batch_id);end if;
 if (select count(*) from public.import_requests where actor_id=u)>=5000 then raise exception 'RF_INGESTION_LIMIT';end if;
 select * into b from public.import_batches where source_id=p_source and batch_key=p_batch;
 if found then if b.input_hash<>v_hash then raise exception 'RF_CONFLICT';end if;insert into public.import_requests values(u,p_key,v_hash,b.id);return public.ingestion_batch_json(b.id);end if;
 if p_fingerprint is distinct from public.ingestion_source_json(p_source)->>'fingerprint' then raise exception 'RF_STALE_INPUT';end if;
 perform public.ingestion_require_mode(p_source,'upload');perform public.ingestion_validate_content(p_source,p_content);
 if (select count(*) from public.import_batches where source_id=p_source)>=200 then raise exception 'RF_INGESTION_LIMIT';end if;
 insert into public.import_batches(source_id,batch_key,source_fingerprint,created_by,content,input_hash) values(p_source,p_batch,p_fingerprint,u,p_content,v_hash) returning id into v_id;
 v_task:=public.task_enqueue(u,'catalog.import',v_id,v_hash,p_key,v_hash);update public.import_batches set task_id=v_task where id=v_id;
 insert into public.import_requests values(u,p_key,v_hash,v_id);insert into public.ingestion_audit(actor_id,resource_id,action) values(u,v_id,'batch.submitted');return public.ingestion_batch_json(v_id);
end $$;
create or replace function public.ingestion_review_context(p_id uuid,p_expected bigint,p_target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();r public.review_items%rowtype;b public.import_batches%rowtype;ctx jsonb;original jsonb;v_existing jsonb;v_matches jsonb;v_target jsonb;v_row jsonb;
begin
 select * into r from public.review_items where id=p_id for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if r.revision is distinct from p_expected or r.state not in ('pending','unchanged') then raise exception 'RF_CONFLICT';end if;
 if not exists(select 1 from public.source_records sr where sr.id=r.source_record_id and sr.latest_batch_id=r.batch_id) then raise exception 'RF_STALE_INPUT';end if;
 select * into b from public.import_batches where id=r.batch_id;perform public.ingestion_require_mode(b.source_id,b.input_origin);
 original:=r.normalized;v_row:=jsonb_build_object('position',1,'externalId',original->'externalId','url',original->'url','state',original->'state','fields',original->'sourceFields');
 perform public.ingestion_validate_content(b.source_id,jsonb_build_object('rows',jsonb_build_array(v_row),'rejected','[]'::jsonb,'total',1));
 ctx:=public.ingestion_context(b.id);
 select value into v_existing from jsonb_array_elements(ctx->'existing') where value->>'externalId'=original->>'externalId';
 select value into v_matches from jsonb_array_elements(ctx->'matches') where value->>'externalId'=original->>'externalId';
 if p_target is not null then
  if v_existing is not null and v_existing->'target'->>'id'<>p_target::text then raise exception 'RF_CONFLICT';end if;
  if v_existing is null then
   if not exists(select 1 from jsonb_array_elements(v_matches->'candidates') c where c->>'id'=p_target::text) then raise exception 'RF_INVALID_INPUT';end if;
   v_target:=case ctx->'source'->>'kind' when 'jobs' then public.catalog_ingestion_target(p_target) else public.learning_ingestion_target(p_target) end;
   if v_target is null then raise exception 'RF_NOT_FOUND';end if;
   v_existing:=jsonb_build_object('externalId',original->'externalId','url',original->'url','target',v_target);
  end if;
 end if;
 ctx:=jsonb_set(jsonb_set(ctx,'{existing}',case when v_existing is null then '[]'::jsonb else jsonb_build_array(v_existing) end),'{matches}',case when v_matches is null then '[]'::jsonb else jsonb_build_array(v_matches) end);
 return jsonb_build_object('content',jsonb_build_object('rows',jsonb_build_array(v_row),'rejected','[]'::jsonb,'total',1),'context',ctx,'position',r.position);
end $$;
create or replace function public.ingestion_worker_lock(p_task uuid,p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;t public.tasks%rowtype;b public.import_batches%rowtype;
begin
 select user_id into u from public.tasks where id=p_task;if u is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('courses:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(u) or not exists(select 1 from public.profiles where user_id=u and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 if p_token is null or t.kind<>'catalog.import' or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 select * into b from public.import_batches where id=t.source_ref for update;
 if not found or b.created_by is distinct from u or b.task_id<>t.id or b.input_hash<>t.input_version or b.source_fingerprint is distinct from public.ingestion_source_json(b.source_id)->>'fingerprint' or public.ingestion_source_json(b.source_id)->>'status'<>'active' then raise exception 'RF_STALE_INPUT';end if;
 perform public.ingestion_require_mode(b.source_id,b.input_origin);return b.id;
end $$;
create or replace function public.ingestion_batch_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.input_origin,new.id,new.source_id,new.batch_key,new.source_fingerprint,new.content,new.input_hash,new.sequence,new.created_at) is distinct from (old.input_origin,old.id,old.source_id,old.batch_key,old.source_fingerprint,old.content,old.input_hash,old.sequence,old.created_at)
 or (old.context_snapshot is not null and new.context_snapshot is distinct from old.context_snapshot)
 or (old.output is not null and new.output is distinct from old.output)
 or (new.created_by is distinct from old.created_by and new.created_by is not null) then raise exception 'RF_IMMUTABLE';end if;return new;
end $$;
create function public.ingestion_feed_setting_json(p_source uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sourceId',s.id,'name',s.name,'kind',s.kind,'sourceStatus',s.status,'revision',coalesce(f.revision,0),
 'feedId',f.feed_id,'feedRevision',f.feed_revision,'enabled',coalesce(f.enabled,false),'intervalMinutes',coalesce(f.interval_seconds/60,1440),
 'ownerId',f.owner_id,'nextFetchAt',f.next_fetch_at,'manualPause',coalesce(f.manual_pause,false),'pauseUntil',f.pause_until,'providerWait',f.provider_wait,'lastError',f.last_error)
 from public.sources s left join public.ingestion_feed_settings f on f.source_id=s.id where s.id=p_source
$$;
create function public.ingestion_feed_settings_list() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();begin
 return coalesce((select jsonb_agg(public.ingestion_feed_setting_json(s.id) order by s.created_at desc) from public.sources s),'[]'::jsonb);
end $$;
create function public.ingestion_feed_configure(p_source uuid,p_expected bigint,p_feed text,p_revision text,p_enabled boolean,p_minutes integer,p_resume boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();f public.ingestion_feed_settings%rowtype;v_changed boolean;
begin
 if p_expected is null or p_expected<0 or p_feed is null or p_feed !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or p_revision is null or p_revision !~ '^[a-f0-9]{64}$' or p_enabled is null or p_resume is null or p_minutes is null or p_minutes not between 15 and 10080 then raise exception 'RF_INVALID_INPUT';end if;
 if not exists(select 1 from public.sources where id=p_source and status='active') then raise exception 'RF_NOT_FOUND';end if;
 select * into f from public.ingestion_feed_settings where source_id=p_source for update;
 if coalesce(f.revision,0)<>p_expected then raise exception 'RF_CONFLICT';end if;
 v_changed:=f.feed_id is distinct from p_feed or f.feed_revision is distinct from p_revision;
 if p_resume and f.pause_until>clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 insert into public.ingestion_feed_settings(source_id,feed_id,feed_revision,enabled,interval_seconds,owner_id) values(p_source,p_feed,p_revision,p_enabled,p_minutes*60,u)
 on conflict(source_id) do update set feed_id=p_feed,feed_revision=p_revision,enabled=p_enabled,interval_seconds=p_minutes*60,owner_id=u,revision=public.ingestion_feed_settings.revision+1,updated_at=clock_timestamp(),next_fetch_at=clock_timestamp(),
 manual_pause=case when p_resume then false else public.ingestion_feed_settings.manual_pause end,
 pause_until=case when p_resume then null else public.ingestion_feed_settings.pause_until end,
 provider_wait=case when p_resume then null else public.ingestion_feed_settings.provider_wait end,
 last_error=case when p_resume then null else public.ingestion_feed_settings.last_error end;
 insert into public.ingestion_settings(source_id,updated_by) values(p_source,u) on conflict(source_id) do nothing;
 insert into public.ingestion_audit(actor_id,resource_id,action) values(u,p_source,'source.feed_settings');return public.ingestion_feed_setting_json(p_source);
end $$;
create function public.ingestion_feed_run_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'sourceId',r.source_id,'feedId',r.feed_id,'feedRevision',r.feed_revision,'taskId',r.task_id,'batchId',r.batch_id,'status',case when r.batch_id is not null then 'succeeded' else coalesce(t.status,'failed') end,'errorCode',coalesce(r.last_error,t.safe_error),'createdAt',r.created_at)
 from public.ingestion_feed_runs r left join public.tasks t on t.id=r.task_id where r.id=p_id
$$;
create function public.ingestion_feed_enqueue(p_actor uuid,p_source uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.ingestion_feed_settings%rowtype;r public.ingestion_feed_runs%rowtype;policy jsonb;v_id uuid;v_task uuid;v_hash text;
begin
 -- Caller holds the producer locks before the owner lock, matching other worker mutations.
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_actor::text,0));
 if not public.identity_is_active(p_actor) or not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 select * into f from public.ingestion_feed_settings where source_id=p_source for update;
 perform public.ingestion_require_mode(p_source,'feed');policy:=public.ingestion_source_json(p_source);
 select * into r from public.ingestion_feed_runs where source_id=p_source and request_key=p_key;
 if found then if r.source_fingerprint is distinct from policy->>'fingerprint' or r.created_by is distinct from p_actor then raise exception 'RF_CONFLICT';end if;return public.ingestion_feed_run_json(r.id);end if;
 if f.manual_pause or f.pause_until>clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 if exists(select 1 from public.ingestion_feed_runs x join public.tasks t on t.id=x.task_id where x.source_id=p_source and x.settings_revision=f.revision and t.status in ('queued','running')) then raise exception 'RF_CONFLICT';end if;
 if (select count(*) from public.ingestion_feed_runs where source_id=p_source)>=500 then raise exception 'RF_INGESTION_LIMIT';end if;
 v_hash:=md5(jsonb_build_array(p_source,p_key,policy->>'fingerprint',f.feed_id,f.feed_revision)::text);
 insert into public.ingestion_feed_runs(source_id,request_key,settings_revision,source_fingerprint,feed_id,feed_revision,input_hash,created_by) values(p_source,p_key,f.revision,policy->>'fingerprint',f.feed_id,f.feed_revision,v_hash,p_actor) returning id into v_id;
 v_task:=public.task_enqueue(p_actor,'catalog.fetch',v_id,v_hash,'feed:'||v_id::text,v_hash);
 update public.ingestion_feed_runs set task_id=v_task where id=v_id;
 update public.ingestion_feed_settings set next_fetch_at=clock_timestamp()+make_interval(secs=>interval_seconds) where source_id=p_source;
 insert into public.ingestion_audit(actor_id,resource_id,action) values(p_actor,v_id,'feed.queued');return public.ingestion_feed_run_json(v_id);
end $$;
create function public.ingestion_feed_request(p_source uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();begin
 if p_key is null or length(p_key) not between 8 and 120 then raise exception 'RF_INVALID_INPUT';end if;
 return public.ingestion_feed_enqueue(u,p_source,'manual:'||u::text||':'||p_key);
end $$;
create function public.ingestion_feed_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();v jsonb:=public.ingestion_feed_run_json(p_id);begin if v is null then raise exception 'RF_NOT_FOUND';end if;return v;end $$;
create function public.ingestion_feed_runs_list() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();begin
 return coalesce((select jsonb_agg(public.ingestion_feed_run_json(id) order by sequence desc) from(select id,sequence from public.ingestion_feed_runs order by sequence desc limit 20) page),'[]'::jsonb);
end $$;
create function public.ingestion_schedule_due(p_definitions jsonb,p_limit integer default 10) returns integer language plpgsql security definer set search_path='' as $$
declare f public.ingestion_feed_settings%rowtype;count integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 20 or jsonb_typeof(p_definitions) is distinct from 'array' or jsonb_array_length(p_definitions)>50 then raise exception 'RF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('courses:write',0));
 for f in select c.* from public.ingestion_feed_settings c join public.sources s on s.id=c.source_id join public.profiles p on p.user_id=c.owner_id
 where c.enabled and not c.manual_pause and (c.pause_until is null or c.pause_until<=clock_timestamp()) and c.next_fetch_at<=clock_timestamp() and s.status='active' and p.role='admin' and public.identity_is_active(c.owner_id)
 and exists(select 1 from jsonb_array_elements(p_definitions) d where d->>'id'=c.feed_id and d->>'revision'=c.feed_revision and d->>'kind'=s.kind)
 and not exists(select 1 from public.ingestion_feed_runs r join public.tasks t on t.id=r.task_id where r.source_id=c.source_id and r.settings_revision=c.revision and t.status in ('queued','running')) order by c.owner_id,c.source_id limit p_limit for update of c
 loop
  begin perform public.ingestion_feed_enqueue(f.owner_id,f.source_id,'scheduled:'||f.revision::text||':'||extract(epoch from f.next_fetch_at)::text);count:=count+1;
  exception when raise_exception then if sqlerrm not in ('RF_CONFLICT','RF_INGESTION_LIMIT','RF_FORBIDDEN') then raise;end if;end;
 end loop;return count;
end $$;
create function public.ingestion_feed_worker_lock(p_task uuid,p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;t public.tasks%rowtype;r public.ingestion_feed_runs%rowtype;f public.ingestion_feed_settings%rowtype;
begin
 select user_id into u from public.tasks where id=p_task;if u is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('courses:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(u) or not exists(select 1 from public.profiles where user_id=u and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 if p_token is null or t.kind<>'catalog.fetch' or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 select * into r from public.ingestion_feed_runs where id=t.source_ref for update;select * into f from public.ingestion_feed_settings where source_id=r.source_id;
 if r.id is null or r.task_id is distinct from t.id or r.created_by is distinct from u or r.input_hash<>t.input_version or r.batch_id is not null or r.source_fingerprint is distinct from public.ingestion_source_json(r.source_id)->>'fingerprint' or not f.enabled or f.manual_pause or f.revision<>r.settings_revision then raise exception 'RF_STALE_INPUT';end if;
 perform public.ingestion_require_mode(r.source_id,'feed');return r.id;
end $$;
create function public.ingestion_feed_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=public.ingestion_feed_worker_lock(p_task,p_token);r public.ingestion_feed_runs%rowtype;
begin select * into r from public.ingestion_feed_runs where id=v_id;return jsonb_build_object('source',public.ingestion_source_json(r.source_id),'feedId',r.feed_id,'feedRevision',r.feed_revision,'waitSeconds',coalesce((select least(86400,greatest(0,ceil(extract(epoch from pause_until-clock_timestamp()))))::integer from public.ingestion_feed_settings where source_id=r.source_id),0));end $$;
create function public.ingestion_feed_prepare(p_task uuid,p_token uuid,p_content jsonb,p_raw_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=public.ingestion_feed_worker_lock(p_task,p_token);r public.ingestion_feed_runs%rowtype;v_batch uuid;v_task uuid;v_hash text;
begin
 select * into r from public.ingestion_feed_runs where id=v_id;
 if p_raw_hash is null or p_raw_hash !~ '^[a-f0-9]{64}$' then raise exception 'RF_INVALID_INPUT';end if;
 perform public.ingestion_validate_content(r.source_id,p_content);
 if (select count(*) from public.import_batches where source_id=r.source_id)>=200 then raise exception 'RF_INGESTION_LIMIT';end if;
 v_hash:=md5(jsonb_build_array(r.source_id,r.id,r.source_fingerprint,p_content,p_raw_hash)::text);
 insert into public.import_batches(source_id,batch_key,source_fingerprint,created_by,content,input_hash,input_origin) values(r.source_id,'feed:'||r.id::text,r.source_fingerprint,r.created_by,p_content,v_hash,'feed') returning id into v_batch;
 v_task:=public.task_enqueue(r.created_by,'catalog.import',v_batch,v_hash,'feed-batch:'||r.id::text,v_hash);update public.import_batches set task_id=v_task where id=v_batch;
 -- Recheck the exact lease after all inserts. A failed commit seals no input.
 perform public.ingestion_feed_worker_lock(p_task,p_token);
 update public.ingestion_feed_runs set batch_id=v_batch,last_error=null where id=v_id;
 update public.ingestion_feed_settings set last_error=null where source_id=r.source_id;
 update public.tasks set status='succeeded',result_ref=v_batch,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null where id=p_task;
 insert into public.ingestion_audit(actor_id,resource_id,action) values(r.created_by,v_batch,'feed.input_sealed');return v_batch;
end $$;
-- Producer-owned freshness mutation preserves versions, closure and historical references.
create function public.catalog_ingestion_uncertain(p_source uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||p_actor::text,0));
 if not public.identity_is_active(p_actor) or not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 update public.job_sources set freshness=case when freshness='closed' then 'closed' else 'uncertain' end,last_attempt_at=clock_timestamp() where source_id=p_source;
 if found then perform public.catalog_touch(p_actor,'source.observed.network_failure',p_source);end if;
end $$;
create function public.learning_ingestion_uncertain(p_source uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('courses:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||p_actor::text,0));
 if not public.identity_is_active(p_actor) or not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 update public.courses c set availability='uncertain',revision=c.revision+1 from public.course_versions v where v.course_id=c.id and v.version=c.published_version and v.source_id=p_source and not c.retired and c.availability<>'uncertain';
 if found then perform public.learning_catalog_touch(p_actor,'source.network_failure',p_source,'Authorized feed retrieval failed; prior versions retained.');end if;
end $$;
create function public.ingestion_feed_failure(p_task uuid,p_token uuid,p_code text,p_wait text,p_manual boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid:=public.ingestion_feed_worker_lock(p_task,p_token);r public.ingestion_feed_runs%rowtype;v_until timestamptz;v_wait numeric;
begin
 select * into r from public.ingestion_feed_runs where id=v_id;
 if p_manual is null or p_code is null or p_code not in ('blocked','network','timeout','rate-limit','redirect','too-large','media-type','http-error','invalid-content') or (p_wait is not null and (length(p_wait)>100 or p_wait !~ '^[0-9]+(\.[0-9]+)?([eE]\+?[0-9]+)?$')) then raise exception 'RF_INVALID_INPUT';end if;
 if p_wait is not null then v_wait:=p_wait::numeric;if v_wait<0 or (v_wait>86400 and not p_manual) then raise exception 'RF_INVALID_INPUT';end if;
 v_until:=case when v_wait>315360000 then 'infinity'::timestamptz else clock_timestamp()+make_interval(secs=>v_wait::double precision) end;end if;
 if p_manual and v_until is null then v_until:='infinity'::timestamptz;end if;
 update public.ingestion_feed_runs set last_error=p_code where id=v_id;
 update public.ingestion_feed_settings set last_error=p_code,manual_pause=manual_pause or p_manual,provider_wait=p_wait,pause_until=case when v_until is null then pause_until else greatest(pause_until,v_until) end where source_id=r.source_id;
 if public.ingestion_source_json(r.source_id)->>'kind'='jobs' then perform public.catalog_ingestion_uncertain(r.source_id,r.created_by);else perform public.learning_ingestion_uncertain(r.source_id,r.created_by);end if;
 -- Freshness and failure state roll back together if the lease expires during the mutation.
 if not exists(select 1 from public.tasks where id=p_task and status='running' and lease_token=p_token and lease_expires_at>clock_timestamp()) then raise exception 'RF_CONFLICT';end if;
 insert into public.ingestion_audit(actor_id,resource_id,action) values(r.created_by,v_id,case when p_manual then 'feed.manual_pause' else 'feed.failed_attempt' end);
end $$;
create function public.ingestion_feed_run_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.sequence,new.source_id,new.request_key,new.settings_revision,new.source_fingerprint,new.feed_id,new.feed_revision,new.input_hash,new.created_at) is distinct from (old.id,old.sequence,old.source_id,old.request_key,old.settings_revision,old.source_fingerprint,old.feed_id,old.feed_revision,old.input_hash,old.created_at)
 or (new.created_by is distinct from old.created_by and new.created_by is not null) or (old.batch_id is not null and new.batch_id is distinct from old.batch_id) then raise exception 'RF_IMMUTABLE';end if;return new;
end $$;
create trigger ingestion_feed_run_immutable before update on public.ingestion_feed_runs for each row execute function public.ingestion_feed_run_immutable();
do $$ declare t text;r record;begin
 foreach t in array array['ingestion_feed_settings','ingestion_feed_runs'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
 for r in select oid::regprocedure name from pg_proc where pronamespace='public'::regnamespace and (proname like 'ingestion\_%' escape '\' or proname in ('catalog_ingestion_uncertain','learning_ingestion_uncertain')) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.name);execute format('grant execute on function %s to service_role',r.name);
 end loop;
end $$;
grant execute on function public.ingestion_source_find(uuid),public.ingestion_settings_list(),public.ingestion_settings_update(uuid,bigint,boolean,boolean),public.ingestion_batch_find(uuid),public.ingestion_batches_list(bigint),public.ingestion_batch_submit(uuid,text,text,jsonb,text,text),public.ingestion_review_find(uuid),public.ingestion_review_context(uuid,bigint,uuid),public.ingestion_review_rebase(uuid,bigint,uuid,text,bigint,jsonb),public.ingestion_review_decide(uuid,bigint,text,jsonb,text,boolean,text),public.ingestion_feed_settings_list(),public.ingestion_feed_configure(uuid,bigint,text,text,boolean,integer,boolean),public.ingestion_feed_request(uuid,text),public.ingestion_feed_find(uuid),public.ingestion_feed_runs_list() to authenticated;
