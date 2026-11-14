-- Module 03: canonical jobs, immutable versions, source governance and private bookmarks.
create table public.sources (
 id uuid primary key default gen_random_uuid(), kind text not null default 'jobs' check(kind in ('jobs','courses')),
 name text not null check(length(name) between 1 and 160), publisher text not null,
 authorization_basis text not null, rights_summary text not null,
 allowed_hosts text[] not null, permitted_fields text[] not null,
 status text not null default 'active' check(status in ('active','revoked')), is_demo boolean not null default false,
 created_by uuid references public.profiles(user_id) on delete set null, created_at timestamptz not null default now()
);
create table public.job_specializations (id text primary key,title text not null,aliases text[] not null);
insert into public.job_specializations(id,title,aliases) values
('ai-llm-applications','AI / LLM application engineering',array['AI engineer','LLM engineer','RAG','AI application','AI 工程師','LLM 應用工程師']::text[]),
('machine-learning','Machine learning engineering',array['ML engineer','機器學習工程師','模型工程師']::text[]),
('data-analytics-science','Data analytics & data science',array['Data analyst','Data scientist','Growth analyst','資料分析師','資料科學家','數據分析']::text[]),
('data-engineering','Data engineering',array['Data engineer','ETL','ELT','資料工程師','資料管線']::text[]),
('mlops-platform','MLOps & AI platform engineering',array['MLOps','AI platform','ML platform','DevOps','AI 平台工程師','模型部署']::text[]),
('computer-vision-edge','Computer vision & Edge AI',array['Computer vision','Edge AI','Vision engineer','電腦視覺','邊緣 AI','視覺檢測']::text[]),
('ai-product-consulting','AI product & implementation consulting',array['AI PM','Product manager','AI consultant','Solutions consultant','AI 產品經理','AI 導入顧問']::text[]),
('ai-automation-operations','AI automation & operations',array['AI automation','Workflow specialist','n8n','流程自動化','AI 營運','自動化工程']::text[]),
('ai-research','AI research & research engineering',array['AI researcher','Research engineer','Research scientist','AI 研究員','研究工程師']::text[]),
('ai-design-content','AI design & content',array['Content designer','Generative designer','AI 設計','生成式內容','AI 影音']::text[]);

create table public.companies (id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 200));
create unique index company_canonical_name on public.companies(lower(btrim(name)));
create table public.jobs (
 id uuid primary key default gen_random_uuid(), canonical_key text not null unique,
 company_id uuid not null references public.companies(id), status text not null default 'draft' check(status in ('draft','review','published','expired','rejected')),
 current_version integer not null default 1, revision bigint not null default 1,
 published_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now()
);
create table public.job_versions (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),version integer not null,
 company_name text not null,title text not null,track text not null check(track in ('Engineering & data','Product & strategy','Marketing & operations','Design & content')),
 specialization text not null references public.job_specializations(id),location text,workplace text check(workplace in ('Remote','Hybrid','On-site')),level text check(level in ('Intern','Entry','Mid','Senior','Lead')),
 salary_min numeric,salary_max numeric,salary_currency text,salary_interval text check(salary_interval in ('hour','month','year')),
 summary text not null,responsibilities text[] not null,conditions jsonb not null,created_at timestamptz not null default now(),
 unique(job_id,version),check(salary_min is null or salary_min>0),check(salary_max is null or salary_max>0),check(salary_min is null or salary_max is null or salary_min<=salary_max)
);
create table public.job_sources (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id),source_id uuid not null references public.sources(id),external_id text not null,
 original_url text not null,freshness text not null default 'current' check(freshness in ('current','uncertain','closed')),
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),last_validated_at timestamptz, last_attempt_at timestamptz not null default now(),
 unique(source_id,external_id)
);
create index job_sources_by_job on public.job_sources(job_id,source_id,freshness);
create table public.job_requirements (id uuid primary key default gen_random_uuid(),job_version_id uuid not null references public.job_versions(id),ordinal integer not null,priority text not null check(priority in ('mandatory','preferred')),text text not null,unique(job_version_id,ordinal));
create table public.job_skill_links (requirement_id uuid not null references public.job_requirements(id),skill_id text not null references public.skills(id),primary key(requirement_id,skill_id));
create table public.catalog_state (singleton boolean primary key default true check(singleton),revision bigint not null default 0);
insert into public.catalog_state values(true,0);
create table public.catalog_audit (id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(user_id) on delete set null,action text not null,resource_id uuid,created_at timestamptz not null default now());
create table public.bookmark_revisions (user_id uuid primary key references public.profiles(user_id) on delete cascade,revision bigint not null default 0);
create table public.bookmarks (
 user_id uuid not null references public.profiles(user_id) on delete cascade,job_id uuid not null references public.jobs(id),job_version_id uuid not null references public.job_versions(id),
 title_snapshot text not null,company_snapshot text not null,source_url_snapshot text not null,created_at timestamptz not null default now(),primary key(user_id,job_id)
);
create index job_public_lookup on public.jobs(status,id,expires_at);

create function public.catalog_touch(p_actor uuid,p_action text,p_resource uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.catalog_state set revision=revision+1 where singleton;
 insert into public.catalog_audit(actor_id,action,resource_id) values(p_actor,p_action,p_resource);
end $$;
create function public.catalog_lock() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.identity_require_admin();
begin
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));
 perform public.identity_require_admin(); return v_actor;
end $$;
create function public.catalog_valid_link(p_source uuid,p_url text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sources s where s.id=p_source and s.kind='jobs' and s.status='active'
 and length(p_url)<=2048 and p_url ~ '^https://[^/@[:space:]]+(/|$)'
 and lower(substring(p_url from '^https://([^/:?#]+)'))=any(s.allowed_hosts))
$$;
create function public.catalog_source_create(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_id uuid;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['name','publisher','authorizationBasis','rightsSummary','allowedHosts','permittedFields','isDemo']
 or length(btrim(p_data->>'name')) not between 1 and 160 or length(btrim(p_data->>'publisher')) not between 1 and 200
 or length(btrim(p_data->>'authorizationBasis')) not between 1 and 2000 or length(btrim(p_data->>'rightsSummary')) not between 1 and 500
 or jsonb_typeof(p_data->'allowedHosts') is distinct from 'array' or jsonb_typeof(p_data->'permittedFields') is distinct from 'array'
 or jsonb_typeof(p_data->'isDemo') is distinct from 'boolean' then raise exception 'RF_INVALID_INPUT'; end if;
 if jsonb_array_length(p_data->'allowedHosts') not between 1 and 20 or jsonb_array_length(p_data->'permittedFields') not between 1 and 12
 or exists(select 1 from jsonb_array_elements_text(p_data->'allowedHosts') h where h !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
 or exists(select 1 from jsonb_array_elements_text(p_data->'permittedFields') f where f not in ('title','company','track','specialization','location','workplace','level','salary','summary','responsibilities','requirements','conditions')) then raise exception 'RF_INVALID_INPUT'; end if;
 insert into public.sources(name,publisher,authorization_basis,rights_summary,allowed_hosts,permitted_fields,is_demo,created_by)
 values(btrim(p_data->>'name'),btrim(p_data->>'publisher'),p_data->>'authorizationBasis',p_data->>'rightsSummary',array(select jsonb_array_elements_text(p_data->'allowedHosts')),array(select jsonb_array_elements_text(p_data->'permittedFields')),(p_data->>'isDemo')::boolean,v_actor) returning id into v_id;
 perform public.catalog_touch(v_actor,'source.created',v_id);return jsonb_build_object('id',v_id);
end $$;
create function public.catalog_required_fields(p_version uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select array['title','company','track','specialization','summary','requirements']::text[]
 ||case when v.location is not null then array['location'] else '{}'::text[] end
 ||case when v.workplace is not null then array['workplace'] else '{}'::text[] end
 ||case when v.level is not null then array['level'] else '{}'::text[] end
 ||case when v.salary_min is not null or v.salary_max is not null then array['salary'] else '{}'::text[] end
 ||case when cardinality(v.responsibilities)>0 then array['responsibilities'] else '{}'::text[] end
 ||case when v.conditions<>'{"workAuthorization":null,"education":null,"experienceYears":null}'::jsonb then array['conditions'] else '{}'::text[] end
 from public.job_versions v where v.id=p_version
$$;
create function public.catalog_job_visible(p_job uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version
 where j.id=p_job and j.status='published' and (j.expires_at is null or j.expires_at>now())
 and exists(select 1 from public.job_sources l join public.sources s on s.id=l.source_id where l.job_id=j.id and l.freshness<>'closed'
 and s.status='active' and public.catalog_valid_link(s.id,l.original_url) and s.permitted_fields @> public.catalog_required_fields(v.id)))
$$;
create function public.catalog_job_json(p_job uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'versionId',v.id,'version',v.version,'revision',j.revision,'publishedAt',j.published_at,'expiresAt',j.expires_at,
 'company',v.company_name,'title',v.title,'track',v.track,'specialization',v.specialization,'location',v.location,'workplace',v.workplace,'level',v.level,
 'salary',case when v.salary_min is null and v.salary_max is null then null else jsonb_build_object('min',v.salary_min,'max',v.salary_max,'currency',v.salary_currency,'interval',v.salary_interval) end,
 'summary',v.summary,'responsibilities',to_jsonb(v.responsibilities),'conditions',v.conditions,
 'requirements',(select jsonb_agg(jsonb_build_object('text',r.text,'priority',r.priority,'skills',coalesce((select jsonb_agg(l.skill_id order by l.skill_id) from public.job_skill_links l where l.requirement_id=r.id),'[]'::jsonb)) order by r.ordinal) from public.job_requirements r where r.job_version_id=v.id),
 'sources',(select jsonb_agg(jsonb_build_object('id',l.id,'name',s.name,'publisher',s.publisher,'url',l.original_url,'rightsSummary',s.rights_summary,'isDemo',s.is_demo,'freshness',l.freshness,'firstSeenAt',l.first_seen_at,'lastSeenAt',l.last_seen_at,'lastValidatedAt',l.last_validated_at) order by l.id)
 from public.job_sources l join public.sources s on s.id=l.source_id where l.job_id=j.id and l.freshness<>'closed' and s.status='active' and public.catalog_valid_link(s.id,l.original_url) and s.permitted_fields @> public.catalog_required_fields(v.id)))
 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version where j.id=p_job and public.catalog_job_visible(j.id)
$$;
create function public.catalog_find_job(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_json jsonb;
begin v_json:=public.catalog_job_json(p_id);if v_json is null then raise exception 'RF_NOT_FOUND';end if;return v_json;end $$;
create function public.catalog_search_jobs(p_filters jsonb,p_after uuid default null,p_revision bigint default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_revision bigint;v_data jsonb;v_last uuid;v_more boolean;v_counts jsonb;
begin
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or p_limit is null or p_limit not between 1 and 50 or length(coalesce(p_filters->>'q',''))>200 then raise exception 'RF_INVALID_INPUT';end if;
 select revision into v_revision from public.catalog_state where singleton;
 if p_after is not null and (p_revision is null or p_revision<>v_revision) then raise exception 'RF_CONFLICT';end if;
 with candidates as (
 select j.id,v.id as version_id,v.specialization from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version join public.job_specializations sp on sp.id=v.specialization
 where public.catalog_job_visible(j.id)
 and (not p_filters?'track' or v.track=p_filters->>'track') and (not p_filters?'workplace' or v.workplace=p_filters->>'workplace')
 and (not p_filters?'level' or v.level=p_filters->>'level') and (not p_filters?'location' or position(lower(p_filters->>'location') in lower(coalesce(v.location,'')))>0)
 and not exists(select 1 from regexp_split_to_table(lower(btrim(coalesce(p_filters->>'q',''))),'\s+') term where term<>'' and position(term in lower(v.title||' '||v.company_name||' '||coalesce(v.location,'')||' '||v.summary||' '||sp.title||' '||array_to_string(sp.aliases,' ')||' '||array_to_string(v.responsibilities,' ')||' '||coalesce((select string_agg(r.text||' '||coalesce((select string_agg(k.id||' '||k.name_en,' ') from public.job_skill_links l join public.skills k on k.id=l.skill_id where l.requirement_id=r.id),''),' ') from public.job_requirements r where r.job_version_id=v.id),'')))=0)
 ),filtered as (select * from candidates c where (not p_filters?'specialization' or c.specialization=p_filters->>'specialization')),
 page as (select * from filtered where p_after is null or id>p_after order by id limit p_limit+1),shown as(select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(public.catalog_job_json(id) order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*)>p_limit from page),
 coalesce((select jsonb_object_agg(specialization,n) from(select specialization,count(*) n from candidates group by specialization)c),'{}'::jsonb)
 into v_data,v_last,v_more,v_counts;
 return jsonb_build_object('data',v_data,'lastId',case when v_more then v_last end,'revision',v_revision,'counts',v_counts);
end $$;

create function public.catalog_validate_job(p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb;v_salary jsonb:=p_data->'salary';
begin
 if jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['canonicalKey','company','title','track','specialization','location','workplace','level','salary','summary','responsibilities','requirements','conditions','expiresAt'] then raise exception 'RF_INVALID_INPUT';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('canonicalKey','company','title','track','specialization','location','workplace','level','salary','summary','responsibilities','requirements','conditions','expiresAt'))
 or length(btrim(p_data->>'canonicalKey')) not between 1 and 200 or length(btrim(p_data->>'company')) not between 1 and 200 or length(btrim(p_data->>'title')) not between 1 and 200
 or length(btrim(p_data->>'summary')) not between 1 and 3000 or p_data->>'track' not in ('Engineering & data','Product & strategy','Marketing & operations','Design & content')
 or not exists(select 1 from public.job_specializations where id=p_data->>'specialization')
 or (p_data->>'location' is not null and length(p_data->>'location')>200)
 or (p_data->>'workplace' is not null and p_data->>'workplace' not in ('Remote','Hybrid','On-site'))
 or (p_data->>'level' is not null and p_data->>'level' not in ('Intern','Entry','Mid','Senior','Lead'))
 or jsonb_typeof(p_data->'responsibilities') is distinct from 'array' or jsonb_typeof(p_data->'requirements') is distinct from 'array'
 or jsonb_typeof(p_data->'conditions') is distinct from 'object' then raise exception 'RF_INVALID_INPUT';end if;
 if jsonb_array_length(p_data->'responsibilities')>15 or exists(select 1 from jsonb_array_elements(p_data->'responsibilities') t where jsonb_typeof(t)<>'string' or length(t#>>'{}') not between 1 and 1000)
 or jsonb_array_length(p_data->'requirements') not between 1 and 20 then raise exception 'RF_INVALID_INPUT';end if;
 if v_salary<>'null'::jsonb then
  if jsonb_typeof(v_salary)<>'object' or not v_salary ?& array['min','max','currency','interval']
  or (v_salary->>'min' is null and v_salary->>'max' is null) or v_salary->>'currency' !~ '^[A-Z]{3}$' or v_salary->>'interval' not in ('hour','month','year')
  or (v_salary->>'min' is not null and (v_salary->>'min')::numeric<=0) or (v_salary->>'max' is not null and (v_salary->>'max')::numeric<=0)
  or (v_salary->>'min' is not null and v_salary->>'max' is not null and (v_salary->>'min')::numeric>(v_salary->>'max')::numeric) then raise exception 'RF_INVALID_INPUT';end if;
 end if;
 if p_data->>'expiresAt' is not null and not isfinite((p_data->>'expiresAt')::timestamptz) then raise exception 'RF_INVALID_INPUT';end if;
 for r in select value from jsonb_array_elements(p_data->'requirements') loop
  if jsonb_typeof(r)<>'object' or not r ?& array['text','priority','skills'] or length(btrim(r->>'text')) not between 1 and 1000
  or r->>'priority' not in ('mandatory','preferred') or jsonb_typeof(r->'skills') is distinct from 'array' then raise exception 'RF_INVALID_INPUT';end if;
  if jsonb_array_length(r->'skills')>9 or exists(select 1 from jsonb_array_elements_text(r->'skills') s where not exists(select 1 from public.skills k where k.id=s and k.status='active'))
  or (select count(distinct s)<>count(*) from jsonb_array_elements_text(r->'skills') s) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'RF_INVALID_INPUT';
end $$;
create function public.catalog_write_version(p_job uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_requirement uuid;r jsonb;v_ordinal integer:=0;
begin
 perform public.catalog_validate_job(p_data);
 insert into public.job_versions(job_id,version,company_name,title,track,specialization,location,workplace,level,salary_min,salary_max,salary_currency,salary_interval,summary,responsibilities,conditions)
 values(p_job,p_version,btrim(p_data->>'company'),btrim(p_data->>'title'),p_data->>'track',p_data->>'specialization',p_data->>'location',p_data->>'workplace',p_data->>'level',
 (p_data->'salary'->>'min')::numeric,(p_data->'salary'->>'max')::numeric,p_data->'salary'->>'currency',p_data->'salary'->>'interval',btrim(p_data->>'summary'),array(select jsonb_array_elements_text(p_data->'responsibilities')),p_data->'conditions') returning id into v_id;
 for r in select value from jsonb_array_elements(p_data->'requirements') loop
  insert into public.job_requirements(job_version_id,ordinal,priority,text) values(v_id,v_ordinal,r->>'priority',btrim(r->>'text')) returning id into v_requirement;
  insert into public.job_skill_links(requirement_id,skill_id) select v_requirement,jsonb_array_elements_text(r->'skills');v_ordinal:=v_ordinal+1;
 end loop;
 return v_id;
end $$;
create function public.catalog_link_source(p_job uuid,p_source uuid,p_external text,p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_existing public.job_sources%rowtype;
begin
 if not exists(select 1 from public.jobs where id=p_job) then raise exception 'RF_NOT_FOUND';end if;
 if p_external is null or length(btrim(p_external)) not between 1 and 200 or not public.catalog_valid_link(p_source,p_url) then raise exception 'RF_INVALID_INPUT';end if;
 select * into v_existing from public.job_sources where source_id=p_source and external_id=p_external;
 if found then
  if v_existing.job_id<>p_job or v_existing.original_url<>p_url then raise exception 'RF_CONFLICT';end if;return;
 end if;
 insert into public.job_sources(job_id,source_id,external_id,original_url) values(p_job,p_source,p_external,p_url);
 perform public.catalog_touch(v_actor,'job.source.linked',p_job);
end $$;
create function public.catalog_create_job(p_data jsonb,p_source uuid,p_external text,p_url text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_company uuid;v_job uuid;
begin
 perform public.catalog_validate_job(p_data);
 insert into public.companies(name) values(btrim(p_data->>'company')) on conflict(lower(btrim(name))) do update set name=public.companies.name returning id into v_company;
 insert into public.jobs(canonical_key,company_id,expires_at) values(btrim(p_data->>'canonicalKey'),v_company,(p_data->>'expiresAt')::timestamptz) returning id into v_job;
 perform public.catalog_write_version(v_job,1,p_data);perform public.catalog_link_source(v_job,p_source,p_external,p_url);
 perform public.catalog_touch(v_actor,'job.drafted',v_job);return jsonb_build_object('id',v_job,'revision',1);
exception when unique_violation then raise exception 'RF_CONFLICT';
end $$;
create function public.catalog_revise_job(p_id uuid,p_expected bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_job public.jobs%rowtype;v_company uuid;
begin
 select * into v_job from public.jobs where id=p_id;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 if p_expected is null or p_expected<>v_job.revision then raise exception 'RF_CONFLICT';end if;
 if p_data->>'canonicalKey' is distinct from v_job.canonical_key then raise exception 'RF_INVALID_INPUT';end if;
 perform public.catalog_validate_job(p_data);
 insert into public.companies(name) values(btrim(p_data->>'company')) on conflict(lower(btrim(name))) do update set name=public.companies.name returning id into v_company;
 perform public.catalog_write_version(p_id,v_job.current_version+1,p_data);
 update public.jobs set company_id=v_company,current_version=current_version+1,revision=revision+1,expires_at=(p_data->>'expiresAt')::timestamptz,status=case when status='published' then 'review' else status end where id=p_id;
 perform public.catalog_touch(v_actor,'job.revised',p_id);return jsonb_build_object('id',p_id,'revision',v_job.revision+1);
end $$;
create function public.catalog_transition_job(p_id uuid,p_expected bigint,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_job public.jobs%rowtype;v_version uuid;
begin
 select * into v_job from public.jobs where id=p_id;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 if p_expected is null or p_expected<>v_job.revision then raise exception 'RF_CONFLICT';end if;
 if p_status is null or not ((v_job.status='draft' and p_status='review') or (v_job.status='review' and p_status in ('draft','published','rejected')) or (v_job.status='published' and p_status in ('review','expired')) or (v_job.status='expired' and p_status='review') or (v_job.status='rejected' and p_status='draft')) then raise exception 'RF_CONFLICT';end if;
 if p_status='published' then
  select id into v_version from public.job_versions where job_id=p_id and version=v_job.current_version;
  if (v_job.expires_at is not null and v_job.expires_at<=clock_timestamp()) or not exists(select 1 from public.job_sources l join public.sources s on s.id=l.source_id where l.job_id=p_id and l.freshness<>'closed' and s.status='active' and public.catalog_valid_link(s.id,l.original_url) and s.permitted_fields @> public.catalog_required_fields(v_version)) then raise exception 'RF_FORBIDDEN';end if;
 end if;
 update public.jobs set status=p_status,revision=revision+1,published_at=case when p_status='published' then clock_timestamp() else published_at end where id=p_id;
 perform public.catalog_touch(v_actor,'job.'||p_status,p_id);return jsonb_build_object('id',p_id,'revision',v_job.revision+1);
end $$;
create function public.catalog_source_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();
begin
 if p_status is null or p_status not in ('active','revoked') then raise exception 'RF_INVALID_INPUT';end if;
 update public.sources set status=p_status where id=p_id;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 if p_status='revoked' then
  update public.jobs j set status='review',revision=revision+1 where j.status='published' and exists(select 1 from public.job_sources l where l.job_id=j.id and l.source_id=p_id) and not exists(select 1 from public.job_sources l join public.sources s on s.id=l.source_id join public.job_versions v on v.job_id=j.id and v.version=j.current_version where l.job_id=j.id and l.freshness<>'closed' and s.status='active' and public.catalog_valid_link(s.id,l.original_url) and s.permitted_fields @> public.catalog_required_fields(v.id));
 end if;
 perform public.catalog_touch(v_actor,'source.'||p_status,p_id);
end $$;
create function public.catalog_observe_source(p_id uuid,p_event text) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_link public.job_sources%rowtype;
begin
 if p_event is null or p_event not in ('confirmed_active','confirmed_closed','network_failure') then raise exception 'RF_INVALID_INPUT';end if;
 select * into v_link from public.job_sources where id=p_id;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 update public.job_sources set freshness=case p_event when 'network_failure' then case when freshness='closed' then 'closed' else 'uncertain' end when 'confirmed_closed' then 'closed' else 'current' end,last_attempt_at=clock_timestamp(),last_seen_at=case when p_event='network_failure' then last_seen_at else clock_timestamp() end,last_validated_at=case when p_event='network_failure' then last_validated_at else clock_timestamp() end where id=p_id;
 if p_event='confirmed_closed' and not public.catalog_job_visible(v_link.job_id) then update public.jobs set status='expired',revision=revision+1 where id=v_link.job_id and status='published';end if;
 perform public.catalog_touch(v_actor,'source.observed.'||p_event,v_link.job_id);
end $$;

create function public.catalog_bookmark_json(p_user uuid,p_job uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('jobId',b.job_id,'versionId',b.job_version_id,'title',b.title_snapshot,'company',b.company_snapshot,'sourceUrl',b.source_url_snapshot,'savedAt',b.created_at,'available',public.catalog_job_visible(b.job_id)) from public.bookmarks b where b.user_id=p_user and b.job_id=p_job
$$;
create function public.catalog_save_bookmark(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_job jsonb;v_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();
 insert into public.bookmark_revisions(user_id) values(v_user) on conflict do nothing;
 if not exists(select 1 from public.bookmarks where user_id=v_user and job_id=p_job) then
  v_job:=public.catalog_job_json(p_job);if v_job is null then raise exception 'RF_NOT_FOUND';end if;
  insert into public.bookmarks(user_id,job_id,job_version_id,title_snapshot,company_snapshot,source_url_snapshot) values(v_user,p_job,(v_job->>'versionId')::uuid,v_job->>'title',v_job->>'company',v_job->'sources'->0->>'url');
  update public.bookmark_revisions set revision=revision+1 where user_id=v_user;
 end if;
 select revision into v_revision from public.bookmark_revisions where user_id=v_user;return jsonb_build_object('revision',v_revision);
end $$;
create function public.catalog_remove_bookmark(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();
 insert into public.bookmark_revisions(user_id) values(v_user) on conflict do nothing;
 delete from public.bookmarks where user_id=v_user and job_id=p_job;
 if found then update public.bookmark_revisions set revision=revision+1 where user_id=v_user;end if;
 select revision into v_revision from public.bookmark_revisions where user_id=v_user;return jsonb_build_object('revision',v_revision);
end $$;
create function public.catalog_list_bookmarks(p_after uuid default null,p_revision bigint default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_revision bigint;v_data jsonb;v_last uuid;v_more boolean;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce((select revision from public.bookmark_revisions where user_id=v_user),0) into v_revision;
 if p_after is not null and (p_revision is null or p_revision<>v_revision) then raise exception 'RF_CONFLICT';end if;
 with page as(select job_id from public.bookmarks where user_id=v_user and (p_after is null or job_id>p_after) order by job_id limit p_limit+1),shown as(select job_id from page order by job_id limit p_limit)
 select coalesce((select jsonb_agg(public.catalog_bookmark_json(v_user,job_id) order by job_id) from shown),'[]'::jsonb),(select job_id from shown order by job_id desc limit 1),(select count(*)>p_limit from page) into v_data,v_last,v_more;
 return jsonb_build_object('data',v_data,'lastId',case when v_more then v_last end,'revision',v_revision);
end $$;

-- Public readers use narrow RPC projections; source permission documents and drafts stay private.
do $$ declare t text;begin
 foreach t in array array['sources','job_specializations','companies','jobs','job_versions','job_sources','job_requirements','job_skill_links','catalog_state','catalog_audit','bookmark_revisions','bookmarks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.bookmarks,public.bookmark_revisions to authenticated;
create policy bookmark_owner on public.bookmarks for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
create policy bookmark_revision_owner on public.bookmark_revisions for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'catalog_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.catalog_search_jobs(jsonb,uuid,bigint,integer),public.catalog_find_job(uuid) to anon,authenticated;
grant execute on function public.catalog_source_create(jsonb),public.catalog_source_status(uuid,text),public.catalog_create_job(jsonb,uuid,text,text),public.catalog_revise_job(uuid,bigint,jsonb),public.catalog_link_source(uuid,uuid,text,text),public.catalog_transition_job(uuid,bigint,text),public.catalog_observe_source(uuid,text),public.catalog_save_bookmark(uuid),public.catalog_remove_bookmark(uuid),public.catalog_list_bookmarks(uuid,bigint,integer) to authenticated;
