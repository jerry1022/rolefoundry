-- Module 08: owner-only sources, immutable confirmation, grounded revisions and private exports.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('rolefoundry-resumes','rolefoundry-resumes',false,5242880,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive policy also protects this bucket from accidentally broad member policies elsewhere.
create policy resume_service_storage_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'rolefoundry-resumes') with check(bucket_id<>'rolefoundry-resumes');

create table public.resume_documents(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 filename text not null,source_kind text not null check(source_kind in ('file','text')),media_type text,
 byte_count integer,source_text text,source_key text,source_hash text,
 upload_hash text,upload_token_hash text,upload_expires_at timestamptz,write_token uuid,write_deadline timestamptz,
 request_key text not null,request_hash text not null,
 revision bigint not null default 1,current_version integer not null default 0,
 status text not null check(status in ('awaiting-upload','uploading','queued','parsed','confirmed','deleted')),
 parse_task_id uuid references public.tasks(id) on delete set null,draft jsonb,processing_error text,
 created_at timestamptz not null default now(),deleted_at timestamptz,unique(user_id,request_key)
);
create index resume_documents_owner on public.resume_documents(user_id,sequence desc);
create table public.resume_versions(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.resume_documents(id) on delete cascade,
 version integer not null,content jsonb not null,dictionary_version bigint not null references public.dictionary_versions(version),
 created_at timestamptz not null default now(),unique(document_id,version)
);
create table public.resume_claim_links(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.resume_documents(id) on delete cascade,
 fact_id uuid not null,part integer not null,evidence_id uuid references public.evidence(id) on delete cascade,
 source_version_id uuid not null references public.resume_versions(id) on delete cascade,unique(document_id,fact_id,part)
);
create index resume_claims_document on public.resume_claim_links(document_id);
create table public.revision_proposals(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.resume_documents(id) on delete cascade,
 version_id uuid not null references public.resume_versions(id) on delete cascade,job_id uuid not null references public.jobs(id),job_version_id uuid not null references public.job_versions(id),
 task_id uuid unique references public.tasks(id) on delete set null,request_key text not null,request_hash text not null,input_hash text not null,input_snapshot jsonb not null,output jsonb,
 status text not null default 'queued' check(status in ('queued','succeeded','accepted')),accepted_ids jsonb,accepted_version_id uuid references public.resume_versions(id) on delete cascade,
 profile_revision bigint not null,dictionary_version bigint not null,catalog_revision bigint not null,created_at timestamptz not null default now(),unique(document_id,request_key)
);
create index resume_proposals_document on public.revision_proposals(document_id,created_at desc);
create table public.resume_exports(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.resume_documents(id) on delete cascade,
 version_id uuid not null references public.resume_versions(id) on delete cascade,task_id uuid unique references public.tasks(id) on delete set null,
 request_key text not null,request_hash text not null,input_hash text not null,
 object_key text,sha256 text,byte_count integer,processing_error text,created_at timestamptz not null default now(),unique(document_id,request_key)
);
create index resume_exports_document on public.resume_exports(document_id,created_at desc);
-- Records exist BEFORE external writes. Expired/uncommitted writes and deleted owners are reclaimable.
create table public.resume_storage_objects(
 id uuid primary key default gen_random_uuid(),document_id uuid references public.resume_documents(id) on delete set null,
 user_id uuid references public.profiles(user_id) on delete set null,object_key text not null unique,
 kind text not null check(kind in ('source','export')),write_deadline timestamptz,
 purge_after timestamptz,cleanup_token uuid,cleanup_expires_at timestamptz,created_at timestamptz not null default now()
);
create index resume_storage_due on public.resume_storage_objects(purge_after) where purge_after is not null;
create table public.resume_downloads(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,
 export_id uuid not null references public.resume_exports(id) on delete cascade,expires_at timestamptz not null
);
create index resume_download_expiry on public.resume_downloads(expires_at);
create table public.resume_audit(
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(user_id) on delete set null,
 resource_id uuid,action text not null,created_at timestamptz not null default now()
);

create function public.resume_private_lock() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_user();
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 perform public.identity_require_user();return u;
end $$;
create function public.resume_keys(p jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(case when jsonb_typeof(p)='object' then (select array_agg(x order by x) from jsonb_object_keys(p) x)=(select array_agg(x order by x) from unnest(k) x) else false end,false)
$$;
create function public.resume_strings(p jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$ select coalesce(jsonb_typeof(p)='object' and not exists(select 1 from unnest(k) key where jsonb_typeof(p->key) is distinct from 'string'),false) $$;
create function public.resume_uuid(p text) returns boolean language sql immutable set search_path='' as $$ select coalesce(p ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false) $$;
create function public.resume_text_valid(p text,n integer) returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(btrim(p))>0 and length(p)<=n and (select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0) from regexp_split_to_table(p,'') chars(c))<=n and translate(p,chr(9)||chr(10)||chr(13),'') !~ '[[:cntrl:]]',false)
$$;
create function public.resume_utf16_map(p text) returns integer[] language sql immutable set search_path='' as $$
 with characters as materialized(select ordinal::integer i,case when ascii(c)>65535 then 2 else 1 end units from regexp_split_to_table(p,'') with ordinality chars(c,ordinal)),
 positions as materialized(select i,units,sum(units) over(order by i)::integer boundary from characters),
 boundaries as(select 0 boundary,0 i union all select boundary,i from positions union all select boundary-1,null::integer from positions where units=2)
 select array_agg(i order by boundary) from boundaries
$$;
create function public.resume_validate_draft(p jsonb) returns void language plpgsql set search_path='' as $$
declare b jsonb;m integer[];v_start integer;v_end integer;previous_end integer:=0;ids text[]:='{}';
begin
 if not public.resume_keys(p,array['text','blocks','pageCount','warnings']) or (not public.resume_strings(p,array['text']) or not public.resume_text_valid(p->>'text',50000))
 or jsonb_typeof(p->'blocks') is distinct from 'array' or jsonb_array_length(p->'blocks') not between 1 and 250
 or jsonb_typeof(p->'warnings') is distinct from 'array' or jsonb_array_length(p->'warnings')>10 then raise exception 'RF_INVALID_INPUT';end if;
 if p->'pageCount'<>'null'::jsonb and (jsonb_typeof(p->'pageCount')<>'number' or (p->>'pageCount')::integer not between 1 and 20) then raise exception 'RF_INVALID_INPUT';end if;
 m:=public.resume_utf16_map(p->>'text');if cardinality(m)>50001 then raise exception 'RF_RESUME_LIMIT';end if;
 for b in select value from jsonb_array_elements(p->'blocks') loop
  if not public.resume_keys(b,array['id','text','source']) or not public.resume_keys(b->'source',array['start','end','page'])
  or not public.resume_uuid(b->>'id') or b->>'id'=any(ids) or not public.resume_strings(b,array['text']) or not public.resume_text_valid(b->>'text',10000)
  or jsonb_typeof(b->'source'->'start') is distinct from 'number' or jsonb_typeof(b->'source'->'end') is distinct from 'number' then raise exception 'RF_INVALID_INPUT';end if;
  v_start:=(b->'source'->>'start')::integer;v_end:=(b->'source'->>'end')::integer;
  if v_start<previous_end or v_end<=v_start or v_end>=cardinality(m) or m[v_start+1] is null or m[v_end+1] is null
  or substring(p->>'text' from m[v_start+1]+1 for m[v_end+1]-m[v_start+1]) is distinct from b->>'text' then raise exception 'RF_INVALID_INPUT';end if;
  if b->'source'->'page'<>'null'::jsonb and (p->'pageCount'='null'::jsonb or (b->'source'->>'page')::integer not between 1 and (p->>'pageCount')::integer) then raise exception 'RF_INVALID_INPUT';end if;
  previous_end:=v_end;ids:=array_append(ids,b->>'id');
 end loop;
 if exists(select 1 from jsonb_array_elements_text(p->'warnings') x where coalesce(x,'') not in ('layout-not-preserved','review-extracted-text','document-warnings')) then raise exception 'RF_INVALID_INPUT';end if;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.resume_validate_content(p jsonb,p_draft jsonb) returns void language plpgsql set search_path='' as $$
declare f jsonb;s jsonb;ids text[]:='{}';section_ids text[]:='{}';references_ids text[]:='{}';v_text_length integer:=0;v_id text;skill text;
begin
 if not public.resume_keys(p,array['facts','sections']) or jsonb_typeof(p->'facts') is distinct from 'array' or jsonb_typeof(p->'sections') is distinct from 'array'
 or jsonb_array_length(p->'facts') not between 1 and 250 or jsonb_array_length(p->'sections') not between 1 and 40 then raise exception 'RF_INVALID_INPUT';end if;
 for f in select value from jsonb_array_elements(p->'facts') loop
  if not public.resume_keys(f,array['id','text','kind','state','skillIds','sourceBlockId']) or not public.resume_uuid(f->>'id')
  or f->>'id'=any(ids) or not public.resume_strings(f,array['text','kind','state']) or not public.resume_text_valid(f->>'text',4000) or coalesce(f->>'kind','') not in ('experience','project','education','credential','skill-claim','contact','other')
  or coalesce(f->>'state','') not in ('completed','in-progress','learning','unspecified') or jsonb_typeof(f->'skillIds') is distinct from 'array' or jsonb_array_length(f->'skillIds')>20 then raise exception 'RF_INVALID_INPUT';end if;
  if f->'sourceBlockId'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(p_draft->'blocks') b where b->>'id'=f->>'sourceBlockId') then raise exception 'RF_INVALID_INPUT';end if;
  if (select count(distinct x) from jsonb_array_elements_text(f->'skillIds') x)<>jsonb_array_length(f->'skillIds') then raise exception 'RF_INVALID_INPUT';end if;
  for skill in select jsonb_array_elements_text(f->'skillIds') loop if public.dictionary_resolve_id(skill) is null then raise exception 'RF_INVALID_INPUT';end if;end loop;
  ids:=array_append(ids,f->>'id');v_text_length:=v_text_length+cardinality(public.resume_utf16_map(f->>'text'))-1;
 end loop;
 if v_text_length>50000 then raise exception 'RF_RESUME_LIMIT';end if;
 for s in select value from jsonb_array_elements(p->'sections') loop
  if not public.resume_keys(s,array['id','heading','factIds']) or not public.resume_uuid(s->>'id') or s->>'id'=any(section_ids)
  or not public.resume_strings(s,array['heading']) or not public.resume_text_valid(s->>'heading',120) or jsonb_typeof(s->'factIds') is distinct from 'array' or jsonb_array_length(s->'factIds') not between 1 and 250 then raise exception 'RF_INVALID_INPUT';end if;
  for v_id in select jsonb_array_elements_text(s->'factIds') loop if not v_id=any(ids) or v_id=any(references_ids) then raise exception 'RF_INVALID_INPUT';end if;references_ids:=array_append(references_ids,v_id);end loop;
  section_ids:=array_append(section_ids,s->>'id');
 end loop;
 if cardinality(references_ids)<>cardinality(ids) then raise exception 'RF_INVALID_INPUT';end if;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.resume_version_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'documentId',document_id,'dictionaryVersion',dictionary_version,'version',version,'createdAt',created_at,'content',content) from public.resume_versions where id=p_id
$$;
create function public.resume_proposal_current(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.revision_proposals p join public.resume_documents d on d.id=p.document_id
 join public.resume_versions v on v.document_id=d.id and v.version=d.current_version
 join public.jobs j on j.id=p.job_id join public.job_versions jv on jv.job_id=j.id and jv.version=j.current_version
 where p.id=p_id and d.deleted_at is null and v.id=p.version_id and jv.id=p.job_version_id and public.catalog_job_visible(j.id)
 and (j.expires_at is null or j.expires_at>clock_timestamp()) and p.profile_revision=coalesce((select revision from public.career_preferences where user_id=d.user_id),0)
 and p.dictionary_version=public.dictionary_current_version() and p.catalog_revision=(select revision from public.catalog_state where singleton)),false)
$$;
create function public.resume_document_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'filename',d.filename,'sourceKind',d.source_kind,'revision',d.revision,'status',case when d.status='queued' then coalesce(t.status,'failed') else d.status end,
 'taskId',d.parse_task_id,'taskErrorCode',t.safe_error,'createdAt',d.created_at,'draft',d.draft,'processingError',d.processing_error,'currentVersion',(select public.resume_version_json(id) from public.resume_versions where document_id=d.id and version=d.current_version),
 'confirmedClaimCount',(select count(*) from public.resume_claim_links where document_id=d.id),'versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version,'createdAt',created_at) order by version desc) from public.resume_versions where document_id=d.id),'[]'::jsonb),
 'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'versionId',p.version_id,'jobId',p.job_id,'taskId',p.task_id,'status',case when p.status='queued' then coalesce(pt.status,'failed') else p.status end,'stale',not public.resume_proposal_current(p.id),'acceptedVersionId',p.accepted_version_id,'createdAt',p.created_at) order by p.created_at desc) from public.revision_proposals p left join public.tasks pt on pt.id=p.task_id where p.document_id=d.id),'[]'::jsonb),
 'exports',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'versionId',e.version_id,'taskId',e.task_id,'status',coalesce(et.status,'failed'),'processingError',e.processing_error,'createdAt',e.created_at) order by e.created_at desc) from public.resume_exports e left join public.tasks et on et.id=e.task_id where e.document_id=d.id),'[]'::jsonb))
 from public.resume_documents d left join public.tasks t on t.id=d.parse_task_id where d.id=p_id and d.deleted_at is null
$$;

create function public.resume_documents_list(p_before bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.identity_require_user();v_data jsonb;v_last bigint;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'revision',d.revision,'status',case when d.status='queued' then coalesce(t.status,'failed') else d.status end,'createdAt',d.created_at) order by d.sequence desc),'[]'::jsonb),min(d.sequence) into v_data,v_last
 from (select * from public.resume_documents where user_id=u and deleted_at is null and (p_before is null or sequence<p_before) order by sequence desc limit 20) d left join public.tasks t on t.id=d.parse_task_id;
 return jsonb_build_object('data',v_data,'lastSequence',case when exists(select 1 from public.resume_documents where user_id=u and deleted_at is null and sequence<v_last) then v_last::text else null end);
end $$;
create function public.resume_document_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();
begin if not exists(select 1 from public.resume_documents where id=p_id and user_id=u and deleted_at is null) then raise exception 'RF_NOT_FOUND';end if;return public.resume_document_json(p_id);end $$;
create function public.resume_version_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();
begin if not exists(select 1 from public.resume_versions v join public.resume_documents d on d.id=v.document_id where v.id=p_id and d.user_id=u and d.deleted_at is null) then raise exception 'RF_NOT_FOUND';end if;return public.resume_version_json(p_id);end $$;
create function public.resume_upload_intent(p_metadata jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;v_hash text;v_token uuid:=gen_random_uuid();v_id uuid;v_key text;
begin
 if not public.resume_keys(p_metadata,array['filename','mediaType','byteCount']) or not public.resume_text_valid(p_metadata->>'filename',180)
 or p_metadata->>'filename' ~ '[/\\]' or coalesce(p_metadata->>'mediaType','') not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 or jsonb_typeof(p_metadata->'byteCount') is distinct from 'number' or (p_metadata->>'byteCount')::integer not between 1 and 5242880
 or p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 if lower(p_metadata->>'filename') not like (case when p_metadata->>'mediaType'='application/pdf' then '%.pdf' else '%.docx' end) then raise exception 'RF_INVALID_INPUT';end if;
 v_hash:=md5(p_metadata::text);
 select * into d from public.resume_documents where user_id=u and request_key=p_key for update;
 if found then
  if d.request_hash<>v_hash or d.deleted_at is not null then raise exception 'RF_CONFLICT';end if;
  update public.resume_documents set upload_token_hash=md5(v_token::text),upload_expires_at=clock_timestamp()+interval '5 minutes' where id=d.id;
  if d.status in ('awaiting-upload','uploading') then
   perform public.resume_mark_storage(d.id);
   v_key:=u::text||'/'||d.id::text||'/source/'||gen_random_uuid()::text;
   update public.resume_documents set source_key=v_key,status='awaiting-upload',write_token=null,write_deadline=null,upload_hash=null where id=d.id;
   insert into public.resume_storage_objects(document_id,user_id,object_key,kind,purge_after) values(d.id,u,v_key,'source',clock_timestamp()+interval '7 minutes');
  end if;
 else
  if (select count(*) from public.resume_documents where user_id=u and deleted_at is null)>=100 then raise exception 'RF_RESUME_LIMIT';end if;
  v_id:=gen_random_uuid();v_key:=u::text||'/'||v_id::text||'/source/'||gen_random_uuid()::text;
  insert into public.resume_documents(id,user_id,filename,source_kind,media_type,byte_count,source_key,upload_token_hash,upload_expires_at,request_key,request_hash,status)
   values(v_id,u,p_metadata->>'filename','file',p_metadata->>'mediaType',(p_metadata->>'byteCount')::integer,v_key,md5(v_token::text),clock_timestamp()+interval '5 minutes',p_key,v_hash,'awaiting-upload') returning * into d;
  insert into public.resume_storage_objects(document_id,user_id,object_key,kind,purge_after) values(d.id,u,v_key,'source',clock_timestamp()+interval '7 minutes');
  insert into public.resume_audit(actor_id,resource_id,action) values(u,d.id,'resume.upload_intent');
 end if;
 return jsonb_build_object('documentId',d.id,'uploadToken',v_token,'expiresAt',(select upload_expires_at from public.resume_documents where id=d.id));
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.resume_upload_begin(p_id uuid,p_token uuid,p_sha256 text,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;
begin
 select * into d from public.resume_documents where id=p_id and user_id=u and deleted_at is null for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if d.source_kind<>'file' or d.upload_token_hash is distinct from md5(p_token::text) or d.upload_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 if coalesce(p_sha256,'') !~ '^[a-f0-9]{64}$' or p_bytes is distinct from d.byte_count then raise exception 'RF_INVALID_INPUT';end if;
 if d.status not in ('awaiting-upload','uploading') then
  if d.source_hash is distinct from p_sha256 then raise exception 'RF_CONFLICT';end if;
  return jsonb_build_object('alreadyUploaded',true,'key',d.source_key,'claim',null,'mediaType',d.media_type);
 end if;
 if d.status='uploading' and d.upload_hash is distinct from p_sha256 then raise exception 'RF_CONFLICT';end if;
 if d.status='awaiting-upload' then
  update public.resume_documents set status='uploading',upload_hash=p_sha256,write_token=gen_random_uuid(),write_deadline=clock_timestamp()+interval '30 seconds' where id=d.id returning * into d;
 else update public.resume_documents set write_deadline=clock_timestamp()+interval '30 seconds' where id=d.id returning * into d;
 end if;
 update public.resume_storage_objects set write_deadline=d.write_deadline,purge_after=greatest(d.upload_expires_at+interval '2 minutes',d.write_deadline+interval '2 minutes') where object_key=d.source_key;
 return jsonb_build_object('alreadyUploaded',false,'key',d.source_key,'claim',d.write_token,'mediaType',d.media_type);
end $$;
-- Service-only completion follows a real size/hash-checked Storage upload/download.
create function public.resume_upload_finish(p_user uuid,p_id uuid,p_claim uuid,p_sha256 text,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.resume_documents%rowtype;v_task uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 if not public.identity_is_active(p_user) then raise exception 'RF_FORBIDDEN';end if;
 select * into d from public.resume_documents where id=p_id and user_id=p_user and deleted_at is null for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if d.status<>'uploading' or d.write_token is distinct from p_claim or d.write_deadline<=clock_timestamp() or p_sha256 is distinct from d.upload_hash or p_bytes is distinct from d.byte_count then raise exception 'RF_CONFLICT';end if;
 v_task:=public.task_enqueue(p_user,'resume.parse',d.id,p_sha256,'parse:'||d.id::text,p_sha256);
 update public.resume_documents set source_hash=p_sha256,status='queued',parse_task_id=v_task,revision=revision+1,write_token=null,write_deadline=null where id=d.id;
 update public.resume_storage_objects set purge_after=null,write_deadline=null where object_key=d.source_key;
 insert into public.resume_audit(actor_id,resource_id,action) values(p_user,d.id,'resume.source_stored');return jsonb_build_object('documentId',d.id,'taskId',v_task,'status','queued');
end $$;
create function public.resume_paste(p_text text,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;v_hash text;v_task uuid;
begin
 if not public.resume_text_valid(p_text,50000) or cardinality(public.resume_utf16_map(p_text))>50001 or p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 v_hash:=md5(jsonb_build_object('text',p_text)::text);
 select * into d from public.resume_documents where user_id=u and request_key=p_key;
 if found then if d.request_hash<>v_hash or d.deleted_at is not null then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('documentId',d.id,'taskId',d.parse_task_id,'status',(select status from public.tasks where id=d.parse_task_id));end if;
 if (select count(*) from public.resume_documents where user_id=u and deleted_at is null)>=100 then raise exception 'RF_RESUME_LIMIT';end if;
 insert into public.resume_documents(user_id,filename,source_kind,source_text,source_hash,request_key,request_hash,status) values(u,'Pasted resume','text',p_text,v_hash,p_key,v_hash,'queued') returning * into d;
 v_task:=public.task_enqueue(u,'resume.parse',d.id,v_hash,'parse:'||d.id::text,v_hash);update public.resume_documents set parse_task_id=v_task where id=d.id;
 insert into public.resume_audit(actor_id,resource_id,action) values(u,d.id,'resume.text_pasted');return jsonb_build_object('documentId',d.id,'taskId',v_task,'status','queued');
end $$;
create function public.resume_parse_retry(p_id uuid,p_previous uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;t public.tasks%rowtype;v_task uuid;v_request text;
begin
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 select * into d from public.resume_documents where id=p_id and user_id=u and deleted_at is null for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 v_request:=md5(jsonb_build_object('documentId',d.id,'previousTaskId',p_previous)::text);
 select * into t from public.tasks where user_id=u and kind='resume.parse' and idempotency_key=p_key;
 if found then if t.request_hash<>v_request or t.source_ref<>d.id then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('documentId',d.id,'taskId',t.id,'status',t.status);end if;
 if d.parse_task_id is distinct from p_previous or d.source_hash is null or d.current_version<>0 or d.draft is not null
 or not exists(select 1 from public.tasks where id=p_previous and user_id=u and source_ref=d.id and status='failed' and safe_error='RF_RETRY_EXHAUSTED') then raise exception 'RF_CONFLICT';end if;
 if (select count(*) from public.tasks where user_id=u and kind='resume.parse' and source_ref=d.id)>=5 then raise exception 'RF_RESUME_LIMIT';end if;
 v_task:=public.task_enqueue(u,'resume.parse',d.id,d.source_hash,p_key,v_request);
 update public.resume_documents set parse_task_id=v_task,status='queued',processing_error=null,revision=revision+1 where id=d.id;
 return jsonb_build_object('documentId',d.id,'taskId',v_task,'status','queued');
end $$;
create function public.resume_confirm(p_id uuid,p_expected bigint,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;v_id uuid;
begin
 select * into d from public.resume_documents where id=p_id and user_id=u and deleted_at is null for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if d.revision is distinct from p_expected or d.status not in ('parsed','confirmed') or d.draft is null then raise exception 'RF_CONFLICT';end if;
 if d.current_version>=100 then raise exception 'RF_RESUME_LIMIT';end if;
 perform public.resume_validate_content(p_content,d.draft);
 insert into public.resume_versions(document_id,version,content,dictionary_version) values(d.id,d.current_version+1,p_content,public.dictionary_current_version()) returning id into v_id;
 update public.resume_documents set current_version=current_version+1,revision=revision+1,status='confirmed' where id=d.id;
 perform public.resume_sync_claims(d.id,v_id);
 insert into public.resume_audit(actor_id,resource_id,action) values(u,v_id,'resume.facts_confirmed');return public.resume_document_json(d.id);
end $$;

create function public.resume_task_lock(p_task uuid,p_token uuid) returns public.tasks language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;u uuid;
begin
 select user_id into u from public.tasks where id=p_task;if u is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(u) then raise exception 'RF_FORBIDDEN';end if;
 if t.kind not in ('resume.parse','resume.revise','resume.export') or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;return t;
end $$;
create function public.resume_finish_task(p_task uuid,p_token uuid,p_result uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.tasks set status='succeeded',result_ref=p_result,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null,safe_error=null
 where id=p_task and status='running' and lease_token=p_token and lease_expires_at>clock_timestamp();if not found then raise exception 'RF_CONFLICT';end if;
 insert into public.task_events(task_id,event) values(p_task,'task.succeeded');
end $$;
create function public.resume_parse_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);d public.resume_documents%rowtype;
begin
 if t.kind<>'resume.parse' then raise exception 'RF_CONFLICT';end if;
 select * into d from public.resume_documents where id=t.source_ref and user_id=t.user_id and deleted_at is null for update;
 if not found or d.parse_task_id is distinct from t.id or d.status<>'queued' or d.source_hash is distinct from t.input_version then raise exception 'RF_STALE_INPUT';end if;
 return jsonb_build_object('sourceKind',d.source_kind,'key',d.source_key,'hash',d.source_hash,'mediaType',d.media_type,'byteCount',d.byte_count,'text',d.source_text);
end $$;
create function public.resume_parse_publish(p_task uuid,p_token uuid,p_draft jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);v_input jsonb;v_expected text;
begin
 v_input:=public.resume_parse_load(p_task,p_token);perform public.resume_validate_draft(p_draft);
 if v_input->>'sourceKind'='text' then
  v_expected:=regexp_replace(replace(replace(replace(v_input->>'text',E'\r\n',E'\n'),E'\r',E'\n'),E'\t','    '),'^\s+|\s+$','','g');
  if p_draft->>'text' is distinct from v_expected then raise exception 'RF_INVALID_INPUT';end if;
 end if;
 update public.resume_documents set draft=p_draft,status='parsed',revision=revision+1,processing_error=null where id=t.source_ref;
 perform public.resume_finish_task(p_task,p_token,t.source_ref);
 insert into public.resume_audit(actor_id,resource_id,action) values(t.user_id,t.source_ref,'resume.draft_parsed');
end $$;
create function public.resume_processing_failed(p_task uuid,p_token uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);
begin
 if coalesce(p_code,'') not in ('invalid-file','unsupported-file','too-large','empty-text','password-protected','parse-timeout','process-failed','unsupported-glyph','invalid-output') then raise exception 'RF_INVALID_INPUT';end if;
 if t.kind='resume.parse' then perform public.resume_parse_load(p_task,p_token);update public.resume_documents set processing_error=p_code where id=t.source_ref;
 elsif t.kind='resume.export' then update public.resume_exports set processing_error=p_code where id=t.source_ref and exists(select 1 from public.resume_documents d where d.id=document_id and d.user_id=t.user_id and d.deleted_at is null);
 else raise exception 'RF_INVALID_INPUT';end if;
end $$;
create function public.resume_revision_start(p_doc uuid,p_version uuid,p_job uuid,p_expected bigint,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;p public.revision_proposals%rowtype;v_version jsonb;v_job jsonb;v_skills jsonb;v_canonical jsonb;v_snapshot jsonb;v_request text;v_id uuid;v_task uuid;
begin
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 select * into d from public.resume_documents where id=p_doc and user_id=u and deleted_at is null for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 v_request:=md5(jsonb_build_object('documentId',p_doc,'versionId',p_version,'jobId',p_job,'expectedRevision',p_expected)::text);
 select * into p from public.revision_proposals where document_id=d.id and request_key=p_key;
 if found then if p.request_hash<>v_request then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('id',p.id,'taskId',p.task_id,'status',(select status from public.tasks where id=p.task_id));end if;
 if d.revision is distinct from p_expected or not exists(select 1 from public.resume_versions where id=p_version and document_id=d.id and version=d.current_version) then raise exception 'RF_CONFLICT';end if;
 if (select count(*) from public.revision_proposals where document_id=d.id)>=100 then raise exception 'RF_RESUME_LIMIT';end if;
 v_job:=public.matching_job_input(p_job);if v_job is null then raise exception 'RF_NOT_FOUND';end if;
 select coalesce(jsonb_agg(skill order by skill),'[]'::jsonb) into v_skills from (select distinct jsonb_array_elements_text(req->'skills') skill from jsonb_array_elements(v_job->'requirements') req) x;
 if jsonb_array_length(v_skills)>200 then raise exception 'RF_RESUME_LIMIT';end if;
 v_version:=public.resume_version_json(p_version);
 -- Resolve source skill IDs separately; never rewrite the immutable source-version projection.
 select coalesce(jsonb_object_agg(skill,canonical),'{}'::jsonb) into v_canonical from (select distinct x skill,public.dictionary_resolve_id(x) canonical from jsonb_array_elements(v_version->'content'->'facts') f cross join lateral jsonb_array_elements_text(f->'skillIds') x where public.dictionary_resolve_id(x) is not null) source_skills;
 v_snapshot:=jsonb_build_object('version',v_version,'dictionaryVersion',public.dictionary_current_version(),'canonicalSkillIds',v_canonical,'target',jsonb_build_object('jobId',p_job,'jobVersionId',v_job->>'versionId','skillIds',v_skills));
 insert into public.revision_proposals(document_id,version_id,job_id,job_version_id,request_key,request_hash,input_hash,input_snapshot,profile_revision,dictionary_version,catalog_revision)
 values(d.id,p_version,p_job,(v_job->>'versionId')::uuid,p_key,v_request,md5(v_snapshot::text),v_snapshot,coalesce((select revision from public.career_preferences where user_id=u),0),public.dictionary_current_version(),(select revision from public.catalog_state where singleton)) returning id into v_id;
 v_task:=public.task_enqueue(u,'resume.revise',v_id,md5(v_snapshot::text),p_key,v_request);update public.revision_proposals set task_id=v_task where id=v_id;
 return jsonb_build_object('id',v_id,'taskId',v_task,'status','queued');
end $$;
create function public.resume_revision_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);p public.revision_proposals%rowtype;
begin
 if t.kind<>'resume.revise' then raise exception 'RF_CONFLICT';end if;
 select p1.* into p from public.revision_proposals p1 join public.resume_documents d on d.id=p1.document_id where p1.id=t.source_ref and d.user_id=t.user_id and d.deleted_at is null for update of p1;
 if not found or p.task_id<>t.id or p.input_hash<>t.input_version or p.status<>'queued' or not public.resume_proposal_current(p.id) then raise exception 'RF_STALE_INPUT';end if;return p.input_snapshot;
end $$;
create function public.resume_section_text(p_content jsonb,p_ids jsonb) returns text language sql immutable set search_path='' as $$
 select string_agg(f->>'text',E'\n\n' order by ordinal) from jsonb_array_elements_text(p_ids) with ordinality r(id,ordinal) join lateral jsonb_array_elements(p_content->'facts') f on f->>'id'=r.id
$$;
create function public.resume_validate_proposal(p_input jsonb,p_output jsonb) returns void language plpgsql set search_path='' as $$
declare c jsonb;s jsonb;v_sections text[]:='{}';v_ids text[]:='{}';v_content jsonb:=p_input->'version'->'content';q jsonb;
begin
 if not public.resume_keys(p_output,array['recipe','versionId','jobVersionId','changes','questions','limitations']) or p_output->>'recipe' is distinct from 'resume-order-v1'
 or p_output->>'versionId' is distinct from p_input->'version'->>'id' or p_output->>'jobVersionId' is distinct from p_input->'target'->>'jobVersionId'
 or jsonb_typeof(p_output->'changes') is distinct from 'array' or jsonb_array_length(p_output->'changes')>40
 or jsonb_typeof(p_output->'questions') is distinct from 'array' or jsonb_array_length(p_output->'questions')>200
 or jsonb_typeof(p_output->'limitations') is distinct from 'array' or jsonb_array_length(p_output->'limitations')>10 or octet_length(p_output::text)>524288 then raise exception 'RF_INVALID_INPUT';end if;
 for c in select value from jsonb_array_elements(p_output->'changes') loop
  if not public.resume_keys(c,array['id','sectionId','beforeText','afterText','factIds','reason']) or not public.resume_uuid(c->>'id') or c->>'id'=any(v_ids)
  or not public.resume_strings(c,array['beforeText','afterText','reason']) or not public.resume_text_valid(c->>'reason',1000) or jsonb_typeof(c->'factIds') is distinct from 'array' or jsonb_array_length(c->'factIds') not between 1 and 250 then raise exception 'RF_INVALID_INPUT';end if;
  select value into s from jsonb_array_elements(v_content->'sections') where value->>'id'=c->>'sectionId';
  if s is null or c->>'sectionId'=any(v_sections) or jsonb_array_length(c->'factIds')<>jsonb_array_length(s->'factIds')
  or (select count(distinct x) from jsonb_array_elements_text(c->'factIds') x)<>jsonb_array_length(c->'factIds')
  or exists(select 1 from jsonb_array_elements_text(c->'factIds') x where not s->'factIds' ? x)
  or c->>'beforeText' is distinct from public.resume_section_text(v_content,s->'factIds') or c->>'afterText' is distinct from public.resume_section_text(v_content,c->'factIds') then raise exception 'RF_INVALID_INPUT';end if;
  v_sections:=array_append(v_sections,c->>'sectionId');v_ids:=array_append(v_ids,c->>'id');
 end loop;
 for q in select value from jsonb_array_elements(p_output->'questions') loop
  if not public.resume_keys(q,array['skillId','prompt']) or not public.resume_strings(q,array['skillId','prompt']) or not p_input->'target'->'skillIds' ? (q->>'skillId') or not public.resume_text_valid(q->>'prompt',1000) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements_text(p_output->'limitations') x where not public.resume_text_valid(x,1000)) then raise exception 'RF_INVALID_INPUT';end if;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.resume_revision_publish(p_task uuid,p_token uuid,p_output jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);v_input jsonb;
begin
 v_input:=public.resume_revision_load(p_task,p_token);perform public.resume_validate_proposal(v_input,p_output);
 update public.revision_proposals set output=p_output,status='succeeded' where id=t.source_ref;
 perform public.resume_finish_task(p_task,p_token,t.source_ref);
 insert into public.resume_audit(actor_id,resource_id,action) values(t.user_id,t.source_ref,'resume.proposal_published');
end $$;
create function public.resume_proposal_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();p public.revision_proposals%rowtype;
begin
 select p1.* into p from public.revision_proposals p1 join public.resume_documents d on d.id=p1.document_id where p1.id=p_id and d.user_id=u and d.deleted_at is null;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 return jsonb_build_object('id',p.id,'documentId',p.document_id,'versionId',p.version_id,'jobId',p.job_id,'taskId',p.task_id,'status',case when p.status='queued' then (select status from public.tasks where id=p.task_id) else p.status end,'stale',not public.resume_proposal_current(p.id),'output',p.output,'acceptedVersionId',p.accepted_version_id,'acceptedIds',p.accepted_ids);
end $$;
create function public.resume_accept(p_id uuid,p_expected bigint,p_ids jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();p public.revision_proposals%rowtype;d public.resume_documents%rowtype;v_content jsonb;v_sections jsonb;v_id uuid;v_ids jsonb;
begin
 select p1.* into p from public.revision_proposals p1 join public.resume_documents d1 on d1.id=p1.document_id where p1.id=p_id and d1.user_id=u and d1.deleted_at is null for update of p1;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids)>40 or (select count(distinct x) from jsonb_array_elements_text(p_ids) x)<>jsonb_array_length(p_ids) then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(x order by x),'[]'::jsonb) into v_ids from jsonb_array_elements_text(p_ids) x;
 if p.status='accepted' then if p.accepted_ids is distinct from v_ids then raise exception 'RF_CONFLICT';end if;return public.resume_document_json(p.document_id);end if;
 select * into d from public.resume_documents where id=p.document_id for update;
 if d.revision is distinct from p_expected or p.status<>'succeeded' or not public.resume_proposal_current(p.id) then raise exception 'RF_CONFLICT';end if;
 if d.current_version>=100 then raise exception 'RF_RESUME_LIMIT';end if;
 if exists(select 1 from jsonb_array_elements_text(v_ids) x where not exists(select 1 from jsonb_array_elements(p.output->'changes') c where c->>'id'=x)) then raise exception 'RF_INVALID_INPUT';end if;
 select content into v_content from public.resume_versions where id=p.version_id;
 select jsonb_agg(case when c is null then s else jsonb_set(s,'{factIds}',c->'factIds') end order by ordinal) into v_sections
 from jsonb_array_elements(v_content->'sections') with ordinality sections(s,ordinal)
 left join lateral (select value c from jsonb_array_elements(p.output->'changes') where value->>'sectionId'=s->>'id' and v_ids ? (value->>'id')) change on true;
 v_content:=jsonb_set(v_content,'{sections}',v_sections);perform public.resume_validate_content(v_content,d.draft);
 insert into public.resume_versions(document_id,version,content,dictionary_version) values(d.id,d.current_version+1,v_content,public.dictionary_current_version()) returning id into v_id;
 update public.revision_proposals set status='accepted',accepted_ids=v_ids,accepted_version_id=v_id where id=p.id;
 update public.resume_documents set current_version=current_version+1,revision=revision+1,status='confirmed' where id=d.id;
 insert into public.resume_audit(actor_id,resource_id,action) values(u,v_id,'resume.changes_accepted');return public.resume_document_json(d.id);
end $$;

create function public.resume_export_start(p_doc uuid,p_version uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;e public.resume_exports%rowtype;v_snapshot jsonb;v_request text;v_id uuid;v_task uuid;
begin
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 select * into d from public.resume_documents where id=p_doc and user_id=u and deleted_at is null for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 v_request:=md5(jsonb_build_object('versionId',p_version)::text);
 select * into e from public.resume_exports where document_id=d.id and request_key=p_key;
 if found then if e.request_hash<>v_request then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('id',e.id,'taskId',e.task_id,'status',(select status from public.tasks where id=e.task_id));end if;
 if not exists(select 1 from public.resume_versions where id=p_version and document_id=d.id) then raise exception 'RF_NOT_FOUND';end if;
 if (select count(*) from public.resume_exports where document_id=d.id)>=100 then raise exception 'RF_RESUME_LIMIT';end if;
 v_snapshot:=public.resume_version_json(p_version);
 insert into public.resume_exports(document_id,version_id,request_key,request_hash,input_hash) values(d.id,p_version,p_key,v_request,md5(v_snapshot::text)) returning id into v_id;
 v_task:=public.task_enqueue(u,'resume.export',v_id,md5(v_snapshot::text),p_key,v_request);update public.resume_exports set task_id=v_task where id=v_id;
 return jsonb_build_object('id',v_id,'taskId',v_task,'status','queued');
end $$;
create function public.resume_export_load(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);e public.resume_exports%rowtype;v_version jsonb;
begin
 if t.kind<>'resume.export' then raise exception 'RF_CONFLICT';end if;
 select e1.* into e from public.resume_exports e1 join public.resume_documents d on d.id=e1.document_id where e1.id=t.source_ref and d.user_id=t.user_id and d.deleted_at is null for update of e1;
 if not found or e.task_id<>t.id or e.input_hash<>t.input_version or e.object_key is not null then raise exception 'RF_STALE_INPUT';end if;
 v_version:=public.resume_version_json(e.version_id);if v_version is null or md5(v_version::text)<>e.input_hash then raise exception 'RF_STALE_INPUT';end if;return v_version;
end $$;
create function public.resume_export_prepare(p_task uuid,p_token uuid) returns text language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);e public.resume_exports%rowtype;v_key text;
begin
 perform public.resume_export_load(p_task,p_token);select * into e from public.resume_exports where id=t.source_ref;
 v_key:=t.user_id::text||'/'||e.document_id::text||'/exports/'||e.id::text||'/'||p_token::text||'.pdf';
 insert into public.resume_storage_objects(document_id,user_id,object_key,kind,write_deadline,purge_after)
 values(e.document_id,t.user_id,v_key,'export',clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '150 seconds')
 on conflict(object_key) do update set write_deadline=excluded.write_deadline,purge_after=excluded.purge_after;
 return v_key;
end $$;
create function public.resume_export_publish(p_task uuid,p_token uuid,p_key text,p_sha256 text,p_bytes integer) returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks:=public.resume_task_lock(p_task,p_token);e public.resume_exports%rowtype;v_expected text;
begin
 perform public.resume_export_load(p_task,p_token);select * into e from public.resume_exports where id=t.source_ref;
 v_expected:=t.user_id::text||'/'||e.document_id::text||'/exports/'||e.id::text||'/'||p_token::text||'.pdf';
 if p_key is distinct from v_expected or coalesce(p_sha256,'') !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 5242880
 or not exists(select 1 from public.resume_storage_objects where object_key=p_key and kind='export' and document_id=e.document_id and write_deadline>clock_timestamp() and cleanup_token is null) then raise exception 'RF_INVALID_INPUT';end if;
 update public.resume_exports set object_key=p_key,sha256=p_sha256,byte_count=p_bytes,processing_error=null where id=e.id;
 update public.resume_storage_objects set purge_after=null,write_deadline=null where object_key=p_key;
 perform public.resume_finish_task(p_task,p_token,e.id);
 insert into public.resume_audit(actor_id,resource_id,action) values(t.user_id,e.id,'resume.export_published');
end $$;
create function public.resume_download_intent(p_export uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();e public.resume_exports%rowtype;v_id uuid:=gen_random_uuid();v_expires timestamptz:=clock_timestamp()+interval '60 seconds';
begin
 select e1.* into e from public.resume_exports e1 join public.resume_documents d on d.id=e1.document_id join public.tasks t on t.id=e1.task_id
 where e1.id=p_export and d.user_id=u and d.deleted_at is null and t.status='succeeded' and e1.object_key is not null;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 delete from public.resume_downloads where user_id=u and expires_at<=clock_timestamp();
 if (select count(*) from public.resume_downloads where user_id=u)>=100 then raise exception 'RF_RESUME_LIMIT';end if;
 insert into public.resume_downloads(id,user_id,export_id,expires_at) values(v_id,u,e.id,v_expires);
 return jsonb_build_object('id',v_id,'expiresAt',v_expires);
end $$;
create function public.resume_download_access(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();v_result jsonb;
begin
 select jsonb_build_object('key',e.object_key,'sha256',e.sha256,'byteCount',e.byte_count,'versionId',e.version_id) into v_result
 from public.resume_downloads permit join public.resume_exports e on e.id=permit.export_id join public.resume_documents d on d.id=e.document_id join public.tasks t on t.id=e.task_id
 where permit.id=p_id and permit.user_id=u and permit.expires_at>clock_timestamp() and d.user_id=u and d.deleted_at is null and t.status='succeeded' and e.object_key is not null;
 if v_result is null then raise exception 'RF_NOT_FOUND';end if;return v_result;
end $$;
create function public.resume_mark_storage(p_doc uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.resume_storage_objects set purge_after=greatest(clock_timestamp(),coalesce(write_deadline+interval '2 minutes',clock_timestamp())) where document_id=p_doc;end $$;
create function public.resume_before_document_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.resume_mark_storage(old.id);perform public.resume_drop_claims(old.id);return old;end $$;
create trigger resume_file_delete before delete on public.resume_documents for each row execute function public.resume_before_document_delete();
create function public.resume_document_delete(p_id uuid,p_expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.resume_private_lock();d public.resume_documents%rowtype;v_count bigint;
begin
 select * into d from public.resume_documents where id=p_id and user_id=u for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if d.deleted_at is null then
  if d.revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
  update public.tasks set status='failed',safe_error='RF_CANCELED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null
   where user_id=u and status in ('queued','running') and ((kind='resume.parse' and source_ref=d.id) or (kind='resume.revise' and source_ref in(select id from public.revision_proposals where document_id=d.id)) or (kind='resume.export' and source_ref in(select id from public.resume_exports where document_id=d.id)));
  perform public.resume_mark_storage(d.id);perform public.resume_drop_claims(d.id);
  update public.resume_documents set filename='Deleted resume',source_text=null,source_key=null,source_hash=null,upload_hash=null,upload_token_hash=null,upload_expires_at=null,write_token=null,write_deadline=null,draft=null,processing_error=null,status='deleted',deleted_at=clock_timestamp(),revision=revision+1,current_version=0,parse_task_id=null where id=d.id;
  delete from public.revision_proposals where document_id=d.id;delete from public.resume_exports where document_id=d.id;delete from public.resume_versions where document_id=d.id;
  insert into public.resume_audit(actor_id,resource_id,action) values(u,d.id,'resume.deleted');
 end if;
 select count(*) into v_count from public.resume_storage_objects where document_id=d.id;
 return jsonb_build_object('deleted',true,'cleanupPending',v_count>0);
end $$;
create function public.resume_cleanup_claim(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.resume_storage_objects%rowtype;v_data jsonb:='[]'::jsonb;v_token uuid;
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'RF_INVALID_INPUT';end if;
 delete from public.resume_downloads where expires_at<=clock_timestamp();
 for r in select * from public.resume_storage_objects where purge_after<=clock_timestamp() and (cleanup_expires_at is null or cleanup_expires_at<=clock_timestamp()) order by purge_after,id limit p_limit for update skip locked loop
  v_token:=gen_random_uuid();update public.resume_storage_objects set cleanup_token=v_token,cleanup_expires_at=clock_timestamp()+interval '30 seconds' where id=r.id;
  v_data:=v_data||jsonb_build_array(jsonb_build_object('id',r.id,'key',r.object_key,'token',v_token));
 end loop;return v_data;
end $$;
create function public.resume_cleanup_ack(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.resume_storage_objects where id=p_id and cleanup_token=p_token and cleanup_expires_at>clock_timestamp() and purge_after<=clock_timestamp();
 if not found then raise exception 'RF_CONFLICT';end if;
end $$;
create function public.resume_immutable_version() returns trigger language plpgsql set search_path='' as $$
begin if tg_op='UPDATE' or exists(select 1 from public.resume_documents where id=old.document_id and deleted_at is null) then raise exception 'RF_IMMUTABLE';end if;return old;end $$;
create trigger resume_version_no_update before update or delete on public.resume_versions for each row execute function public.resume_immutable_version();

-- Profile-owned internal append/remove contracts; callers must verify the immutable source first.
create function public.profile_append_resume_claim(p_user uuid,p_evidence uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.evidence%rowtype;v_result jsonb;v_current jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 if not public.identity_is_active(p_user) or p_data->>'source' is distinct from 'resume-claim' then raise exception 'RF_FORBIDDEN';end if;
 perform public.profile_validate_evidence(p_data,true);
 if p_evidence is null then
  if (select count(*) from public.evidence where user_id=p_user)>=500 then raise exception 'RF_RESUME_LIMIT';end if;
  v_result:=public.profile_record_internal_evidence(p_user,p_data);return (v_result->'evidence'->>'id')::uuid;
 end if;
 select * into e from public.evidence where id=p_evidence and user_id=p_user and source='resume-claim' for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if exists(select 1 from public.evidence_versions where evidence_id=e.id and source_ref is distinct from (p_data->>'sourceRef')::uuid) then raise exception 'RF_INVALID_INPUT';end if;
 if exists(select 1 from public.evidence_versions where evidence_id=e.id and source_version=p_data->>'sourceVersion') then raise exception 'RF_CONFLICT';end if;
 perform public.profile_put_version(p_user,e.id,e.current_version+1,p_data,true);
 update public.evidence set current_version=current_version+1 where id=e.id;
 perform public.profile_bump(p_user,'evidence.changed',e.id);return e.id;
end $$;
create function public.profile_remove_resume_claim(p_user uuid,p_evidence uuid) returns void language plpgsql security definer set search_path='' as $$
declare removed uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 if not exists(select 1 from public.evidence where id=p_evidence and user_id=p_user and source='resume-claim') then return;end if;
 select array_agg(id) into removed from public.evidence_versions where evidence_id=p_evidence;
 delete from public.evidence where id=p_evidence and user_id=p_user;
 if exists(select 1 from public.profiles where user_id=p_user) and exists(select 1 from public.career_preferences where user_id=p_user) then perform public.profile_bump(p_user,'evidence.deleted',p_evidence,removed);end if;
end $$;
create function public.resume_sync_claims(p_doc uuid,p_version uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.resume_documents%rowtype;v public.resume_versions%rowtype;f jsonb;skills jsonb;chunk jsonb;v_part integer;l public.resume_claim_links%rowtype;desired uuid[]:='{}';e uuid;data jsonb;
begin
 select * into d from public.resume_documents where id=p_doc and deleted_at is null for update;
 select * into v from public.resume_versions where id=p_version and document_id=d.id;
 if d.id is null or v.id is null then raise exception 'RF_NOT_FOUND';end if;
 for f in select value from jsonb_array_elements(v.content->'facts') where value->>'state'<>'learning' loop
  select coalesce(jsonb_agg(skill order by skill),'[]'::jsonb) into skills from (select distinct public.dictionary_resolve_id(x) skill from jsonb_array_elements_text(f->'skillIds') x where public.dictionary_resolve_id(x) is not null) s;
  if jsonb_array_length(skills)=0 then continue;end if;
  for v_part in 1..ceil(jsonb_array_length(skills)::numeric/9)::integer loop
   select jsonb_agg(skill order by ordinal) into chunk from jsonb_array_elements(skills) with ordinality s(skill,ordinal) where ordinal>(v_part-1)*9 and ordinal<=v_part*9;
   select * into l from public.resume_claim_links where document_id=d.id and fact_id=(f->>'id')::uuid and resume_claim_links.part=v_part;
   if not found then insert into public.resume_claim_links(document_id,fact_id,part,source_version_id) values(d.id,(f->>'id')::uuid,v_part,v.id) returning * into l;end if;
   data:=jsonb_build_object('source','resume-claim','label','Resume excerpt: '||left(f->>'text',60),'context',case when f->>'state'='in-progress' then 'In progress. ' else 'Owner-confirmed statement. ' end||left(f->>'text',900)||' [Excerpt; see the confirmed private resume version for full context.]',
     'observedAt',v.created_at,'skills',chunk,'sourceRef',l.id,'sourceVersion',v.id::text,'rubricVersion',null,'outcome','Owner-confirmed, unreviewed resume claim. Not a verified capability.');
   e:=public.profile_append_resume_claim(d.user_id,l.evidence_id,data);
   update public.resume_claim_links set evidence_id=e,source_version_id=v.id where id=l.id;desired:=array_append(desired,l.id);
  end loop;
 end loop;
 for l in select * from public.resume_claim_links where document_id=d.id and not id=any(desired) loop
  perform public.profile_remove_resume_claim(d.user_id,l.evidence_id);delete from public.resume_claim_links where id=l.id;
 end loop;
end $$;
create function public.resume_drop_claims(p_doc uuid) returns void language plpgsql security definer set search_path='' as $$
declare l record;
begin
 for l in select links.evidence_id,d.user_id from public.resume_claim_links links join public.resume_documents d on d.id=links.document_id where links.document_id=p_doc loop
  perform public.profile_remove_resume_claim(l.user_id,l.evidence_id);
 end loop;
 delete from public.resume_claim_links where document_id=p_doc;
end $$;
revoke all on function public.profile_append_resume_claim(uuid,uuid,jsonb),public.profile_remove_resume_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.profile_append_resume_claim(uuid,uuid,jsonb),public.profile_remove_resume_claim(uuid,uuid) to service_role;

do $$ declare n text;f record;begin
 foreach n in array array['resume_documents','resume_versions','resume_claim_links','revision_proposals','resume_exports','resume_storage_objects','resume_downloads','resume_audit'] loop
  execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from anon,authenticated',n);execute format('grant all on public.%I to service_role',n);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'resume_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.resume_documents_list(bigint),public.resume_document_find(uuid),public.resume_version_find(uuid),public.resume_upload_intent(jsonb,text),public.resume_upload_begin(uuid,uuid,text,integer),public.resume_paste(text,text),public.resume_parse_retry(uuid,uuid,text),public.resume_confirm(uuid,bigint,jsonb),public.resume_revision_start(uuid,uuid,uuid,bigint,text),public.resume_proposal_find(uuid),public.resume_accept(uuid,bigint,jsonb),public.resume_export_start(uuid,uuid,text),public.resume_download_intent(uuid),public.resume_download_access(uuid),public.resume_document_delete(uuid,bigint) to authenticated;
