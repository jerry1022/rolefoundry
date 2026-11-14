-- Module 04: versioned public dictionary, explicit resolution and historical-safe merges.
alter table public.skills drop constraint skills_status_check;
alter table public.skills add column name_zh_tw text not null default '';
alter table public.skills add column description text not null default '';
alter table public.skills add column redirect_to text references public.skills(id);
alter table public.skills add constraint skills_status_check check(status in ('active','deprecated','merged'));
alter table public.skills add constraint skills_redirect_check check((status='merged' and redirect_to is not null and redirect_to<>id) or (status<>'merged' and redirect_to is null));
update public.skills set name_zh_tw=case id when 'python' then 'Python' when 'sql' then 'SQL' when 'prompting' then '提示設計' when 'rag' then 'RAG 與檢索' when 'evaluation' then 'AI 評估' when 'agents' then 'AI 代理工作流程' when 'product' then '產品思維' when 'automation' then '自動化' when 'content' then '內容設計' end;
create table public.dictionary_state(singleton boolean primary key default true check(singleton),version bigint not null);
insert into public.dictionary_state values(true,1);
create table public.skill_aliases(skill_id text not null references public.skills(id),locale text not null check(locale in ('en','zh-TW')),alias text not null,normalized_alias text not null,primary key(locale,normalized_alias));
create index skill_alias_target on public.skill_aliases(skill_id);
create table public.skill_relations(parent_id text not null references public.skills(id),child_id text not null references public.skills(id),relation text not null check(relation in ('broader-than','prerequisite')),primary key(parent_id,child_id,relation),check(parent_id<>child_id));
create table public.track_skills(track_id text not null check(track_id in ('Engineering & data','Product & strategy','Marketing & operations','Design & content')),skill_id text not null references public.skills(id),priority integer not null check(priority between 1 and 100),primary key(track_id,skill_id));
create table public.dictionary_versions(version bigint primary key,snapshot jsonb not null,created_at timestamptz not null default now());
create table public.dictionary_audit(id uuid primary key default gen_random_uuid(),version bigint not null references public.dictionary_versions(version),actor_id uuid references public.profiles(user_id) on delete set null,action text not null,from_id text,to_id text,reason text not null,created_at timestamptz not null default now());
create table public.dictionary_change_outbox(version bigint primary key references public.dictionary_versions(version),action text not null,from_id text,to_id text,created_at timestamptz not null default now());
create function public.dictionary_normalize(p_text text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(lower(normalize(p_text,NFKC)),'[‐‑‒–—―]','-','g'),'[[:space:]]+',' ','g'))
$$;
insert into public.skill_aliases(skill_id,locale,alias,normalized_alias) select id,'en',name_en,public.dictionary_normalize(name_en) from public.skills;
insert into public.skill_aliases(skill_id,locale,alias,normalized_alias) select id,'zh-TW',name_zh_tw,public.dictionary_normalize(name_zh_tw) from public.skills;
insert into public.skill_aliases values
 ('prompting','en','Prompt engineering','prompt engineering'),('prompting','zh-TW','提示工程','提示工程'),
 ('rag','en','Retrieval-augmented generation','retrieval-augmented generation'),('rag','zh-TW','檢索增強生成','檢索增強生成'),
 ('agents','en','AI agents','ai agents'),('evaluation','en','LLM evaluation','llm evaluation');
create function public.dictionary_current_version() returns bigint language sql stable security definer set search_path='' as $$select version from public.dictionary_state where singleton$$;
create function public.dictionary_resolve_id(p_id text) returns text language plpgsql stable security definer set search_path='' as $$
declare v_id text:=p_id;v_row public.skills%rowtype;v_seen text[]:='{}';
begin loop
 select * into v_row from public.skills where id=v_id;if not found then return null;end if;
 if v_id=any(v_seen) then raise exception 'RF_CONFLICT';end if;v_seen:=array_append(v_seen,v_id);
 if v_row.status='merged' then v_id:=v_row.redirect_to;elsif v_row.status='active' then return v_id;else return null;end if;
 end loop;end $$;
create function public.dictionary_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('skills',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nameEn',name_en,'nameZhTw',name_zh_tw,'description',description,'status',status,'redirectTo',redirect_to) order by id) from public.skills),'[]'::jsonb),
 'aliases',coalesce((select jsonb_agg(jsonb_build_object('skillId',skill_id,'locale',locale,'alias',alias,'normalizedAlias',normalized_alias) order by locale,normalized_alias) from public.skill_aliases),'[]'::jsonb),
 'relations',coalesce((select jsonb_agg(jsonb_build_object('parentId',parent_id,'childId',child_id,'relation',relation) order by relation,parent_id,child_id) from public.skill_relations),'[]'::jsonb),
 'trackSkills',coalesce((select jsonb_agg(jsonb_build_object('track',track_id,'skillId',skill_id,'priority',priority) order by track_id,priority,skill_id) from public.track_skills),'[]'::jsonb))
$$;
insert into public.dictionary_versions(version,snapshot) values(1,public.dictionary_snapshot());
create function public.dictionary_get(p_version bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_version bigint:=coalesce(p_version,public.dictionary_current_version());v_row public.dictionary_versions%rowtype;
begin select * into v_row from public.dictionary_versions where version=v_version;if not found then raise exception 'RF_NOT_FOUND';end if;
 return v_row.snapshot||jsonb_build_object('version',v_version,'createdAt',v_row.created_at);end $$;
create function public.dictionary_resolve(p_term text,p_locale text default null,p_version bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb:=public.dictionary_get(p_version);v_term text:=public.dictionary_normalize(p_term);v_version bigint:=(v_snapshot->>'version')::bigint;v_ids text[];v_direct text;v_id text;v_seen text[]:='{}';v_row jsonb;
begin
 if p_term is null or length(p_term) not between 1 and 200 or v_term='' or (p_locale is not null and p_locale not in ('en','zh-TW')) then raise exception 'RF_INVALID_INPUT';end if;
 select s->>'id' into v_direct from jsonb_array_elements(v_snapshot->'skills') s where s->>'id'=v_term;
 if v_direct is not null then
  v_id:=v_direct;loop
   if v_id=any(v_seen) then raise exception 'RF_CONFLICT';end if;v_seen:=array_append(v_seen,v_id);
   select s into v_row from jsonb_array_elements(v_snapshot->'skills') s where s->>'id'=v_id;
   if v_row->>'status'='merged' then v_id:=v_row->>'redirectTo';else exit;end if;
  end loop;
  if v_row->>'status'='active' then v_ids:=array[v_id];else v_ids:='{}';end if;
 else
  select array_agg(distinct a->>'skillId' order by a->>'skillId') into v_ids from jsonb_array_elements(v_snapshot->'aliases') a
  where a->>'normalizedAlias'=v_term and (p_locale is null or a->>'locale'=p_locale)
  and exists(select 1 from jsonb_array_elements(v_snapshot->'skills') s where s->>'id'=a->>'skillId' and s->>'status'='active');
 end if;
 v_ids:=coalesce(v_ids,'{}');
 return jsonb_build_object('version',v_version,'normalizedTerm',v_term,'status',case cardinality(v_ids) when 0 then 'unresolved' when 1 then 'resolved' else 'ambiguous' end,'skillId',case when cardinality(v_ids)=1 then v_ids[1] end,'candidates',to_jsonb(v_ids),'redirectedFrom',case when v_direct is not null and cardinality(v_ids)=1 and v_direct<>v_ids[1] then v_direct end);
end $$;
create function public.dictionary_lock(p_expected bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.identity_require_admin();
begin
 perform pg_advisory_xact_lock(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock(hashtextextended('dictionary:write',0));
 perform public.identity_require_admin();
 if p_expected is null or p_expected<>public.dictionary_current_version() then raise exception 'RF_CONFLICT';end if;return v_actor;
end $$;
create function public.dictionary_commit(p_actor uuid,p_action text,p_from text,p_to text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_version bigint;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT';end if;
 update public.dictionary_state set version=version+1 where singleton returning version into v_version;
 insert into public.dictionary_versions(version,snapshot) values(v_version,public.dictionary_snapshot());
 insert into public.dictionary_audit(version,actor_id,action,from_id,to_id,reason) values(v_version,p_actor,p_action,p_from,p_to,btrim(p_reason));
 insert into public.dictionary_change_outbox(version,action,from_id,to_id) values(v_version,p_action,p_from,p_to);
 perform public.catalog_touch(p_actor,'dictionary.'||p_action,null);
 return jsonb_build_object('version',v_version);
end $$;
create function public.dictionary_label_aliases(p_skill text) returns void language plpgsql security definer set search_path='' as $$
declare v_skill public.skills%rowtype;v_locale text;v_alias text;v_normal text;
begin
 select * into v_skill from public.skills where id=p_skill;
 foreach v_locale in array array['en','zh-TW'] loop
  v_alias:=case v_locale when 'en' then v_skill.name_en else v_skill.name_zh_tw end;v_normal:=public.dictionary_normalize(v_alias);
  if exists(select 1 from public.skills where id=v_normal and id<>p_skill and public.dictionary_resolve_id(id) is distinct from p_skill)
   or exists(select 1 from public.skill_aliases where locale=v_locale and normalized_alias=v_normal and skill_id<>p_skill) then raise exception 'RF_CONFLICT';end if;
  insert into public.skill_aliases values(p_skill,v_locale,v_alias,v_normal) on conflict(locale,normalized_alias) do nothing;
 end loop;
end $$;
create function public.dictionary_create_skill(p_expected bigint,p_data jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);v_id text:=p_data->>'id';
begin
 if v_id is null or v_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or length(btrim(p_data->>'nameEn')) not between 1 and 160 or length(btrim(p_data->>'nameZhTw')) not between 1 and 160 or p_data->>'description' is null or length(p_data->>'description')>2000 then raise exception 'RF_INVALID_INPUT';end if;
 if (select count(*) from public.skills)>=1000 then raise exception 'RF_CONFLICT';end if;
 insert into public.skills(id,name_en,name_zh_tw,description) values(v_id,btrim(p_data->>'nameEn'),btrim(p_data->>'nameZhTw'),p_data->>'description');
 perform public.dictionary_label_aliases(v_id);
 return public.dictionary_commit(v_actor,'skill.created',v_id,null,p_reason);
exception when unique_violation then raise exception 'RF_CONFLICT';end $$;
create function public.dictionary_update_skill(p_id text,p_expected bigint,p_data jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);v_skill public.skills%rowtype;
begin
 select * into v_skill from public.skills where id=p_id;if not found then raise exception 'RF_NOT_FOUND';end if;
 if v_skill.status='merged' then raise exception 'RF_CONFLICT';end if;
 if length(btrim(p_data->>'nameEn')) not between 1 and 160 or length(btrim(p_data->>'nameZhTw')) not between 1 and 160 or p_data->>'description' is null or length(p_data->>'description')>2000 or p_data->>'status' is null or p_data->>'status' not in ('active','deprecated') then raise exception 'RF_INVALID_INPUT';end if;
 update public.skills set name_en=btrim(p_data->>'nameEn'),name_zh_tw=btrim(p_data->>'nameZhTw'),description=p_data->>'description',status=p_data->>'status' where id=p_id;
 perform public.dictionary_label_aliases(p_id);
 return public.dictionary_commit(v_actor,'skill.updated',p_id,null,p_reason);
end $$;
create function public.dictionary_add_alias(p_expected bigint,p_skill text,p_locale text,p_alias text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);v_normal text:=public.dictionary_normalize(p_alias);v_skill text:=public.dictionary_resolve_id(p_skill);
begin
 if v_skill is null or v_skill<>p_skill or p_alias is null or length(p_alias) not between 1 and 200 or v_normal='' or p_locale is null or p_locale not in ('en','zh-TW') then raise exception 'RF_INVALID_INPUT';end if;
 if exists(select 1 from public.skills where id=v_normal and public.dictionary_resolve_id(id) is distinct from v_skill) then raise exception 'RF_CONFLICT';end if;
 insert into public.skill_aliases(skill_id,locale,alias,normalized_alias) values(v_skill,p_locale,btrim(p_alias),v_normal);
 return public.dictionary_commit(v_actor,'alias.created',v_skill,null,p_reason);
exception when unique_violation then raise exception 'RF_CONFLICT';end $$;
create function public.dictionary_has_cycle() returns boolean language sql stable security definer set search_path='' as $$
 with recursive paths(origin,target,relation) as(select parent_id,child_id,relation from public.skill_relations union select p.origin,r.child_id,p.relation from paths p join public.skill_relations r on r.parent_id=p.target and r.relation=p.relation)
 select exists(select 1 from paths where origin=target)
$$;
create function public.dictionary_add_relation(p_expected bigint,p_parent text,p_child text,p_relation text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);
begin
 if p_parent is null or p_child is null or p_parent=p_child or p_relation is null or p_relation not in ('broader-than','prerequisite') or public.dictionary_resolve_id(p_parent) is distinct from p_parent or public.dictionary_resolve_id(p_child) is distinct from p_child then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.skill_relations values(p_parent,p_child,p_relation);if public.dictionary_has_cycle() then raise exception 'RF_CONFLICT';end if;
 return public.dictionary_commit(v_actor,'relation.created',p_parent,p_child,p_reason);
exception when unique_violation then raise exception 'RF_CONFLICT';end $$;
create function public.dictionary_set_track(p_expected bigint,p_track text,p_skill text,p_priority integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);
begin
 if p_track is null or p_track not in ('Engineering & data','Product & strategy','Marketing & operations','Design & content') or p_priority is null or p_priority not between 1 and 100 or public.dictionary_resolve_id(p_skill) is distinct from p_skill then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.track_skills values(p_track,p_skill,p_priority) on conflict(track_id,skill_id) do update set priority=excluded.priority;
 return public.dictionary_commit(v_actor,'track.updated',p_skill,null,p_reason);
end $$;
-- Canonical joins are derived projections; original immutable skill IDs remain intact.
alter table public.evidence_versions add column dictionary_version bigint not null default public.dictionary_current_version() references public.dictionary_versions(version);
alter table public.job_versions add column dictionary_version bigint not null default public.dictionary_current_version() references public.dictionary_versions(version);
alter table public.evidence_skill_links add column canonical_skill_id text references public.skills(id);
alter table public.job_skill_links add column canonical_skill_id text references public.skills(id);
update public.evidence_skill_links set canonical_skill_id=skill_id;
update public.job_skill_links set canonical_skill_id=skill_id;
alter table public.evidence_skill_links alter column canonical_skill_id set not null;
alter table public.job_skill_links alter column canonical_skill_id set not null;
create index evidence_canonical_skill on public.evidence_skill_links(canonical_skill_id,evidence_version_id);
create index job_canonical_skill on public.job_skill_links(canonical_skill_id,requirement_id);
create function public.dictionary_project_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 new.canonical_skill_id:=public.dictionary_resolve_id(new.skill_id);if new.canonical_skill_id is null then raise exception 'RF_INVALID_INPUT';end if;return new;
end $$;
create trigger evidence_skill_projection before insert on public.evidence_skill_links for each row execute function public.dictionary_project_link();
create trigger job_skill_projection before insert on public.job_skill_links for each row execute function public.dictionary_project_link();
-- New domain adapters register their derived join columns without changing merge logic.
create table public.dictionary_link_targets(schema_name name not null,table_name name not null,canonical_column name not null,primary key(schema_name,table_name,canonical_column));
insert into public.dictionary_link_targets values('public','evidence_skill_links','canonical_skill_id'),('public','job_skill_links','canonical_skill_id');
create function public.dictionary_merge_skill(p_expected bigint,p_from text,p_to text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);v_target record;
begin
 if p_from is null or p_to is null or p_from=p_to or public.dictionary_resolve_id(p_from) is distinct from p_from or public.dictionary_resolve_id(p_to) is distinct from p_to then raise exception 'RF_INVALID_INPUT';end if;
 update public.skills set status='merged',redirect_to=p_to where id=p_from;
 update public.skill_aliases set skill_id=p_to where skill_id=p_from;
 insert into public.track_skills(track_id,skill_id,priority) select track_id,p_to,priority from public.track_skills where skill_id=p_from on conflict(track_id,skill_id) do update set priority=least(public.track_skills.priority,excluded.priority);
 delete from public.track_skills where skill_id=p_from;
 insert into public.skill_relations(parent_id,child_id,relation) select case when parent_id=p_from then p_to else parent_id end,case when child_id=p_from then p_to else child_id end,relation from public.skill_relations where (parent_id=p_from or child_id=p_from) and (case when parent_id=p_from then p_to else parent_id end)<>(case when child_id=p_from then p_to else child_id end) on conflict do nothing;
 delete from public.skill_relations where parent_id=p_from or child_id=p_from;
 if public.dictionary_has_cycle() then raise exception 'RF_CONFLICT';end if;
 for v_target in select * from public.dictionary_link_targets order by schema_name,table_name,canonical_column loop
  execute format('update %I.%I set %I=$1 where %I=$2',v_target.schema_name,v_target.table_name,v_target.canonical_column,v_target.canonical_column) using p_to,p_from;
 end loop;
 return public.dictionary_commit(v_actor,'skill.merged',p_from,p_to,p_reason);
end $$;
create function public.dictionary_labels_at(p_ids text[],p_version bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(s->>'id',s->>'nameEn'),'{}'::jsonb) from public.dictionary_versions v cross join lateral jsonb_array_elements(v.snapshot->'skills') s where v.version=p_version and s->>'id'=any(p_ids)
$$;
create function public.dictionary_search_terms(p_id text) returns text language sql stable security definer set search_path='' as $$
 select coalesce(string_agg(a.alias||' '||a.normalized_alias,' '),'')||' '||coalesce(max(s.name_en),'')||' '||coalesce(max(s.name_zh_tw),'') from public.skills s left join public.skill_aliases a on a.skill_id=s.id where s.id=public.dictionary_resolve_id(p_id)
$$;

-- Upgrade existing producers/readers without changing source versions.
create or replace function public.profile_validate_evidence(p_data jsonb,p_internal boolean) returns void
language plpgsql set search_path='' as $$
declare v_source text:=p_data->>'source'; v_time timestamptz;
begin
 if p_internal is null or jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['source','label','context','observedAt','skills'] then raise exception 'RF_INVALID_INPUT'; end if;
 if (not p_internal and v_source not in ('self-report','portfolio-reference')) or (p_internal and v_source not in ('scenario','resume-claim')) or v_source is null then raise exception 'RF_FORBIDDEN'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where not (k=any(array['source','label','context','observedAt','skills'] || case v_source when 'self-report' then array['claimedLevel'] when 'portfolio-reference' then array['url'] else array['sourceRef','sourceVersion','rubricVersion','outcome'] end))) then raise exception 'RF_INVALID_INPUT'; end if;
 if jsonb_typeof(p_data->'label') is distinct from 'string' or length(btrim(p_data->>'label')) not between 1 and 160
  or jsonb_typeof(p_data->'context') is distinct from 'string' or length(p_data->>'context')>2000
  or jsonb_typeof(p_data->'observedAt') is distinct from 'string'
  or jsonb_typeof(p_data->'skills') is distinct from 'array' then raise exception 'RF_INVALID_INPUT'; end if;
 begin v_time:=(p_data->>'observedAt')::timestamptz; exception when others then raise exception 'RF_INVALID_INPUT'; end;
 if not isfinite(v_time) or v_time>clock_timestamp()+interval '5 minutes' or v_time<'1900-01-01'::timestamptz then raise exception 'RF_INVALID_INPUT'; end if;
 if jsonb_array_length(p_data->'skills') not between 1 and 9
  or (select count(distinct s)<>count(*) from jsonb_array_elements_text(p_data->'skills') s)
  or exists(select 1 from jsonb_array_elements_text(p_data->'skills') s where not exists(select 1 from public.skills k where k.id=public.dictionary_resolve_id(s) and k.status='active')) then raise exception 'RF_INVALID_INPUT'; end if;
 if v_source='self-report' and (jsonb_typeof(p_data->'claimedLevel') is distinct from 'number' or (p_data->>'claimedLevel') !~ '^[0-3]$') then raise exception 'RF_INVALID_INPUT'; end if;
 if v_source='portfolio-reference' and (jsonb_typeof(p_data->'url') is distinct from 'string' or length(p_data->>'url')>2048 or p_data->>'url' !~ '^https://[^/@[:space:]]+(/|$)') then raise exception 'RF_INVALID_INPUT'; end if;
 if p_internal then
  if not p_data ?& array['sourceRef','sourceVersion','rubricVersion','outcome']
   or (p_data->>'sourceRef') !~ '^[0-9a-fA-F-]{36}$' or jsonb_typeof(p_data->'sourceRef') is distinct from 'string'
   or jsonb_typeof(p_data->'sourceVersion') is distinct from 'string' or length(btrim(p_data->>'sourceVersion')) not between 1 and 200
   or jsonb_typeof(p_data->'outcome') is distinct from 'string' or length(p_data->>'outcome')>2000
   or (v_source='scenario' and (jsonb_typeof(p_data->'rubricVersion') is distinct from 'string' or length(btrim(p_data->>'rubricVersion')) not between 1 and 200)) then raise exception 'RF_INVALID_INPUT'; end if;
 end if;
end $$;
create or replace function public.catalog_validate_job(p_data jsonb) returns void
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
  if jsonb_array_length(r->'skills')>9 or exists(select 1 from jsonb_array_elements_text(r->'skills') s where not exists(select 1 from public.skills k where k.id=public.dictionary_resolve_id(s) and k.status='active'))
  or (select count(distinct s)<>count(*) from jsonb_array_elements_text(r->'skills') s) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'RF_INVALID_INPUT';
end $$;
create or replace function public.profile_evidence_json(p_version uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'versionId',v.id,'version',v.version,'source',e.source,'label',v.label,'context',v.context,
 'observedAt',v.observed_at,'createdAt',v.created_at,'sourceRef',v.source_ref,'sourceVersion',v.source_version,
 'rubricVersion',v.rubric_version,'outcome',v.outcome,'reviewState',v.review_state,'claimedLevel',c.claimed_level,'url',p.url,
 'dictionaryVersion',v.dictionary_version,'canonicalSkills',(select jsonb_agg(distinct l.canonical_skill_id order by l.canonical_skill_id) from public.evidence_skill_links l where l.evidence_version_id=v.id),'skillLabels',public.dictionary_labels_at(array(select l.skill_id from public.evidence_skill_links l where l.evidence_version_id=v.id),v.dictionary_version),'skills',(select jsonb_agg(l.skill_id order by l.skill_id) from public.evidence_skill_links l where l.evidence_version_id=v.id))
 from public.evidence_versions v join public.evidence e on e.id=v.evidence_id
 left join public.skill_claims c on c.evidence_version_id=v.id left join public.portfolio_references p on p.evidence_version_id=v.id where v.id=p_version
$$;
create or replace function public.catalog_job_json(p_job uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'versionId',v.id,'version',v.version,'revision',j.revision,'publishedAt',j.published_at,'expiresAt',j.expires_at,
 'dictionaryVersion',public.dictionary_current_version(),'sourceDictionaryVersion',v.dictionary_version,'company',v.company_name,'title',v.title,'track',v.track,'specialization',v.specialization,'location',v.location,'workplace',v.workplace,'level',v.level,
 'salary',case when v.salary_min is null and v.salary_max is null then null else jsonb_build_object('min',v.salary_min,'max',v.salary_max,'currency',v.salary_currency,'interval',v.salary_interval) end,
 'summary',v.summary,'responsibilities',to_jsonb(v.responsibilities),'conditions',v.conditions,
 'requirements',(select jsonb_agg(jsonb_build_object('text',r.text,'priority',r.priority,'skills',coalesce((select jsonb_agg(distinct l.canonical_skill_id order by l.canonical_skill_id) from public.job_skill_links l where l.requirement_id=r.id),'[]'::jsonb),'sourceSkills',coalesce((select jsonb_agg(l.skill_id order by l.skill_id) from public.job_skill_links l where l.requirement_id=r.id),'[]'::jsonb),'skillLabels',public.dictionary_labels_at(array(select l.canonical_skill_id from public.job_skill_links l where l.requirement_id=r.id),public.dictionary_current_version())) order by r.ordinal) from public.job_requirements r where r.job_version_id=v.id),
 'sources',(select jsonb_agg(jsonb_build_object('id',l.id,'name',s.name,'publisher',s.publisher,'url',l.original_url,'rightsSummary',s.rights_summary,'isDemo',s.is_demo,'freshness',l.freshness,'firstSeenAt',l.first_seen_at,'lastSeenAt',l.last_seen_at,'lastValidatedAt',l.last_validated_at) order by l.id)
 from public.job_sources l join public.sources s on s.id=l.source_id where l.job_id=j.id and l.freshness<>'closed' and s.status='active' and public.catalog_valid_link(s.id,l.original_url) and s.permitted_fields @> public.catalog_required_fields(v.id)))
 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version where j.id=p_job and public.catalog_job_visible(j.id)
$$;
create or replace function public.catalog_search_jobs(p_filters jsonb,p_after uuid default null,p_revision bigint default null,p_limit integer default 20) returns jsonb
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
 and not exists(select 1 from regexp_split_to_table(lower(btrim(coalesce(p_filters->>'q',''))),'\s+') term where term<>'' and position(term in lower(v.title||' '||v.company_name||' '||coalesce(v.location,'')||' '||v.summary||' '||sp.title||' '||array_to_string(sp.aliases,' ')||' '||array_to_string(v.responsibilities,' ')||' '||coalesce((select string_agg(r.text||' '||coalesce((select string_agg(k.id||' '||public.dictionary_search_terms(k.id),' ') from public.job_skill_links l join public.skills k on k.id=l.canonical_skill_id where l.requirement_id=r.id),''),' ') from public.job_requirements r where r.job_version_id=v.id),'')))=0)
 ),filtered as (select * from candidates c where (not p_filters?'specialization' or c.specialization=p_filters->>'specialization')),
 page as (select * from filtered where p_after is null or id>p_after order by id limit p_limit+1),shown as(select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(public.catalog_job_json(id) order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*)>p_limit from page),
 coalesce((select jsonb_object_agg(specialization,n) from(select specialization,count(*) n from candidates group by specialization)c),'{}'::jsonb)
 into v_data,v_last,v_more,v_counts;
 return jsonb_build_object('data',v_data,'lastId',case when v_more then v_last end,'revision',v_revision,'counts',v_counts);
end $$;
drop function public.profile_list_evidence(text,uuid,bigint,integer);
create or replace function public.profile_list_evidence(p_skill text default null,p_after uuid default null,p_revision bigint default null,p_limit integer default 20,p_dictionary_version bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_dictionary bigint:=public.dictionary_current_version();v_user uuid:=public.identity_require_user(); v_current bigint; v_rows jsonb; v_last uuid; v_has_more boolean;
begin
 if p_limit is null or p_limit not between 1 and 50 or (p_skill is not null and not exists(select 1 from public.skills where id=p_skill)) then raise exception 'RF_INVALID_INPUT'; end if;
 select coalesce((select revision from public.career_preferences where user_id=v_user),0) into v_current;
 if p_after is not null and (p_revision is null or p_revision<>v_current or p_dictionary_version is null or p_dictionary_version<>v_dictionary) then raise exception 'RF_CONFLICT'; end if;
 with page as (select e.id,v.id as version_id from public.evidence e join public.evidence_versions v on v.evidence_id=e.id and v.version=e.current_version
 where e.user_id=v_user and (p_after is null or e.id>p_after) and (p_skill is null or exists(select 1 from public.evidence_skill_links l where l.evidence_version_id=v.id and l.canonical_skill_id=public.dictionary_resolve_id(p_skill))) order by e.id limit p_limit+1),
 shown as (select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(public.profile_evidence_json(version_id) order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*)>p_limit from page) into v_rows,v_last,v_has_more;
 return jsonb_build_object('data',v_rows,'lastId',case when v_has_more then v_last end,'revision',v_current,'dictionaryVersion',v_dictionary);
end $$;
create function public.dictionary_remove_alias(p_expected bigint,p_locale text,p_alias text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);v_skill text;
begin delete from public.skill_aliases where locale=p_locale and normalized_alias=public.dictionary_normalize(p_alias) returning skill_id into v_skill;if not found then raise exception 'RF_NOT_FOUND';end if;return public.dictionary_commit(v_actor,'alias.removed',v_skill,null,p_reason);end $$;
create function public.dictionary_remove_relation(p_expected bigint,p_parent text,p_child text,p_relation text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);
begin delete from public.skill_relations where parent_id=p_parent and child_id=p_child and relation=p_relation;if not found then raise exception 'RF_NOT_FOUND';end if;return public.dictionary_commit(v_actor,'relation.removed',p_parent,p_child,p_reason);end $$;
create function public.dictionary_remove_track(p_expected bigint,p_track text,p_skill text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.dictionary_lock(p_expected);
begin delete from public.track_skills where track_id=p_track and skill_id=p_skill;if not found then raise exception 'RF_NOT_FOUND';end if;return public.dictionary_commit(v_actor,'track.removed',p_skill,null,p_reason);end $$;
create or replace function public.profile_record_internal_evidence(p_user uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version public.evidence_versions%rowtype; v_json jsonb; v_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 if p_user is null or not public.identity_is_active(p_user) then raise exception 'RF_FORBIDDEN'; end if;
 perform public.profile_validate_evidence(p_data,true);
 select * into v_version from public.evidence_versions where user_id=p_user and source_ref=(p_data->>'sourceRef')::uuid and source_version=p_data->>'sourceVersion';
 if found then
  v_json:=public.profile_evidence_json(v_version.id);
  if (v_json - array['id','versionId','version','createdAt','reviewState','claimedLevel','url','dictionaryVersion','canonicalSkills','skillLabels']) is distinct from
   (p_data || jsonb_build_object('observedAt',to_jsonb((p_data->>'observedAt')::timestamptz),'skills',(select jsonb_agg(s order by s) from jsonb_array_elements_text(p_data->'skills') s))) then raise exception 'RF_CONFLICT'; end if;
  select revision into v_revision from public.career_preferences where user_id=p_user;
  return jsonb_build_object('evidence',v_json,'revision',v_revision);
 end if;
 insert into public.career_preferences(user_id) values(p_user) on conflict do nothing;
 insert into public.evidence(user_id,source) values(p_user,p_data->>'source') returning id into v_id;
 v_json:=public.profile_put_version(p_user,v_id,1,p_data,true);
 v_revision:=public.profile_bump(p_user,'evidence.changed',v_id);
 return jsonb_build_object('evidence',v_json,'revision',v_revision);
end $$;
create or replace function public.profile_import_demo(p_expected bigint,p_preferences jsonb,p_skills jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.profile_lock(p_expected); v_skill text; v_id uuid;
begin
 -- Import only into a new profile; retries cannot overwrite existing account data.
 if p_expected<>0 then raise exception 'RF_CONFLICT'; end if;
 perform public.profile_validate_preferences(p_preferences);
 if jsonb_typeof(p_skills) is distinct from 'array' or jsonb_array_length(p_skills)>9 then raise exception 'RF_INVALID_INPUT'; end if;
 if (select count(distinct s)<>count(*) from jsonb_array_elements_text(p_skills) s) or exists(select 1 from jsonb_array_elements_text(p_skills) s where not exists(select 1 from public.skills where id=public.dictionary_resolve_id(s) and status='active')) then raise exception 'RF_INVALID_INPUT'; end if;
 update public.career_preferences set name=btrim(p_preferences->>'name'),track=p_preferences->>'track',workplaces=array(select jsonb_array_elements_text(p_preferences->'workplaces')),weekly_hours=(p_preferences->>'weeklyHours')::integer where user_id=v_user;
 for v_skill in select jsonb_array_elements_text(p_skills) loop
  insert into public.evidence(user_id,source) values(v_user,'self-report') returning id into v_id;
  perform public.profile_put_version(v_user,v_id,1,jsonb_build_object('source','self-report','label','Imported demo skill claim','context','Explicitly imported by the owner; not a verified ability.','observedAt',clock_timestamp(),'skills',jsonb_build_array(v_skill),'claimedLevel',1),false);
 end loop;
 perform public.profile_bump(v_user,'demo.imported');
 return public.profile_read();
end $$;
-- Data is public through versioned projections; audit and dispatch records stay server-only.
do $$ declare t text;begin
 foreach t in array array['dictionary_link_targets','dictionary_state','skill_aliases','skill_relations','track_skills','dictionary_versions','dictionary_audit','dictionary_change_outbox'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dictionary_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.dictionary_get(bigint),public.dictionary_resolve(text,text,bigint) to anon,authenticated;
grant execute on function public.dictionary_create_skill(bigint,jsonb,text),public.dictionary_update_skill(text,bigint,jsonb,text),public.dictionary_add_alias(bigint,text,text,text,text),public.dictionary_add_relation(bigint,text,text,text,text),public.dictionary_set_track(bigint,text,text,integer,text),public.dictionary_merge_skill(bigint,text,text,text),public.dictionary_remove_alias(bigint,text,text,text),public.dictionary_remove_relation(bigint,text,text,text,text),public.dictionary_remove_track(bigint,text,text,text),public.profile_list_evidence(text,uuid,bigint,integer,bigint) to authenticated;

revoke all on function public.profile_list_evidence(text,uuid,bigint,integer,bigint) from public,anon;
grant execute on function public.profile_list_evidence(text,uuid,bigint,integer,bigint) to service_role;
