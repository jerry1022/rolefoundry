-- Module 07: reviewed course metadata, immutable versions and private learning progress.
create table public.course_providers(id text primary key,name text not null,allowed_hosts text[] not null,path_prefixes text[] not null default array['/courses/','/short-courses/'],url_identity text not null default 'path' check(url_identity in ('path','origin-path')));
insert into public.course_providers(id,name,allowed_hosts) values('deeplearning-ai','DeepLearning.AI',array['www.deeplearning.ai','deeplearning.ai']);
create table public.course_source_providers(source_id uuid primary key references public.sources(id) on delete cascade,provider_id text not null references public.course_providers(id));
create table public.course_catalog_state(singleton boolean primary key default true check(singleton),revision bigint not null default 0);
insert into public.course_catalog_state values(true,0);
create table public.courses(
 id uuid primary key default gen_random_uuid(),provider_id text not null references public.course_providers(id),canonical_key text not null,
 current_version integer not null default 1,published_version integer,revision bigint not null default 1,
 stage text not null default 'draft' check(stage in ('draft','review','published')),retired boolean not null default false,
 availability text not null default 'uncertain' check(availability in ('available','uncertain','retired')),last_reviewed_at timestamptz,
 created_at timestamptz not null default now(),unique(provider_id,canonical_key)
);
create table public.course_versions(
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),version integer not null,
 source_id uuid not null references public.sources(id),metadata jsonb not null,
 dictionary_version bigint not null references public.dictionary_versions(version),created_at timestamptz not null default now(),unique(course_id,version)
);
create table public.course_url_registry(provider_id text not null references public.course_providers(id),url_key text not null,course_id uuid not null references public.courses(id),primary key(provider_id,url_key));
create table public.course_skill_links(
 course_version_id uuid not null references public.course_versions(id),skill_id text not null references public.skills(id),
 canonical_skill_id text not null references public.skills(id),kind text not null check(kind in ('teaches','prerequisite')),
 primary key(course_version_id,skill_id,kind)
);
create index course_skill_lookup on public.course_skill_links(canonical_skill_id,kind,course_version_id);
create trigger course_skill_projection before insert on public.course_skill_links for each row execute function public.dictionary_project_link();
insert into public.dictionary_link_targets values('public','course_skill_links','canonical_skill_id');
create table public.course_prerequisites(course_version_id uuid not null references public.course_versions(id),prerequisite_course_id uuid not null references public.courses(id),primary key(course_version_id,prerequisite_course_id));
create table public.course_audit(id bigint generated always as identity primary key,actor_id uuid references public.profiles(user_id) on delete set null,action text not null,resource_id uuid,reason text not null,created_at timestamptz not null default now());

create function public.learning_admin_lock() returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('courses:write',0));
 perform public.identity_require_admin();return v_actor;
end $$;
create function public.learning_catalog_touch(p_actor uuid,p_action text,p_resource uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.course_catalog_state set revision=revision+1 where singleton;
 insert into public.course_audit(actor_id,action,resource_id,reason) values(p_actor,p_action,p_resource,p_reason);
end $$;
create function public.learning_source_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('courses:write',0));
 perform public.learning_catalog_touch(auth.uid(),'source.status',new.id,'Course source policy status changed');return new;
end $$;
create trigger course_source_status_changed after update of status on public.sources for each row when(old.kind='courses' and old.status is distinct from new.status) execute function public.learning_source_changed();
create function public.learning_source_create(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.learning_admin_lock();v_id uuid;v_provider public.course_providers%rowtype;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['providerId','name','publisher','authorizationBasis','rightsSummary','allowedHosts','permittedFields','isDemo'] or (select count(*) from jsonb_object_keys(p_data))<>8 then raise exception 'RF_INVALID_INPUT';end if;
 select * into v_provider from public.course_providers where id=p_data->>'providerId';if not found then raise exception 'RF_INVALID_INPUT';end if;
 if length(btrim(p_data->>'name')) not between 1 and 160 or length(btrim(p_data->>'publisher')) not between 1 and 200 or length(btrim(p_data->>'authorizationBasis')) not between 1 and 2000 or length(btrim(p_data->>'rightsSummary')) not between 1 and 500 or jsonb_typeof(p_data->'isDemo') is distinct from 'boolean' then raise exception 'RF_INVALID_INPUT';end if;
 if jsonb_typeof(p_data->'allowedHosts') is distinct from 'array' or jsonb_array_length(p_data->'allowedHosts') not between 1 and 20 or exists(select 1 from jsonb_array_elements_text(p_data->'allowedHosts') h where not h=any(v_provider.allowed_hosts)) then raise exception 'RF_INVALID_INPUT';end if;
 if jsonb_typeof(p_data->'permittedFields') is distinct from 'array' or jsonb_array_length(p_data->'permittedFields')<>12 or (select count(distinct value) from jsonb_array_elements_text(p_data->'permittedFields'))<>12 or exists(select 1 from jsonb_array_elements_text(p_data->'permittedFields') f where f not in ('title','url','provider','summary','skills','prerequisites','duration','practice','language','difficulty','format','availability')) then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.sources(kind,name,publisher,authorization_basis,rights_summary,allowed_hosts,permitted_fields,is_demo,created_by)
 values('courses',btrim(p_data->>'name'),btrim(p_data->>'publisher'),p_data->>'authorizationBasis',p_data->>'rightsSummary',array(select jsonb_array_elements_text(p_data->'allowedHosts')),array(select jsonb_array_elements_text(p_data->'permittedFields')),(p_data->>'isDemo')::boolean,v_actor) returning id into v_id;
 insert into public.course_source_providers values(v_id,v_provider.id);
 perform public.learning_catalog_touch(v_actor,'source.created',v_id,'Reviewed metadata source policy created');return jsonb_build_object('id',v_id);
end $$;
create function public.learning_source_status(p_id uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.learning_admin_lock();
begin
 if p_status not in ('active','revoked') or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT';end if;
 update public.sources set status=p_status where id=p_id and kind='courses';if not found then raise exception 'RF_NOT_FOUND';end if;
 insert into public.course_audit(actor_id,action,resource_id,reason) values(v_actor,'source.review',p_id,p_reason);
end $$;
create function public.learning_valid_source(p_source uuid,p_provider text,p_url text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sources s join public.course_source_providers sp on sp.source_id=s.id join public.course_providers p on p.id=sp.provider_id
 where s.id=p_source and sp.provider_id=p_provider and s.kind='courses' and s.status='active'
 and s.permitted_fields @> array['title','url','provider','summary','skills','prerequisites','duration','practice','language','difficulty','format','availability']::text[]
 and length(p_url)<=2048 and p_url ~ '^https://[a-zA-Z0-9.-]+/[^[:space:]]+$' and exists(select 1 from unnest(p.path_prefixes) prefix where starts_with(substring(p_url from '^https://[^/]+(/[^?#]*)'),prefix) and length(substring(p_url from '^https://[^/]+(/[^?#]*)'))>length(prefix))
 and lower(substring(p_url from '^https://([^/]+)'))=any(s.allowed_hosts) and lower(substring(p_url from '^https://([^/]+)'))=any(p.allowed_hosts))
$$;
create function public.learning_validate_course(p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare field text;v_source uuid;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['key','providerId','sourceId','title','url','summary','skills','prerequisiteSkills','prerequisiteCourseIds','language','difficulty','format','officialMinutes','editorialMinutes','durationNote','practice'] or (select count(*) from jsonb_object_keys(p_data))<>16 then raise exception 'RF_INVALID_INPUT';end if;
 foreach field in array array['key','title','summary','format','durationNote'] loop
  if jsonb_typeof(p_data->field) is distinct from 'string' or length(btrim(p_data->>field))<1 or length(p_data->>field)>(case field when 'summary' then 2000 when 'durationNote' then 1000 when 'format' then 60 else 200 end) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if p_data->'language'<>'null'::jsonb and (jsonb_typeof(p_data->'language')<>'string' or length(p_data->>'language') not between 1 and 60) then raise exception 'RF_INVALID_INPUT';end if;
 if coalesce(p_data->>'difficulty','') not in ('Beginner','Intermediate','Advanced','Unknown') then raise exception 'RF_INVALID_INPUT';end if;
 foreach field in array array['officialMinutes','editorialMinutes'] loop
  if p_data->field<>'null'::jsonb and (jsonb_typeof(p_data->field)<>'number' or (p_data->>field)::numeric not between 1 and 50000 or trunc((p_data->>field)::numeric)<>(p_data->>field)::numeric) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 foreach field in array array['skills','prerequisiteSkills','prerequisiteCourseIds'] loop
  if jsonb_typeof(p_data->field) is distinct from 'array' or jsonb_array_length(p_data->field)>20 or (select count(distinct lower(value)) from jsonb_array_elements_text(p_data->field))<>jsonb_array_length(p_data->field) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if jsonb_array_length(p_data->'skills')=0 or exists(select 1 from jsonb_array_elements_text((p_data->'skills')||(p_data->'prerequisiteSkills')) s where not exists(select 1 from public.skills where id=s and status='active')) then raise exception 'RF_INVALID_INPUT';end if;
 if exists(select 1 from jsonb_array_elements_text(p_data->'prerequisiteCourseIds') as prerequisite(value) where not exists(select 1 from public.courses c where c.id=prerequisite.value::uuid)) then raise exception 'RF_INVALID_INPUT';end if;
 if jsonb_typeof(p_data->'practice') is distinct from 'object' or not p_data->'practice' ?& array['prompt','completionCriteria','minutes'] or (select count(*) from jsonb_object_keys(p_data->'practice'))<>3
  or jsonb_typeof(p_data->'practice'->'prompt') is distinct from 'string' or jsonb_typeof(p_data->'practice'->'completionCriteria') is distinct from 'string' or jsonb_typeof(p_data->'practice'->'minutes') is distinct from 'number' or length(btrim(p_data->'practice'->>'prompt')) not between 1 and 1000 or length(btrim(p_data->'practice'->>'completionCriteria')) not between 1 and 1000 or (p_data->'practice'->>'minutes')::numeric not between 5 and 240 or trunc((p_data->'practice'->>'minutes')::numeric)<>(p_data->'practice'->>'minutes')::numeric then raise exception 'RF_INVALID_INPUT';end if;
 v_source:=(p_data->>'sourceId')::uuid;if not public.learning_valid_source(v_source,p_data->>'providerId',p_data->>'url') then raise exception 'RF_INVALID_INPUT';end if;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.learning_write_course_version(p_course uuid,p_version integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_version uuid;v_key text;
begin
 v_key:=regexp_replace(split_part(split_part(substring(p_data->>'url' from '^https://[^/]+(.*)$'),'#',1),'?',1),'/+$','');
 if (select url_identity from public.course_providers where id=p_data->>'providerId')='origin-path' then v_key:=lower(substring(p_data->>'url' from '^https://([^/]+)'))||v_key;end if;
 insert into public.course_url_registry(provider_id,url_key,course_id) values(p_data->>'providerId',v_key,p_course) on conflict do nothing;
 if not exists(select 1 from public.course_url_registry where provider_id=p_data->>'providerId' and url_key=v_key and course_id=p_course) then raise exception 'RF_CONFLICT';end if;
 insert into public.course_versions(course_id,version,source_id,metadata,dictionary_version) values(p_course,p_version,(p_data->>'sourceId')::uuid,p_data,public.dictionary_current_version()) returning id into v_version;
 insert into public.course_skill_links(course_version_id,skill_id,kind) select v_version,value,'teaches' from jsonb_array_elements_text(p_data->'skills');
 insert into public.course_skill_links(course_version_id,skill_id,kind) select v_version,value,'prerequisite' from jsonb_array_elements_text(p_data->'prerequisiteSkills');
 insert into public.course_prerequisites select v_version,value::uuid from jsonb_array_elements_text(p_data->'prerequisiteCourseIds');
end $$;
create function public.learning_course_create(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.learning_admin_lock();v_id uuid;
begin
 perform public.learning_validate_course(p_data);
 insert into public.courses(provider_id,canonical_key) values(p_data->>'providerId',p_data->>'key') returning id into v_id;
 perform public.learning_write_course_version(v_id,1,p_data);
 perform public.learning_catalog_touch(v_actor,'course.created',v_id,'Immutable draft metadata created');return jsonb_build_object('id',v_id,'revision',1);
 exception when unique_violation then raise exception 'RF_CONFLICT';
end $$;
create function public.learning_course_revise(p_id uuid,p_expected bigint,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.learning_admin_lock();c public.courses%rowtype;
begin
 select * into c from public.courses where id=p_id for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if c.revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
 perform public.learning_validate_course(p_data);
 if p_data->>'providerId'<>c.provider_id or p_data->>'key'<>c.canonical_key then raise exception 'RF_INVALID_INPUT';end if;
 perform public.learning_write_course_version(p_id,c.current_version+1,p_data);
 update public.courses set current_version=current_version+1,revision=revision+1,stage='draft' where id=p_id;
 perform public.learning_catalog_touch(v_actor,'course.revised',p_id,'New immutable draft; published version retained');return jsonb_build_object('id',p_id,'revision',c.revision+1);
end $$;
create function public.learning_course_transition(p_id uuid,p_expected bigint,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.learning_admin_lock();c public.courses%rowtype;v public.course_versions%rowtype;v_cycle boolean;
begin
 select * into c from public.courses where id=p_id for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if c.revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
 if p_action not in ('review','publish','retire','confirmed_active','network_failure') or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT';end if;
 select * into v from public.course_versions where course_id=p_id and version=c.current_version;
 if p_action in ('review','publish') then
  perform public.learning_validate_course(v.metadata);
  if exists(select 1 from public.course_skill_links l join public.skills s on s.id=l.canonical_skill_id where l.course_version_id=v.id and s.status<>'active') then raise exception 'RF_INVALID_INPUT';end if;
 end if;
 if p_action='publish' then
  if c.stage<>'review' then raise exception 'RF_CONFLICT';end if;
  with recursive edges(parent,child) as (
   select courses.id,pr.prerequisite_course_id from public.courses courses join public.course_versions cv on cv.course_id=courses.id and cv.version=case when courses.id=p_id then courses.current_version else courses.published_version end join public.course_prerequisites pr on pr.course_version_id=cv.id
  ), reach(root,node) as(select parent,child from edges union select reach.root,edges.child from reach join edges on edges.parent=reach.node)
  select exists(select 1 from reach where root=node) into v_cycle;
  if v_cycle then raise exception 'RF_COURSE_CYCLE';end if;
  update public.courses set published_version=current_version,stage='published',retired=false,availability='available',last_reviewed_at=clock_timestamp(),revision=revision+1 where id=p_id;
 elsif p_action='review' then update public.courses set stage='review',revision=revision+1 where id=p_id;
 elsif p_action='retire' then update public.courses set retired=true,availability='retired',revision=revision+1 where id=p_id;
 else
  if c.published_version is null or c.retired then raise exception 'RF_CONFLICT';end if;
  update public.courses set availability=case when p_action='network_failure' then 'uncertain' else 'available' end,last_reviewed_at=case when p_action='confirmed_active' then clock_timestamp() else last_reviewed_at end,revision=revision+1 where id=p_id;
 end if;
 perform public.learning_catalog_touch(v_actor,'course.'||p_action,p_id,p_reason);
end $$;
create function public.learning_course_visible(p_id uuid,p_history boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version
 where c.id=p_id and (p_history or not c.retired) and public.learning_valid_source(v.source_id,c.provider_id,v.metadata->>'url'))
$$;
create function public.learning_course_json(p_id uuid,p_history boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select (v.metadata-'key'-'sourceId'-'skills'-'prerequisiteSkills')||jsonb_build_object('id',c.id,'versionId',v.id,'version',v.version,'revision',c.revision,'providerName',p.name,
 'availability',case when c.retired then 'retired' when c.last_reviewed_at<clock_timestamp()-interval '90 days' or c.last_reviewed_at is null then 'uncertain' else c.availability end,
 'lastReviewedAt',c.last_reviewed_at,'dictionaryVersion',public.dictionary_current_version(),
 'skills',coalesce((select jsonb_agg(distinct canonical_skill_id order by canonical_skill_id) from public.course_skill_links where course_version_id=v.id and kind='teaches'),'[]'::jsonb),
 'prerequisiteSkills',coalesce((select jsonb_agg(distinct canonical_skill_id order by canonical_skill_id) from public.course_skill_links where course_version_id=v.id and kind='prerequisite'),'[]'::jsonb),
 'source',jsonb_build_object('id',s.id,'name',s.name,'publisher',s.publisher,'rightsSummary',s.rights_summary,'isDemo',s.is_demo))
 from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version join public.course_providers p on p.id=c.provider_id join public.sources s on s.id=v.source_id
 where c.id=p_id and public.learning_course_visible(p_id,p_history)
$$;
create function public.learning_course_find(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb:=public.learning_course_json(p_id);
begin if v_result is null then raise exception 'RF_NOT_FOUND';end if;return v_result;end $$;
create function public.learning_courses_list(p_skill text default null,p_difficulty text default null,p_after uuid default null,p_revision bigint default null,p_dictionary bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_revision bigint;v_dictionary bigint:=public.dictionary_current_version();v_data jsonb;v_last uuid;v_skill text;
begin
 select revision into v_revision from public.course_catalog_state where singleton;
 if (p_revision is not null and p_revision<>v_revision) or (p_dictionary is not null and p_dictionary<>v_dictionary) then raise exception 'RF_CONFLICT';end if;
 if p_difficulty is not null and p_difficulty not in ('Beginner','Intermediate','Advanced','Unknown') then raise exception 'RF_INVALID_INPUT';end if;
 if p_skill is not null then v_skill:=public.dictionary_resolve_id(p_skill);if v_skill is null then raise exception 'RF_INVALID_INPUT';end if;end if;
 select coalesce(jsonb_agg(x.data order by x.id),'[]'::jsonb),(array_agg(x.id order by x.id desc))[1] into v_data,v_last from (
 select c.id,public.learning_course_json(c.id) data from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version
 where public.learning_course_visible(c.id) and (p_after is null or c.id>p_after) and (p_difficulty is null or v.metadata->>'difficulty'=p_difficulty)
 and (v_skill is null or exists(select 1 from public.course_skill_links where course_version_id=v.id and kind='teaches' and canonical_skill_id=v_skill)) order by c.id limit 20) x;
 return jsonb_build_object('data',v_data,'lastId',case when jsonb_array_length(v_data)=20 then v_last else null end,'revision',v_revision,'dictionaryVersion',v_dictionary);
end $$;
create function public.learning_bank() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.identity_require_admin();
 return jsonb_build_object('providers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'allowedHosts',to_jsonb(allowed_hosts),'pathPrefixes',to_jsonb(path_prefixes),'urlIdentity',url_identity) order by id),'[]'::jsonb) from public.course_providers),
 'sources',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'providerId',sp.provider_id,'name',s.name,'status',s.status,'authorizationBasis',s.authorization_basis,'rightsSummary',s.rights_summary) order by s.id),'[]'::jsonb) from public.sources s join public.course_source_providers sp on sp.source_id=s.id),
 'courses',(select coalesce(jsonb_agg(v.metadata||jsonb_build_object('id',c.id,'version',v.version,'revision',c.revision,'stage',c.stage,'retired',c.retired,'publishedVersion',c.published_version) order by c.created_at desc),'[]'::jsonb) from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.current_version));
end $$;

create table public.learning_progress_state(user_id uuid primary key references public.profiles(user_id) on delete cascade,revision bigint not null default 0);
create table public.learning_progress(
 user_id uuid not null references public.profiles(user_id) on delete cascade,course_id uuid not null references public.courses(id),course_version_id uuid not null references public.course_versions(id),
 title_snapshot text not null,completed boolean not null,updated_at timestamptz not null default now(),primary key(user_id,course_id)
);
create table public.learning_plans(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,user_id uuid not null references public.profiles(user_id) on delete cascade,
 job_id uuid not null references public.jobs(id),task_id uuid unique references public.tasks(id) on delete set null,
 idempotency_key text not null,request_hash text not null,input_hash text not null,input_snapshot jsonb,output jsonb,
 status text not null default 'queued' check(status in ('queued','succeeded','invalidated')),weekly_hours numeric not null check(weekly_hours between 0 and 80),progress_revision bigint not null default 0,
 created_at timestamptz not null default now(),invalidated_at timestamptz,unique(user_id,idempotency_key)
);
create index learning_plans_owner on public.learning_plans(user_id,sequence desc);
create table public.learning_plan_evidence(plan_id uuid not null references public.learning_plans(id) on delete cascade,evidence_version_id uuid not null references public.evidence_versions(id) on delete cascade,primary key(plan_id,evidence_version_id));
create index learning_plan_evidence_source on public.learning_plan_evidence(evidence_version_id);
create table public.learning_steps(
 id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.learning_plans(id) on delete cascade,ordinal integer not null,data jsonb not null,completed boolean not null default false,
 course_id uuid references public.courses(id),course_version_id uuid references public.course_versions(id),unique(plan_id,ordinal)
);
create table public.practice_submissions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,plan_id uuid not null references public.learning_plans(id) on delete cascade,
 step_id uuid references public.learning_steps(id) on delete set null,url text not null,summary text not null,created_at timestamptz not null default now()
);
create function public.learning_private_lock() returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();return v_user;
end $$;
create function public.learning_purge_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.tasks set status='failed',safe_error='RF_CANCELED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where source_ref=old.plan_id and kind='learning.plan' and status in ('queued','running');
 update public.learning_plans set input_snapshot=null,output=null,status='invalidated',invalidated_at=clock_timestamp() where id=old.plan_id;
 delete from public.learning_steps where plan_id=old.plan_id;return old;
end $$;
create trigger learning_evidence_deleted after delete on public.learning_plan_evidence for each row execute function public.learning_purge_evidence();
create function public.learning_inputs_current(p_plan uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p.status<>'invalidated' and p.input_snapshot is not null
 and (p.input_snapshot->'matching'->>'profileRevision')::bigint=coalesce((select revision from public.career_preferences where user_id=p.user_id),0)
 and (p.input_snapshot->'matching'->>'catalogRevision')::bigint=(select revision from public.catalog_state where singleton)
 and (p.input_snapshot->'matching'->>'dictionaryVersion')::bigint=public.dictionary_current_version()
 and (p.input_snapshot->>'courseRevision')::bigint=(select revision from public.course_catalog_state where singleton)
 and (p.input_snapshot->>'progressRevision')::bigint=coalesce((select revision from public.learning_progress_state where user_id=p.user_id),0)
 and exists(select 1 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version where j.id=p.job_id and v.id::text=p.input_snapshot->'matching'->'jobs'->0->>'versionId' and public.catalog_job_visible(j.id) and (j.expires_at is null or j.expires_at>clock_timestamp()))
 and not exists(select 1 from jsonb_array_elements(p.input_snapshot->'matching'->'evidence') item where not exists(select 1 from public.evidence_versions ev join public.evidence e on e.id=ev.evidence_id where ev.id=(item->>'versionId')::uuid and ev.user_id=p.user_id and ev.version=e.current_version))
 and not exists(select 1 from jsonb_array_elements(p.input_snapshot->'courses') item where not exists(
  select 1 from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version
  where c.id=(item->>'id')::uuid and v.id=(item->>'versionId')::uuid and public.learning_course_visible(c.id,true)
  and (case when c.retired then 'retired' when c.last_reviewed_at is null or c.last_reviewed_at<clock_timestamp()-interval '90 days' then 'uncertain' else c.availability end)=item->>'availability'))
 ,false) from public.learning_plans p where p.id=p_plan
$$;
-- Retrieve target skill resources and the transitive foundation closure, not the whole catalog.
create function public.learning_candidate_courses(p_job jsonb,p_overrides jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_ids uuid[];
begin
 with recursive eligible as materialized (
  select c.id,v.id version_id from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version where public.learning_course_visible(c.id,true)
 ), edges(parent,child) as (
  select e.id,pr.prerequisite_course_id from eligible e join public.course_prerequisites pr on pr.course_version_id=e.version_id join eligible child on child.id=pr.prerequisite_course_id
  union
  select e.id,foundation.id from eligible e join public.course_skill_links req on req.course_version_id=e.version_id and req.kind='prerequisite'
   join public.course_skill_links teaches on teaches.canonical_skill_id=req.canonical_skill_id and teaches.kind='teaches' join eligible foundation on foundation.version_id=teaches.course_version_id where foundation.id<>e.id
 ), selected(id) as (
  select distinct e.id from eligible e where exists(select 1 from public.course_skill_links link where link.course_version_id=e.version_id and link.kind='teaches' and exists(select 1 from jsonb_array_elements(p_job->'requirements') req where req->'skills' ? link.canonical_skill_id))
   or exists(select 1 from jsonb_array_elements(p_overrides) o where lower(o->>'courseId')=e.id::text)
  union select edges.child from selected join edges on edges.parent=selected.id
 ) select array_agg(id order by id) into v_ids from selected;
 if coalesce(cardinality(v_ids),0)>200 then raise exception 'RF_LEARNING_LIMIT';end if;
 return coalesce((select jsonb_agg(public.learning_course_json(id,true) order by id) from unnest(v_ids) id),'[]'::jsonb);
end $$;
create function public.learning_plan_start(p_job uuid,p_hours numeric,p_overrides jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.learning_private_lock();p public.learning_plans%rowtype;v_request text;v_profile jsonb;v_job jsonb;v_matching jsonb;v_courses jsonb;v_evidence jsonb;v_snapshot jsonb;v_id uuid;v_task uuid;v_count integer;
begin
 p_overrides:=coalesce((select jsonb_agg(value||jsonb_build_object('courseId',lower(value->>'courseId'))) from jsonb_array_elements(p_overrides)),'[]'::jsonb);
 if p_hours is null or p_hours not between 0 and 80 or p_key is null or length(p_key) not between 8 and 200 or jsonb_typeof(p_overrides) is distinct from 'array' or jsonb_array_length(p_overrides)>100 then raise exception 'RF_INVALID_INPUT';end if;
 if exists(select 1 from jsonb_array_elements(p_overrides) o where jsonb_typeof(o) is distinct from 'object' or not o ?& array['courseId','minutes'] or (select count(*) from jsonb_object_keys(o))<>2 or jsonb_typeof(o->'minutes')<>'number' or (o->>'minutes')::numeric not between 1 and 50000 or trunc((o->>'minutes')::numeric)<>(o->>'minutes')::numeric)
 or (select count(distinct lower(value->>'courseId')) from jsonb_array_elements(p_overrides))<>jsonb_array_length(p_overrides) then raise exception 'RF_INVALID_INPUT';end if;
 v_request:=md5(jsonb_build_object('jobId',p_job,'weeklyHours',p_hours,'durationOverrides',p_overrides)::text);
 select * into p from public.learning_plans where user_id=v_user and idempotency_key=p_key;
 if found then if p.request_hash<>v_request then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('planId',p.id,'taskId',p.task_id,'status',(select status from public.tasks where id=p.task_id));end if;
 v_job:=public.matching_job_input(p_job);if v_job is null then raise exception 'RF_NOT_FOUND';end if;
 v_profile:=public.profile_read();v_evidence:=public.matching_evidence_input(v_user);
 if jsonb_array_length(v_evidence)>500 then raise exception 'RF_LEARNING_LIMIT';end if;
 if exists(select 1 from jsonb_array_elements(p_overrides) o where not public.learning_course_visible((o->>'courseId')::uuid)) then raise exception 'RF_INVALID_INPUT';end if;
 v_courses:=public.learning_candidate_courses(v_job,p_overrides);
 v_matching:=jsonb_build_object('profileRevision',(v_profile->>'revision')::bigint,'catalogRevision',(select revision from public.catalog_state where singleton),'dictionaryVersion',public.dictionary_current_version(),'track',v_profile->>'track','workplaces',v_profile->'workplaces','constraints',jsonb_build_object('experienceYears',null,'confirmations','[]'::jsonb),'evidence',v_evidence,'jobs',jsonb_build_array(v_job));
 v_snapshot:=jsonb_build_object('matching',v_matching,'courseRevision',(select revision from public.course_catalog_state where singleton),'progressRevision',coalesce((select revision from public.learning_progress_state where user_id=v_user),0),
 'courses',v_courses,'completedCourseIds',coalesce((select jsonb_agg(course_id order by course_id) from public.learning_progress where user_id=v_user and completed),'[]'::jsonb),'weeklyHours',p_hours,'durationOverrides',p_overrides);
 if octet_length(v_snapshot::text)>2097152 then raise exception 'RF_LEARNING_LIMIT';end if;
 insert into public.learning_plans(user_id,job_id,idempotency_key,request_hash,input_hash,input_snapshot,weekly_hours) values(v_user,p_job,p_key,v_request,md5(v_snapshot::text),v_snapshot,p_hours) returning id into v_id;
 insert into public.learning_plan_evidence select v_id,(e->>'versionId')::uuid from jsonb_array_elements(v_evidence) e;
 v_task:=public.task_enqueue(v_user,'learning.plan',v_id,md5(v_snapshot::text),p_key,v_request);
 update public.learning_plans set task_id=v_task where id=v_id;
 return jsonb_build_object('planId',v_id,'taskId',v_task,'status','queued');
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.learning_load_task(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;p public.learning_plans%rowtype;v_user uuid;
begin
 select user_id into v_user from public.tasks where id=p_task;if v_user is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(v_user) then raise exception 'RF_FORBIDDEN';end if;
 if t.kind<>'learning.plan' or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 select * into p from public.learning_plans where id=t.source_ref and user_id=v_user for update;
 if not found or p.task_id<>p_task or p.input_hash<>t.input_version or not public.learning_inputs_current(p.id) then raise exception 'RF_STALE_INPUT';end if;return p.input_snapshot;
end $$;
create function public.learning_publish_task(p_task uuid,p_token uuid,p_output jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;p public.learning_plans%rowtype;v_user uuid;step jsonb;course jsonb;v_estimate numeric;v_total integer:=0;v_ordinal integer:=0;v_week integer;v_key text;v_skill text;v_prereq text;v_keys text[]:='{}';v_completed jsonb;
begin
 select user_id into v_user from public.tasks where id=p_task;if v_user is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock_shared(hashtextextended('courses:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(v_user) then raise exception 'RF_FORBIDDEN';end if;
 if t.kind<>'learning.plan' then raise exception 'RF_INVALID_INPUT';end if;
 select * into p from public.learning_plans where id=t.source_ref and user_id=v_user for update;
 if not found or p.task_id<>p_task or p.input_hash<>t.input_version or not public.learning_inputs_current(p.id) then raise exception 'RF_STALE_INPUT';end if;
 if t.status='succeeded' and p.status='succeeded' then return jsonb_build_object('resultRef',p.id);end if;
 if t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 if jsonb_typeof(p_output) is distinct from 'object' or p_output->>'recipe' is distinct from 'learning-rules-v1' or p_output->>'matchingRecipe' is distinct from 'rules-v1' or jsonb_typeof(p_output->'steps') is distinct from 'array' or jsonb_array_length(p_output->'steps')>40 or octet_length(p_output::text)>2097152 then raise exception 'RF_INVALID_INPUT';end if;
 if (p_output->>'budgetMinutes')::integer<>floor(p.weekly_hours*60)::integer*2 or (select count(distinct value->>'key') from jsonb_array_elements(p_output->'steps'))<>jsonb_array_length(p_output->'steps') then raise exception 'RF_INVALID_INPUT';end if;
 v_completed:=p.input_snapshot->'completedCourseIds';
 for step in select value from jsonb_array_elements(p_output->'steps') loop
  v_key:=step->>'key';course:=null;
  if length(v_key) not between 1 and 100 or (step->>'studyMinutes')::integer<0 or (step->>'practiceMinutes')::integer<0 or (step->>'remainingMinutes')::integer<0 or jsonb_typeof(step->'weeks') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(step->'dependsOn') dep where not dep=any(v_keys)) then raise exception 'RF_INVALID_INPUT';end if;
  if (select coalesce(sum((part->>'minutes')::integer),0) from jsonb_array_elements(step->'weeks') part)<>(step->>'studyMinutes')::integer+(step->>'practiceMinutes')::integer
   or exists(select 1 from jsonb_array_elements(step->'weeks') part where (part->>'week')::integer not in (1,2) or (part->>'minutes')::integer<=0) then raise exception 'RF_INVALID_INPUT';end if;
  if step->>'kind'='course' then
   select value into course from jsonb_array_elements(p.input_snapshot->'courses') c where c.value->>'id'=step->>'courseId' and c.value->>'versionId'=step->>'courseVersionId';
   if course is null or course->>'availability'<>'available' or v_completed ? (step->>'courseId') or step->'title' is distinct from course->'title' or step->'skills' is distinct from course->'skills' or step->'practicePrompt' is distinct from course->'practice'->'prompt' or v_key<>'course:'||(course->>'id') then raise exception 'RF_INVALID_INPUT';end if;
   select (o->>'minutes')::numeric into v_estimate from jsonb_array_elements(p.input_snapshot->'durationOverrides') o where lower(o->>'courseId')=course->>'id';
   v_estimate:=coalesce(v_estimate,(course->>'officialMinutes')::numeric,(course->>'editorialMinutes')::numeric);
   if v_estimate is null or (step->>'studyMinutes')::numeric>v_estimate or (step->>'practiceMinutes')::integer>(course->'practice'->>'minutes')::integer or (step->>'remainingMinutes')::numeric<>v_estimate+(course->'practice'->>'minutes')::integer-(step->>'studyMinutes')::integer-(step->>'practiceMinutes')::integer then raise exception 'RF_INVALID_INPUT';end if;
   for v_prereq in select value from jsonb_array_elements_text(course->'prerequisiteCourseIds') loop
    v_prereq:=lower(v_prereq);
    if not v_completed ? v_prereq and not exists(select 1 from public.learning_steps previous where previous.plan_id=p.id and previous.course_id=v_prereq::uuid and previous.data->>'scope'='full-resource' and step->'dependsOn' ? (previous.data->>'key')) then raise exception 'RF_INVALID_INPUT';end if;
   end loop;
   for v_skill in select value from jsonb_array_elements_text(course->'prerequisiteSkills') loop
    if not exists(select 1 from jsonb_array_elements(p.input_snapshot->'matching'->'evidence') e where e->>'signal' in ('support','claim','reference') and e->'skills' ? v_skill)
     and not exists(select 1 from public.learning_steps previous where previous.plan_id=p.id and previous.data->>'scope'='full-resource' and previous.data->'skills' ? v_skill and step->'dependsOn' ? (previous.data->>'key')) then raise exception 'RF_INVALID_INPUT';end if;
   end loop;
  elsif step->>'kind'='practice' then
   if step->'courseId'<>'null'::jsonb or step->'courseVersionId'<>'null'::jsonb or step->>'scope'<>'practice-only' or (step->>'studyMinutes')::integer<>0 then raise exception 'RF_INVALID_INPUT';end if;
   if exists(select 1 from jsonb_array_elements_text(step->'skills') skill where not exists(select 1 from jsonb_array_elements(p.input_snapshot->'matching'->'jobs'->0->'requirements') req where req->'skills' ? skill)) then raise exception 'RF_INVALID_INPUT';end if;
  else raise exception 'RF_INVALID_INPUT';end if;
  v_total:=v_total+(step->>'studyMinutes')::integer+(step->>'practiceMinutes')::integer;v_ordinal:=v_ordinal+1;
  insert into public.learning_steps(plan_id,ordinal,data,course_id,course_version_id) values(p.id,v_ordinal,step,(course->>'id')::uuid,(course->>'versionId')::uuid);
  v_keys:=array_append(v_keys,v_key);
 end loop;
 for v_week in 1..2 loop
  if (select coalesce(sum((part->>'minutes')::integer),0) from jsonb_array_elements(p_output->'steps') item cross join lateral jsonb_array_elements(item->'weeks') part where (part->>'week')::integer=v_week)>floor(p.weekly_hours*60) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if v_total<>(p_output->>'scheduledMinutes')::integer then raise exception 'RF_INVALID_INPUT';end if;
 if not public.learning_inputs_current(p.id) then raise exception 'RF_STALE_INPUT';end if;
 update public.tasks set status='succeeded',result_ref=p.id,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null,safe_error=null where id=p_task and status='running' and lease_token=p_token and lease_expires_at>clock_timestamp();if not found then raise exception 'RF_CONFLICT';end if;
 update public.learning_plans set output=p_output,status='succeeded' where id=p.id;
 insert into public.task_events(task_id,event) values(p_task,'task.succeeded');return jsonb_build_object('resultRef',p.id);
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.learning_progress_json(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',coalesce((select revision from public.learning_progress_state where user_id=p_user),0),'data',coalesce((select jsonb_agg(jsonb_build_object('courseId',course_id,'courseVersionId',course_version_id,'title',title_snapshot,'completed',completed,'updatedAt',updated_at) order by course_id) from public.learning_progress where user_id=p_user),'[]'::jsonb))
$$;
create function public.learning_progress_read() returns jsonb language sql stable security definer set search_path='' as $$select public.learning_progress_json(public.identity_require_user())$$;
create function public.learning_course_progress(p_course uuid,p_expected bigint,p_completed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.learning_private_lock();v_version uuid;v_title text;v_revision bigint;
begin
 insert into public.learning_progress_state(user_id) values(v_user) on conflict do nothing;select revision into v_revision from public.learning_progress_state where user_id=v_user;
 if v_revision is distinct from p_expected or p_completed is null then raise exception 'RF_CONFLICT';end if;
 if public.learning_course_visible(p_course) then select v.id,v.metadata->>'title' into v_version,v_title from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version where c.id=p_course;
 else
  select step.course_version_id,v.metadata->>'title' into v_version,v_title from public.learning_steps step join public.learning_plans p on p.id=step.plan_id join public.course_versions v on v.id=step.course_version_id where p.user_id=v_user and step.course_id=p_course limit 1;
  if v_version is null then select course_version_id,title_snapshot into v_version,v_title from public.learning_progress where user_id=v_user and course_id=p_course;end if;
 end if;
 if v_version is null then raise exception 'RF_NOT_FOUND';end if;
 insert into public.learning_progress(user_id,course_id,course_version_id,title_snapshot,completed) values(v_user,p_course,v_version,v_title,p_completed)
 on conflict(user_id,course_id) do update set course_version_id=excluded.course_version_id,title_snapshot=excluded.title_snapshot,completed=excluded.completed,updated_at=clock_timestamp();
 update public.learning_progress_state set revision=revision+1 where user_id=v_user;return public.learning_progress_json(v_user);
end $$;
create function public.learning_plan_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'taskId',p.task_id,'jobId',p.job_id,'status',case when p.status='queued' then coalesce(t.status,'failed') else p.status end,'createdAt',p.created_at,'stale',not public.learning_inputs_current(p.id),'progressRevision',p.progress_revision,'weeklyHours',p.weekly_hours,'output',p.output,
 'steps',coalesce((select jsonb_agg(s.data||jsonb_build_object('id',s.id,'completed',s.completed,'available',case when s.course_id is null then true else public.learning_course_visible(s.course_id) and exists(select 1 from public.courses current where current.id=s.course_id and current.published_version=v.version and current.availability='available' and current.last_reviewed_at>=clock_timestamp()-interval '90 days') end,'url',v.metadata->'url') order by s.ordinal)
 from public.learning_steps s left join public.course_versions v on v.id=s.course_version_id where s.plan_id=p.id),'[]'::jsonb),
 'practiceSubmissions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'stepId',step_id,'url',url,'summary',summary,'createdAt',created_at) order by created_at) from public.practice_submissions where plan_id=p.id and user_id=p.user_id),'[]'::jsonb),'nextCursor',null)
 from public.learning_plans p left join public.tasks t on t.id=p.task_id where p.id=p_id
$$;
create function public.learning_plan_find(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.learning_private_lock();
begin if not exists(select 1 from public.learning_plans where id=p_id and user_id=v_user) then raise exception 'RF_NOT_FOUND';end if;return public.learning_plan_json(p_id);end $$;
create function public.learning_plans_list(p_before bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_data jsonb;v_last bigint;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'jobId',p.job_id,'status',case when p.status='queued' then coalesce(t.status,'failed') else p.status end,'createdAt',p.created_at) order by p.sequence desc),'[]'::jsonb),min(p.sequence) into v_data,v_last
 from (select * from public.learning_plans where user_id=v_user and (p_before is null or sequence<p_before) order by sequence desc limit 20) p left join public.tasks t on t.id=p.task_id;
 return jsonb_build_object('data',v_data,'lastSequence',case when exists(select 1 from public.learning_plans where user_id=v_user and sequence<v_last) then v_last::text else null end);
end $$;
create function public.learning_step_progress(p_plan uuid,p_step uuid,p_expected bigint,p_completed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.learning_private_lock();p public.learning_plans%rowtype;
begin
 select * into p from public.learning_plans where id=p_plan and user_id=v_user for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if p.status<>'succeeded' or p.progress_revision is distinct from p_expected or p_completed is null then raise exception 'RF_CONFLICT';end if;
 update public.learning_steps set completed=p_completed where id=p_step and plan_id=p_plan;if not found then raise exception 'RF_NOT_FOUND';end if;
 update public.learning_plans set progress_revision=progress_revision+1 where id=p_plan;return public.learning_plan_json(p_plan);
end $$;
create function public.learning_practice(p_plan uuid,p_step uuid,p_expected bigint,p_url text,p_summary text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.learning_private_lock();p public.learning_plans%rowtype;
begin
 select * into p from public.learning_plans where id=p_plan and user_id=v_user for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if p.status<>'succeeded' or p.progress_revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
 if not exists(select 1 from public.learning_steps where id=p_step and plan_id=p_plan) then raise exception 'RF_NOT_FOUND';end if;
 if length(p_url)>2048 or p_url !~ '^https://[^/@[:space:]]+(/|$)' or length(btrim(p_summary)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT';end if;
 if (select count(*) from public.practice_submissions where plan_id=p_plan)>=100 then raise exception 'RF_LEARNING_LIMIT';end if;
 insert into public.practice_submissions(user_id,plan_id,step_id,url,summary) values(v_user,p_plan,p_step,p_url,btrim(p_summary));
 update public.learning_plans set progress_revision=progress_revision+1 where id=p_plan;return public.learning_plan_json(p_plan);
end $$;
create function public.learning_practice_delete(p_plan uuid,p_submission uuid,p_expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.learning_private_lock();p public.learning_plans%rowtype;
begin
 select * into p from public.learning_plans where id=p_plan and user_id=v_user for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if p.progress_revision is distinct from p_expected then raise exception 'RF_CONFLICT';end if;
 delete from public.practice_submissions where id=p_submission and plan_id=p_plan and user_id=v_user;if not found then raise exception 'RF_NOT_FOUND';end if;
 update public.learning_plans set progress_revision=progress_revision+1 where id=p_plan;return public.learning_plan_json(p_plan);
end $$;

do $$ declare name text;f record;begin
 foreach name in array array['course_providers','course_source_providers','course_catalog_state','courses','course_versions','course_url_registry','course_skill_links','course_prerequisites','course_audit','learning_progress_state','learning_progress','learning_plans','learning_plan_evidence','learning_steps','practice_submissions'] loop
  execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from anon,authenticated',name);execute format('grant all on public.%I to service_role',name);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'learning_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.learning_course_find(uuid),public.learning_courses_list(text,text,uuid,bigint,bigint) to anon,authenticated;
grant execute on function public.learning_source_create(jsonb),public.learning_source_status(uuid,text,text),public.learning_course_create(jsonb),public.learning_course_revise(uuid,bigint,jsonb),public.learning_course_transition(uuid,bigint,text,text),public.learning_bank(),public.learning_plan_start(uuid,numeric,jsonb,text),public.learning_plan_find(uuid),public.learning_plans_list(bigint),public.learning_progress_read(),public.learning_course_progress(uuid,bigint,boolean),public.learning_step_progress(uuid,uuid,bigint,boolean),public.learning_practice(uuid,uuid,bigint,text,text),public.learning_practice_delete(uuid,uuid,bigint) to authenticated;
