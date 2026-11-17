-- Sanitized uploads, source authority and durable review planning.
alter table public.sources add column import_policy_revision bigint not null default 1;
create function public.ingestion_source_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.kind,new.status,new.authorization_basis,new.allowed_hosts,new.permitted_fields,new.rights_summary) is distinct from (old.kind,old.status,old.authorization_basis,old.allowed_hosts,old.permitted_fields,old.rights_summary) then new.import_policy_revision:=old.import_policy_revision+1;end if;return new;
end $$;
create trigger ingestion_source_revision before update on public.sources for each row execute function public.ingestion_source_revision();
create table public.ingestion_settings(
 source_id uuid primary key references public.sources(id),revision bigint not null default 1,
 uploads_enabled boolean not null default false,allow_closure boolean not null default false,
 updated_by uuid references public.profiles(user_id) on delete set null,updated_at timestamptz not null default clock_timestamp()
);
create table public.import_batches(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,
 source_id uuid not null references public.sources(id),batch_key text not null,source_fingerprint text not null,
 created_by uuid references public.profiles(user_id) on delete set null,task_id uuid references public.tasks(id) on delete set null,
 content jsonb not null,input_hash text not null,context_snapshot jsonb,output jsonb,
 stage text not null default 'queued' check(stage in ('queued','review')),revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(),unique(source_id,batch_key)
);
create index import_batch_history on public.import_batches(sequence desc);
create table public.import_requests(
 actor_id uuid not null references public.profiles(user_id) on delete cascade,request_key text not null,
 request_hash text not null,batch_id uuid not null references public.import_batches(id),primary key(actor_id,request_key)
);
create table public.source_records(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.sources(id),external_id text not null,
 target_id uuid,latest_batch_id uuid references public.import_batches(id),source_fields jsonb not null default '{}'::jsonb,
 original_url text not null,state text not null check(state in ('active','closed')),revision bigint not null default 1,
 unique(source_id,external_id)
);
create table public.review_items(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.import_batches(id),position integer not null,
 source_record_id uuid references public.source_records(id),normalized jsonb not null,
 state text not null default 'pending' check(state in ('pending','unchanged','published','rejected')),
 revision bigint not null default 1,created_at timestamptz not null default clock_timestamp(),unique(batch_id,position)
);
create table public.ingestion_audit(
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(user_id) on delete set null,
 resource_id uuid,action text not null,created_at timestamptz not null default clock_timestamp()
);
create function public.ingestion_admin_lock() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.learning_admin_lock();
begin perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_admin();return u;end $$;
create function public.ingestion_source_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'kind',s.kind,'status',case when s.status='active' and coalesce(cfg.uploads_enabled,false) then 'active' else 'revoked' end,
 'fingerprint',md5(jsonb_build_array(s.import_policy_revision,coalesce(cfg.revision,0),s.status,s.allowed_hosts,s.permitted_fields,s.authorization_basis,s.rights_summary,p.id,p.path_prefixes,p.url_identity)::text),
 'allowedHosts',s.allowed_hosts,'permittedFields',s.permitted_fields,'allowClosure',coalesce(cfg.allow_closure,false),
 'provider',case when p.id is null then null else jsonb_build_object('id',p.id,'pathPrefixes',p.path_prefixes,'urlIdentity',p.url_identity) end)
 from public.sources s left join public.ingestion_settings cfg on cfg.source_id=s.id left join public.course_source_providers cp on cp.source_id=s.id left join public.course_providers p on p.id=cp.provider_id where s.id=p_id
$$;
create function public.ingestion_source_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();v jsonb:=public.ingestion_source_json(p_id);
begin if v is null then raise exception 'RF_NOT_FOUND';end if;return v;end $$;
create function public.ingestion_settings_list() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();begin
 return coalesce((select jsonb_agg(public.ingestion_source_json(s.id)||jsonb_build_object('name',s.name,'sourceStatus',s.status,'revision',coalesce(c.revision,0),'uploadsEnabled',coalesce(c.uploads_enabled,false)) order by s.created_at desc) from public.sources s left join public.ingestion_settings c on c.source_id=s.id),'[]'::jsonb);
end $$;
create function public.ingestion_settings_update(p_source uuid,p_expected bigint,p_uploads boolean,p_closure boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();c public.ingestion_settings%rowtype;
begin
 if p_uploads is null or p_closure is null or p_expected is null or p_expected<0 then raise exception 'RF_INVALID_INPUT';end if;
 if not exists(select 1 from public.sources where id=p_source and status='active') then raise exception 'RF_NOT_FOUND';end if;
 select * into c from public.ingestion_settings where source_id=p_source for update;
 if coalesce(c.revision,0)<>p_expected then raise exception 'RF_CONFLICT';end if;
 insert into public.ingestion_settings(source_id,uploads_enabled,allow_closure,updated_by) values(p_source,p_uploads,p_closure,u)
 on conflict(source_id) do update set uploads_enabled=p_uploads,allow_closure=p_closure,revision=public.ingestion_settings.revision+1,updated_by=u,updated_at=clock_timestamp();
 insert into public.ingestion_audit(actor_id,resource_id,action) values(u,p_source,'source.import_settings');return public.ingestion_source_json(p_source);
end $$;
create function public.ingestion_keys(p jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(case when jsonb_typeof(p)='object' then (select array_agg(x order by x) from jsonb_object_keys(p) x)=(select array_agg(x order by x) from unnest(k) x) else false end,false)
$$;
create function public.ingestion_validate_content(p_source uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.sources%rowtype;c public.ingestion_settings%rowtype;r jsonb;field text;permission text;positions integer[]:='{}';external_ids text[]:='{}';v_position integer;
begin
 select * into s from public.sources where id=p_source;select * into c from public.ingestion_settings where source_id=p_source;
 if s.status is distinct from 'active' or c.uploads_enabled is distinct from true then raise exception 'RF_FORBIDDEN';end if;
 if not public.ingestion_keys(p,array['rows','rejected','total']) or jsonb_typeof(p->'rows') is distinct from 'array' or jsonb_typeof(p->'rejected') is distinct from 'array' or jsonb_typeof(p->'total') is distinct from 'number'
 or (p->>'total')::integer not between 1 and 100 or jsonb_array_length(p->'rows')+jsonb_array_length(p->'rejected')<>(p->>'total')::integer or octet_length(p::text)>2097152 then raise exception 'RF_INVALID_INPUT';end if;
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
create function public.ingestion_batch_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'sourceId',b.source_id,'batchId',b.batch_key,'revision',b.revision,'stage',b.stage,'status',coalesce(t.status,'failed'),'errorCode',t.safe_error,'taskId',b.task_id,'createdAt',b.created_at,
 'sourceCurrent',b.source_fingerprint=public.ingestion_source_json(b.source_id)->>'fingerprint' and public.ingestion_source_json(b.source_id)->>'status'='active',
 'total',b.content->'total','rejected',b.content->'rejected',
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'state',r.state,'normalized',r.normalized) order by r.position) from public.review_items r where r.batch_id=b.id),'[]'::jsonb)) from public.import_batches b left join public.tasks t on t.id=b.task_id where b.id=p_id
$$;
create function public.ingestion_batch_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();v jsonb:=public.ingestion_batch_json(p_id);begin if v is null then raise exception 'RF_NOT_FOUND';end if;return v;end $$;
create function public.ingestion_batches_list(p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();v_data jsonb;v_last bigint;
begin
 select coalesce(jsonb_agg((public.ingestion_batch_json(id)-'items'-'rejected')||jsonb_build_object('rejectedCount',jsonb_array_length(public.ingestion_batch_json(id)->'rejected')) order by sequence desc),'[]'::jsonb),min(sequence) into v_data,v_last from(select id,sequence from public.import_batches where p_before is null or sequence<p_before order by sequence desc limit 20) page;
 return jsonb_build_object('data',v_data,'lastSequence',case when exists(select 1 from public.import_batches where sequence<v_last) then v_last::text else null end);
end $$;
create function public.ingestion_batch_submit(p_source uuid,p_batch text,p_fingerprint text,p_content jsonb,p_key text,p_raw_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 perform public.ingestion_validate_content(p_source,p_content);
 if (select count(*) from public.import_batches where source_id=p_source)>=200 then raise exception 'RF_INGESTION_LIMIT';end if;
 insert into public.import_batches(source_id,batch_key,source_fingerprint,created_by,content,input_hash) values(p_source,p_batch,p_fingerprint,u,p_content,v_hash) returning id into v_id;
 v_task:=public.task_enqueue(u,'catalog.import',v_id,v_hash,p_key,v_hash);update public.import_batches set task_id=v_task where id=v_id;
 insert into public.import_requests values(u,p_key,v_hash,v_id);insert into public.ingestion_audit(actor_id,resource_id,action) values(u,v_id,'batch.submitted');return public.ingestion_batch_json(v_id);
end $$;
-- Producer-owned current drafts, including unpublished curation.
create function public.catalog_ingestion_target(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('kind','jobs','id',j.id,'versionId',v.id,'revision',j.revision,'draft',jsonb_build_object('canonicalKey',j.canonical_key,'company',v.company_name,'title',v.title,'track',v.track,'specialization',v.specialization,'location',v.location,'workplace',v.workplace,'level',v.level,
 'salary',case when v.salary_min is null and v.salary_max is null then null else jsonb_build_object('min',v.salary_min,'max',v.salary_max,'currency',v.salary_currency,'interval',v.salary_interval) end,
 'summary',v.summary,'responsibilities',v.responsibilities,'conditions',v.conditions,'expiresAt',j.expires_at,
 'requirements',(select coalesce(jsonb_agg(jsonb_build_object('text',r.text,'priority',r.priority,'skills',coalesce((select jsonb_agg(distinct canonical_skill_id order by canonical_skill_id) from public.job_skill_links where requirement_id=r.id),'[]'::jsonb)) order by r.ordinal),'[]'::jsonb) from public.job_requirements r where r.job_version_id=v.id)))
 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version where j.id=p_id
$$;
create function public.learning_ingestion_target(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('kind','courses','id',c.id,'versionId',v.id,'revision',c.revision,'draft',v.metadata||jsonb_build_object('skills',coalesce((select jsonb_agg(distinct canonical_skill_id order by canonical_skill_id) from public.course_skill_links where course_version_id=v.id and kind='teaches'),'[]'::jsonb),'prerequisiteSkills',coalesce((select jsonb_agg(distinct canonical_skill_id order by canonical_skill_id) from public.course_skill_links where course_version_id=v.id and kind='prerequisite'),'[]'::jsonb)))
 from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.current_version where c.id=p_id
$$;
create function public.ingestion_context(p_batch uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.import_batches%rowtype;s public.sources%rowtype;r jsonb;v_target jsonb;v_url text;v_id uuid;v_existing jsonb:='[]';v_matches jsonb:='[]';v_candidates jsonb;
begin
 select * into b from public.import_batches where id=p_batch;select * into s from public.sources where id=b.source_id;
 for r in select value from jsonb_array_elements(b.content->'rows') loop
  v_target:=null;v_id:=null;v_url:=null;
  if s.kind='jobs' then select job_id,original_url into v_id,v_url from public.job_sources where source_id=s.id and external_id=r->>'externalId';if v_id is not null then v_target:=public.catalog_ingestion_target(v_id);end if;
  else select target_id,original_url into v_id,v_url from public.source_records where source_id=s.id and external_id=r->>'externalId';if v_id is not null then v_target:=public.learning_ingestion_target(v_id);end if;end if;
  if v_target is not null then v_existing:=v_existing||jsonb_build_array(jsonb_build_object('externalId',r->>'externalId','url',v_url,'target',v_target));
  else
   if s.kind='jobs' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'company',company_name)),'[]'::jsonb) into v_candidates from(select j.id,v.title,v.company_name from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version where (lower(btrim(v.title))=lower(btrim(r->'fields'->>'title')) and lower(btrim(v.company_name))=lower(btrim(r->'fields'->>'company'))) or exists(select 1 from public.job_sources l where l.job_id=j.id and split_part(l.original_url,'?',1)=split_part(r->>'url','?',1)) order by j.id limit 10) candidates;
   else
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'company',null)),'[]'::jsonb) into v_candidates from(select c.id,v.metadata->>'title' title from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.current_version where c.provider_id=(select provider_id from public.course_source_providers where source_id=s.id) and (lower(btrim(v.metadata->>'title'))=lower(btrim(r->'fields'->>'title')) or split_part(v.metadata->>'url','?',1)=split_part(r->>'url','?',1)) order by c.id limit 10) candidates;
   end if;
   v_matches:=v_matches||jsonb_build_array(jsonb_build_object('externalId',r->>'externalId','candidates',v_candidates));
  end if;
 end loop;
 return jsonb_build_object('source',public.ingestion_source_json(s.id),'dictionary',public.dictionary_get(),'existing',v_existing,'matches',v_matches);
end $$;
create function public.ingestion_worker_lock(p_task uuid,p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;t public.tasks%rowtype;b public.import_batches%rowtype;
begin
 select user_id into u from public.tasks where id=p_task;if u is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('courses:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(u) or not exists(select 1 from public.profiles where user_id=u and role='admin') then raise exception 'RF_FORBIDDEN';end if;
 if p_token is null or t.kind<>'catalog.import' or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 select * into b from public.import_batches where id=t.source_ref for update;
 if not found or b.created_by is distinct from u or b.task_id<>t.id or b.input_hash<>t.input_version or b.source_fingerprint is distinct from public.ingestion_source_json(b.source_id)->>'fingerprint' or public.ingestion_source_json(b.source_id)->>'status'<>'active' then raise exception 'RF_STALE_INPUT';end if;
 return b.id;
end $$;
create function public.ingestion_task_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=public.ingestion_worker_lock(p_task,p_token);b public.import_batches%rowtype;v_context jsonb;
begin
 select * into b from public.import_batches where id=v_id;
 if b.context_snapshot is null then
  v_context:=public.ingestion_context(v_id);if octet_length(v_context::text)>8388608 then raise exception 'RF_INGESTION_LIMIT';end if;
  update public.import_batches set context_snapshot=v_context where id=v_id;
 else v_context:=b.context_snapshot;end if;
 return jsonb_build_object('content',b.content,'context',v_context);
end $$;
create function public.ingestion_reference_key(p_source uuid,p_external text) returns text language sql stable security definer set search_path='' as $$
 select 'import-'||encode(extensions.digest('['||to_jsonb(kind)::text||','||to_jsonb(id::text)::text||','||to_jsonb(p_external)::text||']','sha256'),'hex') from public.sources where id=p_source
$$;
create function public.ingestion_task_publish(p_task uuid,p_token uuid,p_output jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=public.ingestion_worker_lock(p_task,p_token);b public.import_batches%rowtype;r jsonb;original jsonb;v_source_record uuid;v_seen integer[]:='{}';v_current jsonb;v_sealed jsonb;v_candidates jsonb;v_key text;
begin
 select * into b from public.import_batches where id=v_id;
 if b.context_snapshot is null or b.context_snapshot is distinct from public.ingestion_context(v_id) then raise exception 'RF_STALE_INPUT';end if;
 if p_output->>'recipe' is distinct from 'import-normalize-v1' or p_output->>'sourceFingerprint' is distinct from b.source_fingerprint or p_output->'dictionaryVersion' is distinct from b.context_snapshot->'dictionary'->'version' or p_output->'total' is distinct from b.content->'total' or p_output->'rejected' is distinct from b.content->'rejected' or jsonb_typeof(p_output->'rows') is distinct from 'array' or jsonb_array_length(p_output->'rows')<>jsonb_array_length(b.content->'rows') or octet_length(p_output::text)>4194304 then raise exception 'RF_INVALID_INPUT';end if;
 for r in select value from jsonb_array_elements(p_output->'rows') loop
  select value into original from jsonb_array_elements(b.content->'rows') where value->'position'=r->'position';
  if original is null or (r->>'position')::integer=any(v_seen) or r->'externalId' is distinct from original->'externalId' or r->'url' is distinct from original->'url' or r->'state' is distinct from original->'state' or r->'sourceFields' is distinct from original->'fields' or jsonb_typeof(r->'candidate') is distinct from 'object' or jsonb_typeof(r->'issues') is distinct from 'array' then raise exception 'RF_INVALID_INPUT';end if;
  v_seen:=array_append(v_seen,(r->>'position')::integer);
  select value->'target' into v_sealed from jsonb_array_elements(b.context_snapshot->'existing') where value->>'externalId'=r->>'externalId';
  if r->'targetId' is distinct from coalesce(v_sealed->'id','null'::jsonb) or r->'targetVersionId' is distinct from coalesce(v_sealed->'versionId','null'::jsonb) or r->'targetRevision' is distinct from coalesce(v_sealed->'revision','null'::jsonb) then raise exception 'RF_INVALID_INPUT';end if;
  select coalesce(jsonb_agg(candidate->'id'),'[]'::jsonb) into v_candidates from jsonb_array_elements(b.context_snapshot->'matches') match cross join lateral jsonb_array_elements(match->'candidates') candidate where match->>'externalId'=r->>'externalId';
  if r->'candidateIds' is distinct from v_candidates then raise exception 'RF_INVALID_INPUT';end if;
  v_key:=coalesce(v_sealed->'draft'->>case b.context_snapshot->'source'->>'kind' when 'jobs' then 'canonicalKey' else 'key' end,public.ingestion_reference_key(b.source_id,r->>'externalId'));
  if b.context_snapshot->'source'->>'kind'='jobs' then
   if r->'candidate'->>'canonicalKey' is distinct from v_key then raise exception 'RF_INVALID_INPUT';end if;
  else
   if r->'candidate'->>'key' is distinct from v_key or r->'candidate'->>'sourceId' is distinct from b.source_id::text or r->'candidate'->>'providerId' is distinct from b.context_snapshot->'source'->'provider'->>'id' or r->'candidate'->'url' is distinct from r->'url' then raise exception 'RF_INVALID_INPUT';end if;
  end if;
  if v_sealed is not null then
   v_current:=case b.context_snapshot->'source'->>'kind' when 'jobs' then public.catalog_ingestion_target((r->>'targetId')::uuid) else public.learning_ingestion_target((r->>'targetId')::uuid) end;
   if v_current is distinct from v_sealed then raise exception 'RF_STALE_INPUT';end if;
  end if;
  insert into public.source_records(source_id,external_id,latest_batch_id,source_fields,original_url,state) values(b.source_id,r->>'externalId',v_id,r->'sourceFields',r->>'url',r->>'state')
  on conflict(source_id,external_id) do update set latest_batch_id=v_id,source_fields=excluded.source_fields,original_url=excluded.original_url,state=excluded.state,revision=public.source_records.revision+1 where coalesce((select sequence from public.import_batches where id=public.source_records.latest_batch_id),0)<=b.sequence;
  select id into v_source_record from public.source_records where source_id=b.source_id and external_id=r->>'externalId';
  insert into public.review_items(batch_id,position,source_record_id,normalized,state) values(v_id,(r->>'position')::integer,v_source_record,r,case when r->>'disposition'='unchanged' then 'unchanged' else 'pending' end);
 end loop;
 -- A source change, owner change or lease loss during publication rolls back all rows.
 perform public.ingestion_worker_lock(p_task,p_token);
 update public.import_batches set stage='review',output=p_output,revision=revision+1 where id=v_id;
 update public.tasks set status='succeeded',result_ref=v_id,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null where id=p_task;
 insert into public.ingestion_audit(actor_id,resource_id,action) values(b.created_by,v_id,'batch.review_ready');return jsonb_build_object('resultRef',v_id);
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.ingestion_batch_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.source_id,new.batch_key,new.source_fingerprint,new.content,new.input_hash,new.sequence,new.created_at) is distinct from (old.id,old.source_id,old.batch_key,old.source_fingerprint,old.content,old.input_hash,old.sequence,old.created_at)
 or (old.context_snapshot is not null and new.context_snapshot is distinct from old.context_snapshot)
 or (old.output is not null and new.output is distinct from old.output)
 or (new.created_by is distinct from old.created_by and new.created_by is not null) then raise exception 'RF_IMMUTABLE';end if;return new;
end $$;
create trigger ingestion_batch_immutable before update on public.import_batches for each row execute function public.ingestion_batch_immutable();
create function public.ingestion_review_immutable() returns trigger language plpgsql set search_path='' as $$
begin if (new.id,new.batch_id,new.position,new.source_record_id,new.normalized,new.created_at) is distinct from (old.id,old.batch_id,old.position,old.source_record_id,old.normalized,old.created_at) then raise exception 'RF_IMMUTABLE';end if;return new;end $$;
create trigger ingestion_review_immutable before update on public.review_items for each row execute function public.ingestion_review_immutable();
do $$ declare t text;r record;begin
 foreach t in array array['ingestion_settings','import_batches','import_requests','source_records','review_items','ingestion_audit'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
 for r in select oid::regprocedure name from pg_proc where pronamespace='public'::regnamespace and (proname like 'ingestion\_%' escape '\' or proname in ('catalog_ingestion_target','learning_ingestion_target')) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.name);execute format('grant execute on function %s to service_role',r.name);
 end loop;
end $$;
grant execute on function public.ingestion_source_find(uuid),public.ingestion_settings_list(),public.ingestion_settings_update(uuid,bigint,boolean,boolean),public.ingestion_batch_find(uuid),public.ingestion_batches_list(bigint),public.ingestion_batch_submit(uuid,text,text,jsonb,text,text) to authenticated;
