-- Module 06: immutable private matching inputs, derived reports and deletion-safe links.
create table public.match_runs (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 task_id uuid unique references public.tasks(id) on delete set null,
 target_job_id uuid references public.jobs(id),
 idempotency_key text not null, request_hash text not null,
 input_hash text not null, input_snapshot jsonb,
 profile_revision bigint not null, catalog_revision bigint not null, dictionary_version bigint not null,
 status text not null default 'queued' check(status in ('queued','succeeded','invalidated')),
 created_at timestamptz not null default now(), finished_at timestamptz, invalidated_at timestamptz,
 unique(user_id,idempotency_key), check(status='invalidated' or input_snapshot is not null)
);
create index match_runs_owner on public.match_runs(user_id,sequence desc);
create table public.match_run_evidence (
 run_id uuid not null references public.match_runs(id) on delete cascade,
 evidence_version_id uuid not null references public.evidence_versions(id) on delete cascade,
 primary key(run_id,evidence_version_id)
);
create index match_run_evidence_version on public.match_run_evidence(evidence_version_id);
create table public.match_results (
 run_id uuid not null references public.match_runs(id) on delete cascade,
 job_id uuid not null references public.jobs(id), job_version_id uuid not null references public.job_versions(id),
 rank integer not null check(rank>0), result jsonb not null,
 primary key(run_id,job_id), unique(run_id,rank)
);
create table public.gap_items (
 run_id uuid not null, job_id uuid not null, ordinal integer not null, gap jsonb not null,
 primary key(run_id,job_id,ordinal), foreign key(run_id,job_id) references public.match_results(run_id,job_id) on delete cascade
);
create table public.match_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(user_id) on delete set null,
 run_id uuid references public.match_runs(id) on delete cascade,
 action text not null, created_at timestamptz not null default now()
);

-- An FK cascade on a deleted evidence version immediately erases derived private content.
-- This matching-owned hook needs no source-module/UI knowledge of report tables.
create function public.matching_purge_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.tasks set status='failed',safe_error='RF_CANCELED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null
 where source_ref=old.run_id and kind='matches.refresh' and status in ('queued','running');
 update public.match_runs set input_snapshot=null,status='invalidated',invalidated_at=clock_timestamp() where id=old.run_id;
 delete from public.match_results where run_id=old.run_id;
 return old;
end $$;
create trigger matching_evidence_deleted after delete on public.match_run_evidence
 for each row execute function public.matching_purge_evidence();

-- These are explicit cross-module projections: only minimal matching inputs cross the boundary.
create function public.matching_evidence_input(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'versionId',v.id,'label',v.label,'context',v.context,'source',e.source,
  'sourceVersion',v.source_version,'rubricVersion',v.rubric_version,
  'signal',case when e.source='scenario' then case when observed.correct then 'support' else 'practice' end
   when e.source='self-report' then case when c.claimed_level>0 then 'claim' else 'learning' end
   when e.source='portfolio-reference' then 'reference' else 'claim' end,
  'skills',coalesce((select jsonb_agg(distinct l.canonical_skill_id order by l.canonical_skill_id) from public.evidence_skill_links l where l.evidence_version_id=v.id),'[]'::jsonb)
 ) order by v.id),'[]'::jsonb)
 from public.evidence e join public.evidence_versions v on v.evidence_id=e.id and v.version=e.current_version
 left join public.skill_claims c on c.evidence_version_id=v.id
 left join lateral (
  select (o.value->>'correct')::boolean correct from public.attempt_items i
  join public.assessment_attempts a on a.id=i.attempt_id and a.user_id=e.user_id and a.status='completed'
  join public.assessment_results ar on ar.attempt_id=a.id
  cross join lateral jsonb_array_elements(ar.observations) o(value)
  where i.id=v.source_ref and i.question_version_id::text=v.source_version
   and o.value->>'itemId'=i.id::text and o.value->>'evidenceId'=e.id::text limit 1
 ) observed on true
 where e.user_id=p_user and (e.source<>'scenario' or (observed.correct is not null and v.rubric_version is not null))
$$;
create function public.matching_job_input(p_job uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'versionId',v.id,'title',v.title,'company',v.company_name,
  'track',v.track,'workplace',v.workplace,'level',v.level,'conditions',v.conditions,
  'requirements',coalesce((select jsonb_agg(jsonb_build_object('text',r.text,'priority',r.priority,
   'skills',coalesce((select jsonb_agg(distinct l.canonical_skill_id order by l.canonical_skill_id) from public.job_skill_links l where l.requirement_id=r.id),'[]'::jsonb)) order by r.ordinal)
   from public.job_requirements r where r.job_version_id=v.id),'[]'::jsonb))
 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version
 where j.id=p_job and public.catalog_job_visible(j.id) and (j.expires_at is null or j.expires_at>clock_timestamp())
$$;
create function public.matching_inputs_current(p_run uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(r.status<>'invalidated' and r.input_snapshot is not null
  and r.profile_revision=coalesce((select revision from public.career_preferences where user_id=r.user_id),0)
  and r.catalog_revision=(select revision from public.catalog_state where singleton)
  and r.dictionary_version=public.dictionary_current_version()
  and not exists(select 1 from jsonb_array_elements(r.input_snapshot->'evidence') e where not exists(
   select 1 from public.evidence_versions v join public.evidence owned on owned.id=v.evidence_id
   where v.id=(e->>'versionId')::uuid and v.user_id=r.user_id and v.version=owned.current_version))
  and not exists(select 1 from jsonb_array_elements(r.input_snapshot->'jobs') j where not exists(
   select 1 from public.jobs current_job join public.job_versions v on v.job_id=current_job.id and v.version=current_job.current_version
   where current_job.id=(j->>'id')::uuid and v.id=(j->>'versionId')::uuid and public.catalog_job_visible(current_job.id)
    and (current_job.expires_at is null or current_job.expires_at>clock_timestamp())))
 ,false) from public.match_runs r where r.id=p_run
$$;
create function public.matching_validate_constraints(p_constraints jsonb) returns void
language plpgsql set search_path='' as $$
declare v_confirmation jsonb;
begin
 if jsonb_typeof(p_constraints) is distinct from 'object' or not p_constraints ?& array['experienceYears','confirmations']
  or exists(select 1 from jsonb_object_keys(p_constraints) k where k not in ('experienceYears','confirmations')) then raise exception 'RF_INVALID_INPUT';end if;
 if p_constraints->'experienceYears'<>'null'::jsonb and (jsonb_typeof(p_constraints->'experienceYears')<>'number' or (p_constraints->>'experienceYears')::numeric not between 0 and 80) then raise exception 'RF_INVALID_INPUT';end if;
 if jsonb_typeof(p_constraints->'confirmations') is distinct from 'array' or jsonb_array_length(p_constraints->'confirmations')>100 then raise exception 'RF_INVALID_INPUT';end if;
 for v_confirmation in select value from jsonb_array_elements(p_constraints->'confirmations') loop
  if jsonb_typeof(v_confirmation) is distinct from 'object' or not v_confirmation ?& array['jobVersionId','field','answer'] or (select count(*) from jsonb_object_keys(v_confirmation))<>3
   or coalesce(v_confirmation->>'jobVersionId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or coalesce(v_confirmation->>'field','') not in ('workAuthorization','education') or coalesce(v_confirmation->>'answer','') not in ('confirmed','conflict','unknown') then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_constraints->'confirmations'))<>(select count(distinct (lower(entry.value->>'jobVersionId'),entry.value->>'field')) from jsonb_array_elements(p_constraints->'confirmations') as entry(value)) then raise exception 'RF_INVALID_INPUT';end if;
end $$;
create function public.matching_refresh(p_job uuid,p_constraints jsonb,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();r public.match_runs%rowtype;v_request text;v_snapshot jsonb;v_evidence jsonb;v_jobs jsonb;v_profile jsonb;v_id uuid;v_task uuid;v_count integer;v_catalog bigint;v_dictionary bigint;
begin
 perform public.matching_validate_constraints(p_constraints);
 p_constraints:=jsonb_set(p_constraints,'{confirmations}',coalesce((select jsonb_agg(entry.value||jsonb_build_object('jobVersionId',lower(entry.value->>'jobVersionId'))) from jsonb_array_elements(p_constraints->'confirmations') as entry(value)),'[]'::jsonb));
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 perform public.identity_require_user();
 v_request:=md5(jsonb_build_object('jobId',p_job,'constraints',p_constraints)::text);
 select * into r from public.match_runs where user_id=v_user and idempotency_key=p_key;
 if found then
  if r.request_hash<>v_request then raise exception 'RF_CONFLICT';end if;
  return jsonb_build_object('runId',r.id,'taskId',r.task_id,'status',(select status from public.tasks where id=r.task_id));
 end if;
 v_profile:=public.profile_read();
 select count(*) into v_count from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version
 where public.catalog_job_visible(j.id) and (j.expires_at is null or j.expires_at>clock_timestamp()) and (case when p_job is not null then j.id=p_job else v.track=v_profile->>'track' end);
 if p_job is not null and v_count=0 then raise exception 'RF_NOT_FOUND';end if;
 if v_count>200 then raise exception 'RF_MATCH_LIMIT';end if;
 select coalesce(jsonb_agg(public.matching_job_input(j.id) order by j.id),'[]'::jsonb) into v_jobs
 from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version
 where public.catalog_job_visible(j.id) and (j.expires_at is null or j.expires_at>clock_timestamp()) and (case when p_job is not null then j.id=p_job else v.track=v_profile->>'track' end);
 -- Confirmations bind only to the exact published versions selected for this run.
 if exists(select 1 from jsonb_array_elements(p_constraints->'confirmations') c where not exists(select 1 from jsonb_array_elements(v_jobs) j where j->>'versionId'=lower(c->>'jobVersionId') and j->'conditions'->(c->>'field')<>'null'::jsonb)) then raise exception 'RF_INVALID_INPUT';end if;
 v_evidence:=public.matching_evidence_input(v_user);
 if jsonb_array_length(v_evidence)>500 then raise exception 'RF_MATCH_LIMIT';end if;
 select revision into v_catalog from public.catalog_state where singleton;v_dictionary:=public.dictionary_current_version();
 v_snapshot:=jsonb_build_object('profileRevision',(v_profile->>'revision')::bigint,'catalogRevision',v_catalog,'dictionaryVersion',v_dictionary,
  'track',v_profile->>'track','workplaces',v_profile->'workplaces','constraints',p_constraints,'evidence',v_evidence,'jobs',v_jobs);
 if octet_length(v_snapshot::text)>1048576 then raise exception 'RF_MATCH_LIMIT';end if;
 insert into public.match_runs(user_id,target_job_id,idempotency_key,request_hash,input_hash,input_snapshot,profile_revision,catalog_revision,dictionary_version)
 values(v_user,p_job,p_key,v_request,md5(v_snapshot::text),v_snapshot,(v_profile->>'revision')::bigint,v_catalog,v_dictionary) returning id into v_id;
 insert into public.match_run_evidence(run_id,evidence_version_id) select v_id,(e->>'versionId')::uuid from jsonb_array_elements(v_evidence) e;
 v_task:=public.task_enqueue(v_user,'matches.refresh',v_id,md5(v_snapshot::text),p_key,v_request);
 update public.match_runs set task_id=v_task where id=v_id;
 insert into public.match_audit(actor_id,run_id,action) values(v_user,v_id,'run.created');
 return jsonb_build_object('runId',v_id,'taskId',v_task,'status','queued');
end $$;
create function public.matching_load_task(p_task uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;r public.match_runs%rowtype;v_user uuid;
begin
 select user_id into v_user from public.tasks where id=p_task;if v_user is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(v_user) then raise exception 'RF_FORBIDDEN';end if;
 if t.kind<>'matches.refresh' or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 select * into r from public.match_runs where id=t.source_ref and user_id=v_user for update;
 if not found or r.task_id<>p_task or r.input_hash<>t.input_version or not public.matching_inputs_current(r.id) then raise exception 'RF_STALE_INPUT';end if;
 return r.input_snapshot;
end $$;
create function public.matching_publish_task(p_task uuid,p_token uuid,p_results jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;r public.match_runs%rowtype;v_user uuid;result jsonb;job jsonb;req jsonb;skill jsonb;ref jsonb;v_input jsonb;v_rank integer:=0;v_ordinal integer;v_expected jsonb;
begin
 select user_id into v_user from public.tasks where id=p_task;if v_user is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 select * into t from public.tasks where id=p_task for update;
 if not public.identity_is_active(v_user) then raise exception 'RF_FORBIDDEN';end if;
 if t.kind<>'matches.refresh' then raise exception 'RF_INVALID_INPUT';end if;
 select * into r from public.match_runs where id=t.source_ref and user_id=v_user for update;
 if not found or r.task_id<>p_task or r.input_hash<>t.input_version or not public.matching_inputs_current(r.id) then raise exception 'RF_STALE_INPUT';end if;
 if t.status='succeeded' and r.status='succeeded' then return jsonb_build_object('resultRef',r.id);end if;
 if t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)<>jsonb_array_length(r.input_snapshot->'jobs') or octet_length(p_results::text)>4194304 then raise exception 'RF_INVALID_INPUT';end if;
 if (select count(distinct value->>'jobId') from jsonb_array_elements(p_results))<>jsonb_array_length(p_results) then raise exception 'RF_INVALID_INPUT';end if;
 for result in select value from jsonb_array_elements(p_results) loop
  select value into job from jsonb_array_elements(r.input_snapshot->'jobs') where value->>'id'=result->>'jobId' and value->>'versionId'=result->>'jobVersionId';
  if job is null or result->>'recipe' is distinct from 'rules-v1' or result->'title' is distinct from job->'title' or result->'company' is distinct from job->'company'
   or jsonb_typeof(result->'requirements') is distinct from 'array' or jsonb_array_length(result->'requirements')<>jsonb_array_length(job->'requirements') then raise exception 'RF_INVALID_INPUT';end if;
  v_ordinal:=0;
  for req in select value from jsonb_array_elements(result->'requirements') loop
   v_expected:=job->'requirements'->v_ordinal;
   if req->>'jobVersionId' is distinct from job->>'versionId' or req->>'ordinal' is distinct from v_ordinal::text or req->'text' is distinct from v_expected->'text' or req->'priority' is distinct from v_expected->'priority'
    or jsonb_typeof(req->'skills') is distinct from 'array' then raise exception 'RF_INVALID_INPUT';end if;
   if (select coalesce(jsonb_agg(value->'skillId' order by value->>'skillId'),'[]'::jsonb) from jsonb_array_elements(req->'skills')) is distinct from (select coalesce(jsonb_agg(value order by value#>>'{}'),'[]'::jsonb) from jsonb_array_elements(v_expected->'skills')) then raise exception 'RF_INVALID_INPUT';end if;
   for skill in select value from jsonb_array_elements(req->'skills') loop
    if jsonb_typeof(skill->'support') is distinct from 'array' or jsonb_typeof(skill->'practice') is distinct from 'array' then raise exception 'RF_INVALID_INPUT';end if;
    for ref in select value from jsonb_array_elements((skill->'support')||(skill->'practice')) loop
     select value into v_input from jsonb_array_elements(r.input_snapshot->'evidence') e where e.value->>'versionId'=ref->>'versionId' and e.value->>'id'=ref->>'evidenceId' and e.value->'skills' ? (skill->>'skillId');
     if v_input is null or ref is distinct from ((v_input-'skills'-'id')||jsonb_build_object('evidenceId',v_input->'id')) then raise exception 'RF_INVALID_INPUT';end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(skill->'support') s where s->>'signal' not in ('support','claim','reference')) or exists(select 1 from jsonb_array_elements(skill->'practice') s where s->>'signal'<>'practice') then raise exception 'RF_INVALID_INPUT';end if;
   end loop;
   v_ordinal:=v_ordinal+1;
  end loop;
  v_rank:=v_rank+1;
  insert into public.match_results(run_id,job_id,job_version_id,rank,result) values(r.id,(job->>'id')::uuid,(job->>'versionId')::uuid,v_rank,result);
  insert into public.gap_items(run_id,job_id,ordinal,gap) select r.id,(job->>'id')::uuid,ordinality::integer,value from jsonb_array_elements(result->'gaps') with ordinality;
 end loop;
 if not public.matching_inputs_current(r.id) then raise exception 'RF_STALE_INPUT';end if;
 update public.tasks set status='succeeded',result_ref=r.id,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null,safe_error=null
 where id=p_task and status='running' and lease_token=p_token and lease_expires_at>clock_timestamp();
 if not found then raise exception 'RF_CONFLICT';end if;
 update public.match_runs set status='succeeded',finished_at=clock_timestamp() where id=r.id;
 insert into public.task_events(task_id,event) values(p_task,'task.succeeded');
 return jsonb_build_object('resultRef',r.id);
end $$;
create function public.matching_run_json(p_run uuid,p_after integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.match_runs%rowtype;v_status text;v_stale boolean;v_data jsonb;v_last integer;
begin
 select * into r from public.match_runs where id=p_run;if not found then return null;end if;
 select status into v_status from public.tasks where id=r.task_id;
 v_stale:=not public.matching_inputs_current(r.id);
 select coalesce(jsonb_agg(x.result||jsonb_build_object('available',public.catalog_job_visible(x.job_id) and exists(select 1 from public.jobs j where j.id=x.job_id and (j.expires_at is null or j.expires_at>clock_timestamp())),
 'freshness',case when not public.catalog_job_visible(x.job_id) then null when exists(select 1 from jsonb_array_elements(public.catalog_job_json(x.job_id)->'sources') source where source->>'freshness'='current') then 'current' else 'uncertain' end) order by x.rank),'[]'::jsonb),max(x.rank)
 into v_data,v_last from (select * from public.match_results where run_id=r.id and rank>p_after order by rank limit 20) x;
 return jsonb_build_object('id',r.id,'taskId',r.task_id,'targetJobId',r.target_job_id,'status',case when r.status='queued' then coalesce(v_status,'failed') else r.status end,
  'profileRevision',r.profile_revision,'catalogRevision',r.catalog_revision,'dictionaryVersion',r.dictionary_version,
  'recipe','rules-v1','createdAt',r.created_at,'finishedAt',r.finished_at,'stale',v_stale,
  'constraints',r.input_snapshot->'constraints','candidateCount',coalesce(jsonb_array_length(r.input_snapshot->'jobs'),0),
  'data',v_data,'lastRank',case when exists(select 1 from public.match_results where run_id=r.id and rank>v_last) then v_last else null end);
end $$;
create function public.matching_find(p_run uuid,p_after integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('catalog:write',0));
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();
 if p_after is null or p_after not between 0 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 if not exists(select 1 from public.match_runs where id=p_run and user_id=v_user) then raise exception 'RF_NOT_FOUND';end if;
 return public.matching_run_json(p_run,p_after);
end $$;
create function public.matching_list(p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_data jsonb;v_last bigint;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'targetJobId',r.target_job_id,'status',case when r.status='queued' then coalesce(t.status,'failed') else r.status end,'createdAt',r.created_at) order by r.sequence desc),'[]'::jsonb),min(r.sequence)
 into v_data,v_last from (select * from public.match_runs where user_id=v_user and (p_before is null or sequence<p_before) order by sequence desc limit 20) r left join public.tasks t on t.id=r.task_id;
 return jsonb_build_object('data',v_data,'lastSequence',case when exists(select 1 from public.match_runs where user_id=v_user and sequence<v_last) then v_last::text else null end);
end $$;

alter table public.match_runs enable row level security;
alter table public.match_run_evidence enable row level security;
alter table public.match_results enable row level security;
alter table public.gap_items enable row level security;
alter table public.match_audit enable row level security;
-- Raw report/snapshot reads intentionally have no member grants: the read RPC rechecks freshness/deletion.
revoke all on public.match_runs,public.match_run_evidence,public.match_results,public.gap_items,public.match_audit from anon,authenticated;
grant all on public.match_runs,public.match_run_evidence,public.match_results,public.gap_items,public.match_audit to service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'matching_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.matching_refresh(uuid,jsonb,text),public.matching_find(uuid,integer),public.matching_list(bigint) to authenticated;
