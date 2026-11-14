-- Module 02: immutable evidence versions and optimistic owner aggregate revisions.
-- Module 04 extends this minimal canonical skill registry without changing IDs.
create table public.skills (
  id text primary key,
  name_en text not null,
  status text not null default 'active' check (status in ('active', 'deprecated'))
);
insert into public.skills(id,name_en) values
 ('python','Python'),('sql','SQL'),('prompting','Prompt design'),('rag','RAG & retrieval'),
 ('evaluation','AI evaluation'),('agents','Agent workflows'),('product','Product thinking'),
 ('automation','Automation'),('content','Content design');
create table public.career_preferences (
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 name text not null default '' check (length(name)<=100),
 track text not null default 'Engineering & data' check(track in ('Engineering & data','Product & strategy','Marketing & operations','Design & content')),
 workplaces text[] not null default '{}' check(workplaces <@ array['Remote','Hybrid','On-site']::text[]),
 weekly_hours integer not null default 5 check(weekly_hours between 0 and 80),
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz
);
create table public.evidence (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 source text not null check(source in ('self-report','portfolio-reference','scenario','resume-claim')),
 current_version integer not null default 1 check(current_version>0),
 created_at timestamptz not null default now(),
 unique(id,user_id)
);
create index evidence_owner_page on public.evidence(user_id,id);
create table public.evidence_versions (
 id uuid primary key default gen_random_uuid(),
 evidence_id uuid not null,
 user_id uuid not null,
 version integer not null check(version>0),
 label text not null check(length(label) between 1 and 160),
 context text not null check(length(context)<=2000),
 observed_at timestamptz not null,
 source_ref uuid,
 source_version text not null check(length(source_version) between 1 and 200),
 rubric_version text,
 outcome text check(length(outcome)<=2000),
 review_state text not null check(review_state in ('unreviewed','scored')),
 created_at timestamptz not null default now(),
 foreign key(evidence_id,user_id) references public.evidence(id,user_id) on delete cascade,
 unique(evidence_id,version), unique(user_id,source_ref,source_version)
);
create index evidence_versions_owner on public.evidence_versions(user_id,evidence_id,version);
create table public.evidence_skill_links (
 evidence_version_id uuid not null references public.evidence_versions(id) on delete cascade,
 skill_id text not null references public.skills(id),
 primary key(evidence_version_id,skill_id)
);
create table public.skill_claims (
 evidence_version_id uuid primary key references public.evidence_versions(id) on delete cascade,
 claimed_level integer not null check(claimed_level between 0 and 3)
);
create table public.portfolio_references (
 evidence_version_id uuid primary key references public.evidence_versions(id) on delete cascade,
 url text not null check(length(url)<=2048 and url ~ '^https://[^/@[:space:]]+(/|$)')
);
-- Durable invalidations contain references only, never evidence text, URLs or resume content.
create table public.profile_change_outbox (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 revision bigint not null,
 kind text not null check(kind in ('profile.changed','evidence.changed','evidence.deleted','demo.imported')),
 evidence_id uuid,
 deleted_version_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 unique(user_id,revision)
);

create function public.profile_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user(); v_result jsonb;
begin
 select jsonb_build_object('name',p.name,'track',p.track,'workplaces',to_jsonb(p.workplaces),'weeklyHours',p.weekly_hours,'revision',p.revision,'updatedAt',p.updated_at)
 into v_result from public.career_preferences p where p.user_id=v_user;
 return coalesce(v_result,jsonb_build_object('name','','track','Engineering & data','workplaces','[]'::jsonb,'weeklyHours',5,'revision',0,'updatedAt',null));
end $$;
create function public.profile_lock(p_expected bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user(); v_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 perform public.identity_require_user();
 insert into public.career_preferences(user_id) values(v_user) on conflict do nothing;
 select revision into v_revision from public.career_preferences where user_id=v_user;
 if p_expected is null or p_expected<>v_revision then raise exception 'RF_CONFLICT'; end if;
 return v_user;
end $$;
create function public.profile_bump(p_user uuid,p_kind text,p_evidence uuid default null,p_deleted uuid[] default '{}') returns bigint
language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
begin
 update public.career_preferences set revision=revision+1,updated_at=clock_timestamp() where user_id=p_user returning revision into v_revision;
 if v_revision is null then raise exception 'RF_NOT_FOUND'; end if;
 insert into public.profile_change_outbox(user_id,revision,kind,evidence_id,deleted_version_ids) values(p_user,v_revision,p_kind,p_evidence,p_deleted);
 return v_revision;
end $$;
create function public.profile_validate_preferences(p_data jsonb) returns void
language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['name','track','workplaces','weeklyHours']
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','track','workplaces','weeklyHours')) then raise exception 'RF_INVALID_INPUT'; end if;
 if jsonb_typeof(p_data->'name') is distinct from 'string' or length(p_data->>'name')>100
  or p_data->>'track' not in ('Engineering & data','Product & strategy','Marketing & operations','Design & content')
  or jsonb_typeof(p_data->'track') is distinct from 'string'
  or jsonb_typeof(p_data->'workplaces') is distinct from 'array'
  or jsonb_typeof(p_data->'weeklyHours') is distinct from 'number'
  or (p_data->>'weeklyHours') !~ '^[0-9]{1,2}$' then raise exception 'RF_INVALID_INPUT'; end if;
 if (p_data->>'weeklyHours')::integer>80 or jsonb_array_length(p_data->'workplaces')>3
  or exists(select 1 from jsonb_array_elements_text(p_data->'workplaces') w where w not in ('Remote','Hybrid','On-site'))
  or (select count(distinct w)<>count(*) from jsonb_array_elements_text(p_data->'workplaces') w) then raise exception 'RF_INVALID_INPUT'; end if;
end $$;
create function public.profile_update(p_expected bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.profile_lock(p_expected);
begin
 perform public.profile_validate_preferences(p_data);
 update public.career_preferences set name=btrim(p_data->>'name'),track=p_data->>'track',workplaces=array(select jsonb_array_elements_text(p_data->'workplaces')),weekly_hours=(p_data->>'weeklyHours')::integer where user_id=v_user;
 perform public.profile_bump(v_user,'profile.changed');
 return public.profile_read();
end $$;
create function public.profile_validate_evidence(p_data jsonb,p_internal boolean) returns void
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
  or exists(select 1 from jsonb_array_elements_text(p_data->'skills') s where not exists(select 1 from public.skills k where k.id=s and k.status='active')) then raise exception 'RF_INVALID_INPUT'; end if;
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
create function public.profile_evidence_json(p_version uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'versionId',v.id,'version',v.version,'source',e.source,'label',v.label,'context',v.context,
 'observedAt',v.observed_at,'createdAt',v.created_at,'sourceRef',v.source_ref,'sourceVersion',v.source_version,
 'rubricVersion',v.rubric_version,'outcome',v.outcome,'reviewState',v.review_state,'claimedLevel',c.claimed_level,'url',p.url,
 'skills',(select jsonb_agg(l.skill_id order by l.skill_id) from public.evidence_skill_links l where l.evidence_version_id=v.id))
 from public.evidence_versions v join public.evidence e on e.id=v.evidence_id
 left join public.skill_claims c on c.evidence_version_id=v.id left join public.portfolio_references p on p.evidence_version_id=v.id where v.id=p_version
$$;
create function public.profile_put_version(p_user uuid,p_id uuid,p_version integer,p_data jsonb,p_internal boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_source text:=p_data->>'source';
begin
 perform public.profile_validate_evidence(p_data,p_internal);
 insert into public.evidence_versions(evidence_id,user_id,version,label,context,observed_at,source_ref,source_version,rubric_version,outcome,review_state)
 values(p_id,p_user,p_version,btrim(p_data->>'label'),btrim(p_data->>'context'),(p_data->>'observedAt')::timestamptz,
 case when p_internal then (p_data->>'sourceRef')::uuid end,case when p_internal then p_data->>'sourceVersion' else 'member-v1' end,
 case when p_internal then p_data->>'rubricVersion' end,case when p_internal then p_data->>'outcome' end,
 case when v_source='scenario' then 'scored' else 'unreviewed' end) returning id into v_id;
 insert into public.evidence_skill_links(evidence_version_id,skill_id) select v_id,jsonb_array_elements_text(p_data->'skills');
 if v_source='self-report' then insert into public.skill_claims values(v_id,(p_data->>'claimedLevel')::integer); end if;
 if v_source='portfolio-reference' then insert into public.portfolio_references values(v_id,p_data->>'url'); end if;
 return public.profile_evidence_json(v_id);
end $$;
create function public.profile_create_evidence(p_expected bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.profile_lock(p_expected); v_id uuid; v_json jsonb; v_revision bigint;
begin
 perform public.profile_validate_evidence(p_data,false);
 if (select count(*) from public.evidence where user_id=v_user)>=500 then raise exception 'RF_CONFLICT'; end if;
 insert into public.evidence(user_id,source) values(v_user,p_data->>'source') returning id into v_id;
 v_json:=public.profile_put_version(v_user,v_id,1,p_data,false);
 v_revision:=public.profile_bump(v_user,'evidence.changed',v_id);
 return jsonb_build_object('evidence',v_json,'revision',v_revision);
end $$;
create function public.profile_edit_evidence(p_id uuid,p_expected bigint,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.profile_lock(p_expected); v_evidence public.evidence%rowtype; v_json jsonb; v_revision bigint;
begin
 select * into v_evidence from public.evidence where id=p_id and user_id=v_user;
 if not found then raise exception 'RF_NOT_FOUND'; end if;
 if v_evidence.source not in ('self-report','portfolio-reference') then raise exception 'RF_FORBIDDEN'; end if;
 if p_version is null or v_evidence.current_version<>p_version then raise exception 'RF_CONFLICT'; end if;
 if p_data->>'source' is distinct from v_evidence.source then raise exception 'RF_INVALID_INPUT'; end if;
 v_json:=public.profile_put_version(v_user,p_id,p_version+1,p_data,false);
 update public.evidence set current_version=current_version+1 where id=p_id;
 v_revision:=public.profile_bump(v_user,'evidence.changed',p_id);
 return jsonb_build_object('evidence',v_json,'revision',v_revision);
end $$;
create function public.profile_delete_evidence(p_id uuid,p_expected bigint,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.profile_lock(p_expected); v_evidence public.evidence%rowtype; v_deleted uuid[]; v_revision bigint;
begin
 select * into v_evidence from public.evidence where id=p_id and user_id=v_user;
 if not found then raise exception 'RF_NOT_FOUND'; end if;
 if p_version is null or v_evidence.current_version<>p_version then raise exception 'RF_CONFLICT'; end if;
 select array_agg(id) into v_deleted from public.evidence_versions where evidence_id=p_id;
 delete from public.evidence where id=p_id;
 v_revision:=public.profile_bump(v_user,'evidence.deleted',p_id,v_deleted);
 return jsonb_build_object('revision',v_revision);
end $$;
create function public.profile_evidence_history(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user(); v_result jsonb;
begin
 if not exists(select 1 from public.evidence where id=p_id and user_id=v_user) then raise exception 'RF_NOT_FOUND'; end if;
 select jsonb_agg(public.profile_evidence_json(id) order by version desc) into v_result from public.evidence_versions where evidence_id=p_id and user_id=v_user;
 return v_result;
end $$;
-- A cursor binds the result to the aggregate revision and filter, so edits require a restart.
create function public.profile_list_evidence(p_skill text default null,p_after uuid default null,p_revision bigint default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user(); v_current bigint; v_rows jsonb; v_last uuid; v_has_more boolean;
begin
 if p_limit is null or p_limit not between 1 and 50 or (p_skill is not null and not exists(select 1 from public.skills where id=p_skill)) then raise exception 'RF_INVALID_INPUT'; end if;
 select coalesce((select revision from public.career_preferences where user_id=v_user),0) into v_current;
 if p_after is not null and (p_revision is null or p_revision<>v_current) then raise exception 'RF_CONFLICT'; end if;
 with page as (select e.id,v.id as version_id from public.evidence e join public.evidence_versions v on v.evidence_id=e.id and v.version=e.current_version
 where e.user_id=v_user and (p_after is null or e.id>p_after) and (p_skill is null or exists(select 1 from public.evidence_skill_links l where l.evidence_version_id=v.id and l.skill_id=p_skill)) order by e.id limit p_limit+1),
 shown as (select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(public.profile_evidence_json(version_id) order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*)>p_limit from page) into v_rows,v_last,v_has_more;
 return jsonb_build_object('data',v_rows,'lastId',case when v_has_more then v_last end,'revision',v_current);
end $$;
create function public.profile_import_demo(p_expected bigint,p_preferences jsonb,p_skills jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.profile_lock(p_expected); v_skill text; v_id uuid;
begin
 -- Import only into a new profile; retries cannot overwrite existing account data.
 if p_expected<>0 then raise exception 'RF_CONFLICT'; end if;
 perform public.profile_validate_preferences(p_preferences);
 if jsonb_typeof(p_skills) is distinct from 'array' or jsonb_array_length(p_skills)>9 then raise exception 'RF_INVALID_INPUT'; end if;
 if (select count(distinct s)<>count(*) from jsonb_array_elements_text(p_skills) s) or exists(select 1 from jsonb_array_elements_text(p_skills) s where not exists(select 1 from public.skills where id=s and status='active')) then raise exception 'RF_INVALID_INPUT'; end if;
 update public.career_preferences set name=btrim(p_preferences->>'name'),track=p_preferences->>'track',workplaces=array(select jsonb_array_elements_text(p_preferences->'workplaces')),weekly_hours=(p_preferences->>'weeklyHours')::integer where user_id=v_user;
 for v_skill in select jsonb_array_elements_text(p_skills) loop
  insert into public.evidence(user_id,source) values(v_user,'self-report') returning id into v_id;
  perform public.profile_put_version(v_user,v_id,1,jsonb_build_object('source','self-report','label','Imported demo skill claim','context','Explicitly imported by the owner; not a verified ability.','observedAt',clock_timestamp(),'skills',jsonb_build_array(v_skill),'claimedLevel',1),false);
 end loop;
 perform public.profile_bump(v_user,'demo.imported');
 return public.profile_read();
end $$;
create function public.profile_record_internal_evidence(p_user uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version public.evidence_versions%rowtype; v_json jsonb; v_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 if p_user is null or not public.identity_is_active(p_user) then raise exception 'RF_FORBIDDEN'; end if;
 perform public.profile_validate_evidence(p_data,true);
 select * into v_version from public.evidence_versions where user_id=p_user and source_ref=(p_data->>'sourceRef')::uuid and source_version=p_data->>'sourceVersion';
 if found then
  v_json:=public.profile_evidence_json(v_version.id);
  if (v_json - array['id','versionId','version','createdAt','reviewState','claimedLevel','url']) is distinct from
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

-- The same owner policies apply to history and child records; administrators have no private read bypass.
alter table public.skills enable row level security;
revoke all on public.skills from anon,authenticated;
grant select on public.skills to anon,authenticated;
create policy skills_published on public.skills for select to anon,authenticated using(true);
do $$ declare t text; begin
 foreach t in array array['career_preferences','evidence','evidence_versions','evidence_skill_links','skill_claims','portfolio_references','profile_change_outbox'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.career_preferences,public.evidence,public.evidence_versions,public.evidence_skill_links,public.skill_claims,public.portfolio_references to authenticated;
create policy own_preferences on public.career_preferences for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
create policy own_evidence on public.evidence for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
create policy own_evidence_versions on public.evidence_versions for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
create policy own_evidence_links on public.evidence_skill_links for select to authenticated using(exists(select 1 from public.evidence_versions v where v.id=evidence_version_id and v.user_id=auth.uid() and public.identity_is_active(auth.uid())));
create policy own_claims on public.skill_claims for select to authenticated using(exists(select 1 from public.evidence_versions v where v.id=evidence_version_id and v.user_id=auth.uid() and public.identity_is_active(auth.uid())));
create policy own_portfolio on public.portfolio_references for select to authenticated using(exists(select 1 from public.evidence_versions v where v.id=evidence_version_id and v.user_id=auth.uid() and public.identity_is_active(auth.uid())));
-- Helpers and trusted writer are not public RPCs. Definer entry points recheck the verified JWT.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'profile_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant all on public.skills to service_role;
grant execute on function public.profile_read(),public.profile_update(bigint,jsonb),public.profile_create_evidence(bigint,jsonb),public.profile_edit_evidence(uuid,bigint,integer,jsonb),public.profile_delete_evidence(uuid,bigint,integer),public.profile_evidence_history(uuid),public.profile_list_evidence(text,uuid,bigint,integer),public.profile_import_demo(bigint,jsonb,jsonb) to authenticated;
