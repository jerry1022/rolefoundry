-- Immutable previews and explicit administrator publication through producer contracts.
alter table public.review_items add column current_version integer not null default 1;
create table public.ingestion_review_versions(
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.review_items(id) on delete cascade,
 version integer not null,normalized jsonb not null,source_fingerprint text not null,
 dictionary_version bigint not null references public.dictionary_versions(version),
 created_by uuid references public.profiles(user_id) on delete set null,created_at timestamptz not null default clock_timestamp(),unique(review_id,version)
);
insert into public.ingestion_review_versions(review_id,version,normalized,source_fingerprint,dictionary_version,created_by)
 select r.id,1,r.normalized,b.source_fingerprint,(b.context_snapshot->'dictionary'->>'version')::bigint,b.created_by from public.review_items r join public.import_batches b on b.id=r.batch_id;
create table public.ingestion_publications(
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.review_items(id),preview_id uuid not null references public.ingestion_review_versions(id),
 batch_id uuid not null references public.import_batches(id),source_record_id uuid references public.source_records(id),
 reviewer_id uuid references public.profiles(user_id) on delete set null,decision text not null check(decision in ('publish','reject','close','confirm')),
 resource_id uuid,version_id uuid,reason text not null,created_at timestamptz not null default clock_timestamp(),unique(review_id)
);
create table public.ingestion_decisions(
 actor_id uuid not null references public.profiles(user_id) on delete cascade,request_key text not null,
 request_hash text not null,receipt jsonb not null,primary key(actor_id,request_key)
);
create function public.ingestion_initial_preview() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.ingestion_review_versions(review_id,version,normalized,source_fingerprint,dictionary_version,created_by)
 select new.id,1,new.normalized,source_fingerprint,(context_snapshot->'dictionary'->>'version')::bigint,created_by from public.import_batches where id=new.batch_id;return new;end $$;
create trigger ingestion_initial_preview after insert on public.review_items for each row execute function public.ingestion_initial_preview();
create function public.ingestion_preview_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.review_id,new.version,new.normalized,new.source_fingerprint,new.dictionary_version,new.created_at) is distinct from (old.id,old.review_id,old.version,old.normalized,old.source_fingerprint,old.dictionary_version,old.created_at)
 or (new.created_by is distinct from old.created_by and new.created_by is not null) then raise exception 'RF_IMMUTABLE';end if;return new;
end $$;
create trigger ingestion_preview_immutable before update on public.ingestion_review_versions for each row execute function public.ingestion_preview_immutable();
create function public.ingestion_review_target_current(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when v.normalized->'targetId'='null'::jsonb then
  case s.kind when 'jobs' then not exists(select 1 from public.job_sources l where l.source_id=b.source_id and l.external_id=v.normalized->>'externalId') else sr.target_id is null end
 else case s.kind when 'jobs' then exists(select 1 from public.jobs j join public.job_versions cv on cv.job_id=j.id and cv.version=j.current_version where j.id=(v.normalized->>'targetId')::uuid and j.revision=(v.normalized->>'targetRevision')::bigint and cv.id=(v.normalized->>'targetVersionId')::uuid)
 else exists(select 1 from public.courses c join public.course_versions cv on cv.course_id=c.id and cv.version=c.current_version where c.id=(v.normalized->>'targetId')::uuid and c.revision=(v.normalized->>'targetRevision')::bigint and cv.id=(v.normalized->>'targetVersionId')::uuid) end end
 from public.review_items r join public.import_batches b on b.id=r.batch_id join public.sources s on s.id=b.source_id join public.source_records sr on sr.id=r.source_record_id join public.ingestion_review_versions v on v.review_id=r.id and v.version=r.current_version where r.id=p_id
$$;
create function public.ingestion_review_json(p_review uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'revision',r.revision,'state',r.state,'normalized',v.normalized,'previewId',v.id,'previewVersion',v.version,
 'sourceId',b.source_id,'kind',s.kind,'targetCurrent',coalesce(public.ingestion_review_target_current(r.id),false),'sourceCurrent',v.source_fingerprint=public.ingestion_source_json(b.source_id)->>'fingerprint' and public.ingestion_source_json(b.source_id)->>'status'='active','dictionaryCurrent',v.dictionary_version=public.dictionary_current_version(),'sourceLatest',exists(select 1 from public.source_records sr where sr.id=r.source_record_id and sr.latest_batch_id=r.batch_id),
 'publication',(select jsonb_build_object('id',id,'decision',decision,'resourceId',resource_id,'versionId',version_id,'createdAt',created_at) from public.ingestion_publications where review_id=r.id))
 from public.review_items r join public.import_batches b on b.id=r.batch_id join public.sources s on s.id=b.source_id join public.ingestion_review_versions v on v.review_id=r.id and v.version=r.current_version where r.id=p_review
$$;
create function public.ingestion_review_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();v jsonb:=public.ingestion_review_json(p_id);begin if v is null then raise exception 'RF_NOT_FOUND';end if;return v;end $$;
create function public.ingestion_review_context(p_id uuid,p_expected bigint,p_target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();r public.review_items%rowtype;b public.import_batches%rowtype;ctx jsonb;original jsonb;v_existing jsonb;v_matches jsonb;v_target jsonb;v_row jsonb;
begin
 select * into r from public.review_items where id=p_id for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if r.revision is distinct from p_expected or r.state not in ('pending','unchanged') then raise exception 'RF_CONFLICT';end if;
 if not exists(select 1 from public.source_records sr where sr.id=r.source_record_id and sr.latest_batch_id=r.batch_id) then raise exception 'RF_STALE_INPUT';end if;
 select * into b from public.import_batches where id=r.batch_id;
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
create function public.ingestion_review_rebase(p_id uuid,p_expected bigint,p_target uuid,p_fingerprint text,p_dictionary bigint,p_normalized jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();prepared jsonb:=public.ingestion_review_context(p_id,p_expected,p_target);r public.review_items%rowtype;v_target jsonb;v_ids jsonb;
begin
 select * into r from public.review_items where id=p_id for update;
 if r.current_version>=20 then raise exception 'RF_INGESTION_LIMIT';end if;
 if p_fingerprint is distinct from prepared->'context'->'source'->>'fingerprint' or p_dictionary is distinct from (prepared->'context'->'dictionary'->>'version')::bigint
 or p_normalized->'sourceFields' is distinct from r.normalized->'sourceFields' or p_normalized->'externalId' is distinct from r.normalized->'externalId' or p_normalized->'url' is distinct from r.normalized->'url' or p_normalized->'state' is distinct from r.normalized->'state' or p_normalized->'position' is distinct from to_jsonb(r.position) or octet_length(p_normalized::text)>262144 then raise exception 'RF_STALE_INPUT';end if;
 v_target:=prepared->'context'->'existing'->0->'target';
 select coalesce(jsonb_agg(c->'id'),'[]'::jsonb) into v_ids from jsonb_array_elements(prepared->'context'->'matches') m cross join lateral jsonb_array_elements(m->'candidates') c;
 if p_normalized->'targetId' is distinct from coalesce(v_target->'id','null'::jsonb) or p_normalized->'targetRevision' is distinct from coalesce(v_target->'revision','null'::jsonb) or p_normalized->'targetVersionId' is distinct from coalesce(v_target->'versionId','null'::jsonb) or p_normalized->'candidateIds' is distinct from v_ids then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.ingestion_review_versions(review_id,version,normalized,source_fingerprint,dictionary_version,created_by) values(r.id,r.current_version+1,p_normalized,p_fingerprint,p_dictionary,u);
 update public.review_items set current_version=current_version+1,revision=revision+1 where id=r.id;
 insert into public.ingestion_audit(actor_id,resource_id,action) values(u,r.id,'review.rebased');return public.ingestion_review_json(r.id);
end $$;
-- Producer-owned link updates; never reassign another canonical opening silently.
create function public.catalog_ingestion_link(p_job uuid,p_source uuid,p_external text,p_url text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.catalog_lock();l public.job_sources%rowtype;
begin
 if not public.catalog_valid_link(p_source,p_url) then raise exception 'RF_INVALID_INPUT';end if;
 select * into l from public.job_sources where source_id=p_source and external_id=p_external;
 if not found then perform public.catalog_link_source(p_job,p_source,p_external,p_url);select * into l from public.job_sources where source_id=p_source and external_id=p_external;
 elsif l.job_id<>p_job then raise exception 'RF_CONFLICT';
 elsif l.original_url<>p_url then update public.job_sources set original_url=p_url where id=l.id;perform public.catalog_touch(u,'job.source.reviewed_url',p_job);end if;return l.id;
end $$;
create function public.learning_ingestion_owned_version(p_course uuid,p_source uuid,p_confirm boolean) returns uuid language sql stable security definer set search_path='' as $$
 select v.id from public.courses c join public.course_versions v on v.course_id=c.id and v.version=coalesce(c.published_version,c.current_version) where c.id=p_course and v.source_id=p_source and (not p_confirm or c.current_version=c.published_version)
$$;
create function public.ingestion_review_decide(p_id uuid,p_expected bigint,p_decision text,p_draft jsonb,p_reason text,p_duplicate boolean,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.ingestion_admin_lock();r public.review_items%rowtype;v public.ingestion_review_versions%rowtype;b public.import_batches%rowtype;source jsonb;prepared jsonb;current_target jsonb;v_expected jsonb;v_candidates jsonb;v_target uuid;v_version uuid;v_revision bigint;v_link uuid;v_stage text;v_result jsonb;v_hash text;d public.ingestion_decisions%rowtype;v_resource uuid;v_receipt jsonb;v_publication uuid;
begin
 if p_decision is null or p_decision not in ('publish','reject','close','confirm') or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 or p_key is null or length(p_key) not between 8 and 200 or p_duplicate is null then raise exception 'RF_INVALID_INPUT';end if;
 v_hash:=md5(jsonb_build_array(p_id,p_expected,p_decision,p_draft,p_reason,p_duplicate)::text);
 select * into d from public.ingestion_decisions where actor_id=u and request_key=p_key;
 if found then if d.request_hash<>v_hash then raise exception 'RF_CONFLICT';end if;return d.receipt;end if;
 select * into r from public.review_items where id=p_id for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if r.revision is distinct from p_expected or r.state not in ('pending','unchanged') then raise exception 'RF_CONFLICT';end if;
 select * into b from public.import_batches where id=r.batch_id;select * into v from public.ingestion_review_versions where review_id=r.id and version=r.current_version;
 source:=public.ingestion_source_json(b.source_id);
 if p_decision<>'reject' then
  if source->>'status'<>'active' or source->>'fingerprint' is distinct from v.source_fingerprint or v.dictionary_version<>public.dictionary_current_version() then raise exception 'RF_STALE_INPUT';end if;
  prepared:=public.ingestion_review_context(p_id,p_expected,(v.normalized->>'targetId')::uuid);
  current_target:=prepared->'context'->'existing'->0->'target';
  select coalesce(jsonb_agg(c->'id'),'[]'::jsonb) into v_candidates from jsonb_array_elements(prepared->'context'->'matches') m cross join lateral jsonb_array_elements(m->'candidates') c;
  if v.normalized->'targetId' is distinct from coalesce(current_target->'id','null'::jsonb) or v.normalized->'targetRevision' is distinct from coalesce(current_target->'revision','null'::jsonb) or v.normalized->'targetVersionId' is distinct from coalesce(current_target->'versionId','null'::jsonb) or v.normalized->'candidateIds' is distinct from v_candidates then raise exception 'RF_STALE_INPUT';end if;
 end if;
 v_target:=(v.normalized->>'targetId')::uuid;
 if p_decision='publish' then
  if v.normalized->>'state'<>'active' or (v_target is null and jsonb_array_length(v.normalized->'candidateIds')>0 and not p_duplicate) then raise exception 'RF_CONFLICT';end if;
  if source->>'kind'='jobs' then
   p_draft:=p_draft||jsonb_build_object('canonicalKey',case when v_target is null then public.ingestion_reference_key(b.source_id,v.normalized->>'externalId') else current_target->'draft'->>'canonicalKey' end);
   if v_target is null then v_result:=public.catalog_create_job(p_draft,b.source_id,v.normalized->>'externalId',v.normalized->>'url');v_target:=(v_result->>'id')::uuid;
   else perform public.catalog_revise_job(v_target,(current_target->>'revision')::bigint,p_draft);end if;
   v_link:=public.catalog_ingestion_link(v_target,b.source_id,v.normalized->>'externalId',v.normalized->>'url');
   select revision,status into v_revision,v_stage from public.jobs where id=v_target;
   if v_stage='rejected' then perform public.catalog_transition_job(v_target,v_revision,'draft');select revision,status into v_revision,v_stage from public.jobs where id=v_target;end if;
   if v_stage in ('draft','expired') then perform public.catalog_transition_job(v_target,v_revision,'review');select revision into v_revision from public.jobs where id=v_target;end if;
   perform public.catalog_transition_job(v_target,v_revision,'published');perform public.catalog_observe_source(v_link,'confirmed_active');
   select cv.id into v_version from public.jobs j join public.job_versions cv on cv.job_id=j.id and cv.version=j.current_version where j.id=v_target;
  else
   p_draft:=p_draft||jsonb_build_object('key',case when v_target is null then public.ingestion_reference_key(b.source_id,v.normalized->>'externalId') else current_target->'draft'->>'key' end,'providerId',source->'provider'->'id','sourceId',b.source_id,'url',v.normalized->'url');
   if v_target is null then v_result:=public.learning_course_create(p_draft);v_target:=(v_result->>'id')::uuid;else perform public.learning_course_revise(v_target,(current_target->>'revision')::bigint,p_draft);end if;
   select revision into v_revision from public.courses where id=v_target;perform public.learning_course_transition(v_target,v_revision,'review',p_reason);
   select revision into v_revision from public.courses where id=v_target;perform public.learning_course_transition(v_target,v_revision,'publish',p_reason);
   select cv.id into v_version from public.courses c join public.course_versions cv on cv.course_id=c.id and cv.version=c.current_version where c.id=v_target;
  end if;
 elsif p_decision in ('close','confirm') then
  if (p_decision='close' and (v.normalized->>'state'<>'closed' or not (source->>'allowClosure')::boolean)) or (p_decision='confirm' and (v.normalized->>'disposition'<>'unchanged' or v.normalized->>'state'<>'active')) then raise exception 'RF_CONFLICT';end if;
  if v_target is not null then
   if source->>'kind'='jobs' then v_link:=public.catalog_ingestion_link(v_target,b.source_id,v.normalized->>'externalId',v.normalized->>'url');perform public.catalog_observe_source(v_link,case p_decision when 'close' then 'confirmed_closed' else 'confirmed_active' end);v_version:=(current_target->>'versionId')::uuid;
   else
    v_version:=public.learning_ingestion_owned_version(v_target,b.source_id,p_decision='confirm');
    if v_version is null then raise exception 'RF_CONFLICT';end if;
    perform public.learning_course_transition(v_target,(current_target->>'revision')::bigint,case p_decision when 'close' then 'retire' else 'confirmed_active' end,p_reason);
   end if;
  end if;
 end if;
 if p_decision<>'reject' then update public.source_records set target_id=v_target where id=r.source_record_id;end if;
 insert into public.ingestion_publications(review_id,preview_id,batch_id,source_record_id,reviewer_id,decision,resource_id,version_id,reason) values(r.id,v.id,b.id,r.source_record_id,u,p_decision,v_target,v_version,btrim(p_reason)) returning id into v_publication;
 update public.review_items set state=case p_decision when 'reject' then 'rejected' else 'published' end,revision=revision+1 where id=r.id;
 v_receipt:=jsonb_build_object('id',v_publication,'reviewId',r.id,'decision',p_decision,'resourceId',v_target,'versionId',v_version);
 insert into public.ingestion_decisions values(u,p_key,v_hash,v_receipt);insert into public.ingestion_audit(actor_id,resource_id,action) values(u,r.id,'review.'||p_decision);return v_receipt;
 exception when unique_violation then raise exception 'RF_CONFLICT';
end $$;
-- Batch details expose the latest immutable preview; summaries remain bounded.
create or replace function public.ingestion_batch_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'sourceId',b.source_id,'batchId',b.batch_key,'revision',b.revision,'stage',b.stage,'status',case when b.stage='review' then 'succeeded' else coalesce(t.status,'failed') end,'errorCode',case when b.stage='review' then null else t.safe_error end,'taskId',b.task_id,'createdAt',b.created_at,
 'sourceCurrent',b.source_fingerprint=public.ingestion_source_json(b.source_id)->>'fingerprint' and public.ingestion_source_json(b.source_id)->>'status'='active','total',b.content->'total','rejected',b.content->'rejected',
 'items',coalesce((select jsonb_agg(public.ingestion_review_json(r.id) order by r.position) from public.review_items r where r.batch_id=b.id),'[]'::jsonb)) from public.import_batches b left join public.tasks t on t.id=b.task_id where b.id=p_id
$$;
do $$ declare t text;r record;begin
 foreach t in array array['ingestion_review_versions','ingestion_publications','ingestion_decisions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
 for r in select oid::regprocedure name from pg_proc where pronamespace='public'::regnamespace and (proname like 'ingestion\_%' escape '\' or proname in ('catalog_ingestion_link','learning_ingestion_owned_version')) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.name);execute format('grant execute on function %s to service_role',r.name);
 end loop;
end $$;
grant execute on function public.ingestion_source_find(uuid),public.ingestion_settings_list(),public.ingestion_settings_update(uuid,bigint,boolean,boolean),public.ingestion_batch_find(uuid),public.ingestion_batches_list(bigint),public.ingestion_batch_submit(uuid,text,text,jsonb,text,text),public.ingestion_review_find(uuid),public.ingestion_review_context(uuid,bigint,uuid),public.ingestion_review_rebase(uuid,bigint,uuid,text,bigint,jsonb),public.ingestion_review_decide(uuid,bigint,text,jsonb,text,boolean,text) to authenticated;
