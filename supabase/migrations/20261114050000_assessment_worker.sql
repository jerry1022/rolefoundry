-- Module 05 and the durable execution core required to make grading executable.
create extension if not exists pgmq;
select pgmq.create('rolefoundry_tasks');
create table public.tasks (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,
 kind text not null check(kind in ('assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','account.delete')),
 source_ref uuid not null,input_version text not null,idempotency_key text not null,request_hash text not null,
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),attempt_count integer not null default 0,max_attempts integer not null default 3 check(max_attempts between 1 and 3),
 queue_message_id bigint,worker_id uuid,lease_token uuid,lease_expires_at timestamptz,next_run_at timestamptz not null default now(),
 result_ref uuid,safe_error text,created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,heartbeat_at timestamptz,
 unique(user_id,kind,idempotency_key)
);
create index tasks_owner on public.tasks(user_id,id);
create index tasks_pending on public.tasks(status,next_run_at,lease_expires_at);
create table public.task_events(id bigint generated always as identity primary key,task_id uuid references public.tasks(id) on delete cascade,worker_id uuid,event text not null,safe_code text,created_at timestamptz not null default now());
create table public.rubric_versions(id uuid primary key default gen_random_uuid(),key text not null,version integer not null check(version>0),description text not null,created_by uuid references public.profiles(user_id) on delete set null,created_at timestamptz not null default now(),unique(key,version));
create table public.question_versions(id uuid primary key default gen_random_uuid(),key text not null,version integer not null check(version>0),track text not null check(track in ('Engineering & data','Product & strategy','Marketing & operations','Design & content')),skill_id text not null references public.skills(id),rubric_version_id uuid not null references public.rubric_versions(id),dictionary_version bigint not null default public.dictionary_current_version() references public.dictionary_versions(version),prompt text not null,options jsonb not null,correct_index integer not null,explanation text not null,created_by uuid references public.profiles(user_id) on delete set null,created_at timestamptz not null default now(),unique(key,version),check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 10),check(correct_index>=0 and correct_index<jsonb_array_length(options)));
create table public.question_publications(question_version_id uuid primary key references public.question_versions(id),reviewed boolean not null default false,reviewed_by uuid references public.profiles(user_id) on delete set null,reason text,reviewed_at timestamptz);
create table public.assessment_attempts(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,track text not null,revision integer not null default 1,status text not null default 'draft' check(status in ('draft','submitted','completed','failed')),task_id uuid unique references public.tasks(id) on delete set null,created_at timestamptz not null default now(),submitted_at timestamptz,unique(id,user_id));
create index assessment_owner_page on public.assessment_attempts(user_id,id);
create table public.attempt_items(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,question_version_id uuid not null references public.question_versions(id),ordinal integer not null,unique(attempt_id,ordinal));
create table public.responses(attempt_item_id uuid primary key references public.attempt_items(id) on delete cascade,answer_index integer not null);
create table public.assessment_results(id uuid primary key default gen_random_uuid(),attempt_id uuid not null unique references public.assessment_attempts(id) on delete cascade,recipe text not null default 'mcq-v1',correct integer not null,total integer not null,observations jsonb not null,created_at timestamptz not null default now());
create table public.assessment_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(user_id) on delete set null,action text not null,resource_id uuid,reason text,created_at timestamptz not null default now());

create function public.task_enqueue(p_user uuid,p_kind text,p_source uuid,p_version text,p_key text,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_task public.tasks%rowtype;v_id uuid;v_message bigint;
begin
 if p_user is null or not public.identity_is_active(p_user) then raise exception 'RF_FORBIDDEN';end if;
 if p_source is null or p_version is null or length(p_version) not between 1 and 200 or p_key is null or length(p_key) not between 8 and 200 or p_hash is null then raise exception 'RF_INVALID_INPUT';end if;
 select * into v_task from public.tasks where user_id=p_user and kind=p_kind and idempotency_key=p_key;
 if found then if v_task.request_hash<>p_hash or v_task.source_ref<>p_source or v_task.input_version<>p_version then raise exception 'RF_CONFLICT';end if;return v_task.id;end if;
 if (select count(*) from public.tasks where user_id=p_user and status in ('queued','running'))>=20 then raise exception 'RF_CONFLICT';end if;
 insert into public.tasks(user_id,kind,source_ref,input_version,idempotency_key,request_hash) values(p_user,p_kind,p_source,p_version,p_key,p_hash) returning id into v_id;
 select pgmq.send('rolefoundry_tasks',jsonb_build_object('taskId',v_id)) into v_message;
 update public.tasks set queue_message_id=v_message where id=v_id;insert into public.task_events(task_id,event) values(v_id,'task.queued');return v_id;
end $$;
create function public.task_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'kind',kind,'status',status,'attempts',attempt_count,'maxAttempts',max_attempts,'createdAt',created_at,'startedAt',started_at,'finishedAt',finished_at,'leaseExpiresAt',lease_expires_at,'resultRef',result_ref,'errorCode',safe_error) from public.tasks where id=p_id
$$;
create function public.task_find(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();
begin if not exists(select 1 from public.tasks where id=p_id and user_id=v_user) then raise exception 'RF_NOT_FOUND';end if;return public.task_json(p_id);end $$;
create function public.task_read(p_worker uuid,p_kinds text[],p_seconds integer default 30,p_quantity integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare m record;t public.tasks%rowtype;v_token uuid;v_result jsonb:='[]'::jsonb;v_task_id uuid;v_scan integer;
begin
 if p_worker is null or p_seconds is null or p_seconds not between 5 and 300 or p_quantity is null or p_quantity not between 1 and 8 or coalesce(cardinality(p_kinds),0) not between 1 and 20 then raise exception 'RF_INVALID_INPUT';end if;
 -- Skip terminal/poison deliveries without mistaking them for an empty queue.
 -- Read one at a time so unclaimed work is never hidden by an over-sized batch.
 for v_scan in 1..64 loop
  exit when jsonb_array_length(v_result)>=p_quantity;
  select * into m from pgmq.read('rolefoundry_tasks',p_seconds,1);
  exit when not found;
  if jsonb_typeof(m.message) is distinct from 'object' or not m.message?'taskId' or m.message->>'taskId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or (select count(*) from jsonb_object_keys(m.message))<>1 then
   perform pgmq.archive('rolefoundry_tasks',m.msg_id);insert into public.task_events(worker_id,event,safe_code) values(p_worker,'queue.poison','RF_POISON');continue;
  end if;
  v_task_id:=(m.message->>'taskId')::uuid;select * into t from public.tasks where id=v_task_id for update;
  if not found then perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if t.queue_message_id<>m.msg_id then perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if t.status in ('succeeded','failed') then perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if not public.identity_is_active(t.user_id) then update public.tasks set status='failed',safe_error='RF_FORBIDDEN',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=t.id;update public.assessment_attempts set status='failed' where task_id=t.id and status='submitted';perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  if not t.kind=any(p_kinds) then perform pgmq.set_vt('rolefoundry_tasks',m.msg_id,3);continue;end if;
  if (t.status='running' and t.lease_expires_at>clock_timestamp()) or t.next_run_at>clock_timestamp() then continue;end if;
  if t.attempt_count>=t.max_attempts then update public.tasks set status='failed',safe_error='RF_RETRY_EXHAUSTED',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=t.id;update public.assessment_attempts set status='failed' where task_id=t.id and status='submitted';perform pgmq.archive('rolefoundry_tasks',m.msg_id);continue;end if;
  v_token:=gen_random_uuid();update public.tasks set status='running',attempt_count=attempt_count+1,worker_id=p_worker,lease_token=v_token,lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),heartbeat_at=clock_timestamp(),started_at=coalesce(started_at,clock_timestamp()) where id=t.id;
  insert into public.task_events(task_id,worker_id,event) values(t.id,p_worker,'task.claimed');v_result:=v_result||jsonb_build_array(jsonb_build_object('taskId',t.id,'messageId',m.msg_id::text,'kind',t.kind,'token',v_token,'leaseSeconds',p_seconds));
 end loop;return v_result;
end $$;
create function public.task_heartbeat(p_task uuid,p_token uuid,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare v_message bigint;
begin if p_seconds is null or p_seconds not between 5 and 300 then raise exception 'RF_INVALID_INPUT';end if;
 update public.tasks t set lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),heartbeat_at=clock_timestamp() where id=p_task and lease_token=p_token and status='running' and lease_expires_at>clock_timestamp() and public.identity_is_active(user_id) returning queue_message_id into v_message;
 if not found then return false;end if;perform pgmq.set_vt('rolefoundry_tasks',v_message,p_seconds);return true;end $$;
create function public.task_fail(p_task uuid,p_token uuid,p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;v_delay integer;v_error text;v_user uuid;
begin
 if p_category is null or p_category not in ('infrastructure','timeout','validation','forbidden','stale','canceled') then raise exception 'RF_INVALID_INPUT';end if;
 select user_id into v_user from public.tasks where id=p_task;if v_user is null then return jsonb_build_object('status','missing');end if;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));
 select * into t from public.tasks where id=p_task for update;if not found then return jsonb_build_object('status','missing');end if;
 if t.status in ('succeeded','failed') then return jsonb_build_object('status',t.status);end if;
 if t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then return jsonb_build_object('status','lease_lost');end if;
 if p_category in ('infrastructure','timeout') and t.attempt_count<t.max_attempts and public.identity_is_active(t.user_id) then
  v_delay:=power(2,t.attempt_count-1)::integer+floor(random()*2)::integer;
  update public.tasks set status='queued',safe_error='RF_TRANSIENT',worker_id=null,lease_token=null,lease_expires_at=null,next_run_at=clock_timestamp()+make_interval(secs=>v_delay) where id=p_task;
  perform pgmq.set_vt('rolefoundry_tasks',t.queue_message_id,v_delay);insert into public.task_events(task_id,event,safe_code) values(p_task,'task.retry_scheduled','RF_TRANSIENT');return jsonb_build_object('status','queued');
 end if;
 v_error:=case p_category when 'forbidden' then 'RF_FORBIDDEN' when 'stale' then 'RF_STALE_INPUT' when 'canceled' then 'RF_CANCELED' when 'validation' then 'RF_INVALID_INPUT' else 'RF_RETRY_EXHAUSTED' end;
 update public.tasks set status='failed',safe_error=v_error,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null where id=p_task;
 update public.assessment_attempts set status='failed' where task_id=p_task and status='submitted';insert into public.task_events(task_id,event,safe_code) values(p_task,'task.failed',v_error);return jsonb_build_object('status','failed');
end $$;
create function public.task_release(p_task uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare v_message bigint;
begin update public.tasks set status='queued',attempt_count=greatest(0,attempt_count-1),worker_id=null,lease_token=null,lease_expires_at=null,next_run_at=clock_timestamp() where id=p_task and lease_token=p_token and status='running' returning queue_message_id into v_message;if not found then return false;end if;perform pgmq.set_vt('rolefoundry_tasks',v_message,0);insert into public.task_events(task_id,event) values(p_task,'task.released');return true;end $$;
create function public.task_ack(p_task uuid,p_message bigint) returns void language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.tasks where id=p_task and status not in ('succeeded','failed')) then raise exception 'RF_CONFLICT';end if;perform pgmq.archive('rolefoundry_tasks',p_message);end $$;

alter table public.question_versions add column canonical_skill_id text not null references public.skills(id);
create trigger question_skill_projection before insert on public.question_versions for each row execute function public.dictionary_project_link();
insert into public.dictionary_link_targets values('public','question_versions','canonical_skill_id');
create function public.assessment_rubric_create(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.identity_require_admin();v_id uuid;
begin if p_data->>'key' is null or length(btrim(p_data->>'key')) not between 1 and 100 or (p_data->>'version')::integer<1 or length(btrim(p_data->>'description')) not between 1 and 2000 then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.rubric_versions(key,version,description,created_by) values(p_data->>'key',(p_data->>'version')::integer,p_data->>'description',v_actor) returning id into v_id;insert into public.assessment_audit(actor_id,action,resource_id) values(v_actor,'rubric.created',v_id);return jsonb_build_object('id',v_id);
exception when unique_violation then raise exception 'RF_CONFLICT';when invalid_text_representation then raise exception 'RF_INVALID_INPUT';end $$;
create function public.assessment_question_create(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();v_id uuid;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 if p_data->>'key' is null or length(btrim(p_data->>'key')) not between 1 and 100 or (p_data->>'version')::integer<1 or p_data->>'track' not in ('Engineering & data','Product & strategy','Marketing & operations','Design & content') or public.dictionary_resolve_id(p_data->>'skillId') is null or not exists(select 1 from public.rubric_versions where id=(p_data->>'rubricId')::uuid) or length(btrim(p_data->>'prompt')) not between 1 and 3000 or length(btrim(p_data->>'explanation')) not between 1 and 3000 or jsonb_typeof(p_data->'options') is distinct from 'array' then raise exception 'RF_INVALID_INPUT';end if;
 if jsonb_array_length(p_data->'options') not between 2 and 10 or exists(select 1 from jsonb_array_elements(p_data->'options') o where jsonb_typeof(o)<>'string' or length(btrim(o#>>'{}')) not between 1 and 1000) or (p_data->>'correctIndex')::integer not between 0 and jsonb_array_length(p_data->'options')-1 then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.question_versions(key,version,track,skill_id,rubric_version_id,prompt,options,correct_index,explanation,created_by) values(p_data->>'key',(p_data->>'version')::integer,p_data->>'track',p_data->>'skillId',(p_data->>'rubricId')::uuid,p_data->>'prompt',p_data->'options',(p_data->>'correctIndex')::integer,p_data->>'explanation',v_actor) returning id into v_id;
 insert into public.question_publications(question_version_id) values(v_id);insert into public.assessment_audit(actor_id,action,resource_id) values(v_actor,'question.created',v_id);return jsonb_build_object('id',v_id);
exception when unique_violation then raise exception 'RF_CONFLICT';when invalid_text_representation then raise exception 'RF_INVALID_INPUT';end $$;
create function public.assessment_question_review(p_id uuid,p_reason text,p_reviewed boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.catalog_lock();
begin if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 or p_reviewed is null then raise exception 'RF_INVALID_INPUT';end if;
 update public.question_publications set reviewed=p_reviewed,reason=btrim(p_reason),reviewed_by=v_actor,reviewed_at=clock_timestamp() where question_version_id=p_id;if not found then raise exception 'RF_NOT_FOUND';end if;
 -- A new reviewed version retires the previous version for selection, never for historical reads.
 if p_reviewed then update public.question_publications p set reviewed=false where question_version_id<>p_id and exists(select 1 from public.question_versions q join public.question_versions chosen on chosen.id=p_id where q.id=p.question_version_id and q.key=chosen.key);end if;
 insert into public.assessment_audit(actor_id,action,resource_id,reason) values(v_actor,case when p_reviewed then 'question.reviewed' else 'question.retired' end,p_id,p_reason);
end $$;
create function public.assessment_bank_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=public.identity_require_admin();v_json jsonb;
begin select jsonb_build_object('rubrics',coalesce((select jsonb_agg(jsonb_build_object('id',id,'key',key,'version',version,'description',description) order by key,version) from public.rubric_versions),'[]'::jsonb),'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'key',q.key,'version',q.version,'track',q.track,'skillId',q.skill_id,'rubricId',q.rubric_version_id,'prompt',q.prompt,'options',q.options,'correctIndex',q.correct_index,'explanation',q.explanation,'reviewed',p.reviewed,'dictionaryVersion',q.dictionary_version) order by q.key,q.version) from public.question_versions q join public.question_publications p on p.question_version_id=q.id),'[]'::jsonb)) into v_json;return v_json;end $$;
create function public.assessment_result_json(p_attempt uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'recipe',recipe,'correct',correct,'total',total,'observations',observations,'createdAt',created_at) from public.assessment_results where attempt_id=p_attempt
$$;
create function public.assessment_attempt_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'track',a.track,'revision',a.revision,'status',a.status,'taskId',a.task_id,'createdAt',a.created_at,
 'items',(select jsonb_agg(jsonb_build_object('id',i.id,'questionVersionId',q.id,'rubricVersionId',q.rubric_version_id,'prompt',q.prompt,'options',q.options,'skillId',q.skill_id,'skillLabel',coalesce(public.dictionary_labels_at(array[q.skill_id],q.dictionary_version)->>q.skill_id,q.skill_id),'dictionaryVersion',q.dictionary_version) order by i.ordinal) from public.attempt_items i join public.question_versions q on q.id=i.question_version_id where i.attempt_id=a.id),
 'answers',coalesce((select jsonb_object_agg(i.id::text,r.answer_index) from public.attempt_items i join public.responses r on r.attempt_item_id=i.id where i.attempt_id=a.id),'{}'::jsonb),
 'result',case when a.status='completed' then public.assessment_result_json(a.id) end) from public.assessment_attempts a where a.id=p_id
$$;
create function public.assessment_find(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();begin if not exists(select 1 from public.assessment_attempts where id=p_id and user_id=v_user) then raise exception 'RF_NOT_FOUND';end if;return public.assessment_attempt_json(p_id);end $$;
create function public.assessment_list(p_after uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_data jsonb;v_last uuid;v_more boolean;
begin with page as(select * from public.assessment_attempts where user_id=v_user and (p_after is null or id>p_after) order by id limit 21),shown as(select * from page order by id limit 20)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'track',track,'revision',revision,'status',status,'taskId',task_id,'createdAt',created_at) order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*)>20 from page) into v_data,v_last,v_more;
 return jsonb_build_object('data',v_data,'lastId',case when v_more then v_last end);end $$;
create function public.assessment_start(p_track text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();v_id uuid;v_questions uuid[];v_question uuid;v_index integer:=0;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();
 if p_track is null or p_track not in ('Engineering & data','Product & strategy','Marketing & operations','Design & content') then raise exception 'RF_INVALID_INPUT';end if;
 select array_agg(id order by ordinal) into v_questions from(select q.id,row_number() over(order by (select max(a.created_at) from public.attempt_items i join public.assessment_attempts a on a.id=i.attempt_id where i.question_version_id=q.id and a.user_id=v_user) nulls first,random()) ordinal from public.question_versions q join public.question_publications p on p.question_version_id=q.id where q.track=p_track and p.reviewed and public.dictionary_resolve_id(q.skill_id) is not null order by ordinal limit 3) selected;
 if coalesce(cardinality(v_questions),0)<>3 then raise exception 'RF_NOT_READY';end if;
 if (select count(*) from public.assessment_attempts where user_id=v_user and status='draft')>=10 then raise exception 'RF_CONFLICT';end if;
 insert into public.assessment_attempts(user_id,track) values(v_user,p_track) returning id into v_id;
 foreach v_question in array v_questions loop insert into public.attempt_items(attempt_id,question_version_id,ordinal) values(v_id,v_question,v_index);v_index:=v_index+1;end loop;
 return public.assessment_attempt_json(v_id);
end $$;
create function public.assessment_validate_answers(p_id uuid,p_answers jsonb,p_complete boolean) returns void language plpgsql security definer set search_path='' as $$
declare r record;v_item uuid;
begin
 if jsonb_typeof(p_answers) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_answers))>20 then raise exception 'RF_INVALID_INPUT';end if;
 for r in select key,value from jsonb_each(p_answers) loop
  if r.key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or jsonb_typeof(r.value)<>'number' or r.value::text !~ '^[0-9]$' then raise exception 'RF_INVALID_INPUT';end if;v_item:=r.key::uuid;
  if not exists(select 1 from public.attempt_items i join public.question_versions q on q.id=i.question_version_id where i.id=v_item and i.attempt_id=p_id and r.value::text::integer<jsonb_array_length(q.options)) then raise exception 'RF_INVALID_INPUT';end if;
 end loop;
 if (select count(distinct key::uuid)<>count(*) from jsonb_object_keys(p_answers) key) then raise exception 'RF_INVALID_INPUT';end if;
 if p_complete and (select count(*) from jsonb_object_keys(p_answers))<>(select count(*) from public.attempt_items where attempt_id=p_id) then raise exception 'RF_INVALID_INPUT';end if;
end $$;
create function public.assessment_save(p_id uuid,p_expected integer,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();a public.assessment_attempts%rowtype;
begin perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();select * into a from public.assessment_attempts where id=p_id and user_id=v_user for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if a.status<>'draft' or p_expected is null or p_expected<>a.revision then raise exception 'RF_CONFLICT';end if;perform public.assessment_validate_answers(p_id,p_answers,false);
 delete from public.responses where attempt_item_id in(select id from public.attempt_items where attempt_id=p_id);insert into public.responses(attempt_item_id,answer_index) select key::uuid,value::text::integer from jsonb_each(p_answers);
 update public.assessment_attempts set revision=revision+1 where id=p_id;return public.assessment_attempt_json(p_id);end $$;
create function public.assessment_submit(p_id uuid,p_expected integer,p_answers jsonb,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();a public.assessment_attempts%rowtype;t public.tasks%rowtype;v_hash text;v_task uuid;
begin perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();select * into a from public.assessment_attempts where id=p_id and user_id=v_user for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 perform public.assessment_validate_answers(p_id,p_answers,true);if p_expected is null or p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('attempt',p_id,'revision',p_expected,'answers',p_answers)::text,'sha256'),'hex');select * into t from public.tasks where user_id=v_user and kind='assessment.grade' and idempotency_key=p_key;
 if found then if t.request_hash<>v_hash or t.source_ref<>p_id then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('taskId',t.id,'status',t.status);end if;
 if a.status<>'draft' or p_expected<>a.revision then raise exception 'RF_CONFLICT';end if;
 delete from public.responses where attempt_item_id in(select id from public.attempt_items where attempt_id=p_id);insert into public.responses(attempt_item_id,answer_index) select key::uuid,value::text::integer from jsonb_each(p_answers);
 v_task:=public.task_enqueue(v_user,'assessment.grade',p_id,(a.revision+1)::text,p_key,v_hash);update public.assessment_attempts set status='submitted',revision=revision+1,task_id=v_task,submitted_at=clock_timestamp() where id=p_id;
 return jsonb_build_object('taskId',v_task,'status','queued');end $$;
create function public.assessment_grade_task(p_task uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype;a public.assessment_attempts%rowtype;v_user uuid;v_result uuid;r record;v_observations jsonb:='[]'::jsonb;v_evidence jsonb;v_correct integer:=0;v_total integer:=0;v_valid boolean;
begin
 select user_id into v_user from public.tasks where id=p_task;if v_user is null then raise exception 'RF_NOT_FOUND';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));select * into t from public.tasks where id=p_task for update;
 if not found or not public.identity_is_active(v_user) then raise exception 'RF_FORBIDDEN';end if;
 if t.status='succeeded' then return jsonb_build_object('resultRef',t.result_ref);end if;
 if t.kind<>'assessment.grade' or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 select * into a from public.assessment_attempts where id=t.source_ref and user_id=v_user for update;
 if not found or a.status<>'submitted' or a.task_id<>p_task or a.revision::text<>t.input_version then raise exception 'RF_STALE_INPUT';end if;
 for r in select i.id item_id,q.*,response.answer_index from public.attempt_items i join public.question_versions q on q.id=i.question_version_id join public.responses response on response.attempt_item_id=i.id where i.attempt_id=a.id order by i.ordinal loop
  v_total:=v_total+1;v_valid:=r.answer_index=r.correct_index;if v_valid then v_correct:=v_correct+1;end if;
  v_evidence:=public.profile_record_internal_evidence(v_user,jsonb_build_object('source','scenario','sourceRef',r.item_id,'sourceVersion',r.id::text,'rubricVersion',r.rubric_version_id::text,'label','Scenario observation','context',left(r.prompt,1900)||case when length(r.prompt)>1900 then ' [Excerpt; see the assessment for the full prompt.]' else '' end,'dictionaryVersion',r.dictionary_version,'observedAt',a.submitted_at,'skills',jsonb_build_array(r.skill_id),'outcome',case when v_valid then 'Correct in this scenario. ' else 'Incorrect in this scenario; revisit the context. ' end||left(r.explanation,1800)||case when length(r.explanation)>1800 then ' [See assessment feedback for the full explanation.]' else '' end));
  v_observations:=v_observations||jsonb_build_array(jsonb_build_object('itemId',r.item_id,'correct',v_valid,'selectedIndex',r.answer_index,'correctIndex',r.correct_index,'explanation',r.explanation,'evidenceId',v_evidence->'evidence'->>'id'));
 end loop;
 if v_total<>(select count(*) from public.attempt_items where attempt_id=a.id) then raise exception 'RF_INVALID_INPUT';end if;
 insert into public.assessment_results(attempt_id,correct,total,observations) values(a.id,v_correct,v_total,v_observations) returning id into v_result;
 update public.assessment_attempts set status='completed' where id=a.id;update public.tasks set status='succeeded',result_ref=v_result,finished_at=clock_timestamp(),worker_id=null,lease_token=null,lease_expires_at=null,safe_error=null where id=p_task and status='running' and lease_token=p_token and lease_expires_at>clock_timestamp();
 if not found then raise exception 'RF_CONFLICT';end if; -- Roll back result and evidence if ownership expired during grading.
 insert into public.task_events(task_id,event) values(p_task,'task.succeeded');return jsonb_build_object('resultRef',v_result);
end $$;

-- Owner deactivation invalidates in-flight general tasks before any publication.
create function public.task_cancel_for_user(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||p_user::text,0));
 update public.tasks set status='failed',safe_error='RF_FORBIDDEN',finished_at=clock_timestamp(),lease_token=null,lease_expires_at=null,worker_id=null where user_id=p_user and status in ('queued','running');
 update public.assessment_attempts set status='failed' where user_id=p_user and status in ('draft','submitted');
end $$;
-- Database policies keep correct answers, queue control and privileged helpers out of browser roles.
do $$ declare t text;begin
 foreach t in array array['tasks','task_events','rubric_versions','question_versions','question_publications','assessment_attempts','attempt_items','responses','assessment_results','assessment_audit'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select(id,user_id,kind,source_ref,input_version,status,attempt_count,max_attempts,result_ref,safe_error,created_at,started_at,finished_at,lease_expires_at) on public.tasks to authenticated;
grant select on public.assessment_attempts,public.attempt_items,public.responses,public.assessment_results to authenticated;
create policy task_owner_read on public.tasks for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
create policy assessment_owner_read on public.assessment_attempts for select to authenticated using(user_id=auth.uid() and public.identity_is_active(auth.uid()));
create policy attempt_items_owner on public.attempt_items for select to authenticated using(exists(select 1 from public.assessment_attempts a where a.id=attempt_id and a.user_id=auth.uid() and public.identity_is_active(auth.uid())));
create policy responses_owner on public.responses for select to authenticated using(exists(select 1 from public.attempt_items i join public.assessment_attempts a on a.id=i.attempt_id where i.id=attempt_item_id and a.user_id=auth.uid() and public.identity_is_active(auth.uid())));
create policy results_owner on public.assessment_results for select to authenticated using(exists(select 1 from public.assessment_attempts a where a.id=attempt_id and a.user_id=auth.uid() and public.identity_is_active(auth.uid())));
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'task_%' or p.proname like 'assessment_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
revoke all on schema pgmq from anon,authenticated;
grant execute on function public.task_find(uuid),public.assessment_start(text),public.assessment_find(uuid),public.assessment_list(uuid),public.assessment_save(uuid,integer,jsonb),public.assessment_submit(uuid,integer,jsonb,text),public.assessment_bank_admin(),public.assessment_rubric_create(jsonb),public.assessment_question_create(jsonb),public.assessment_question_review(uuid,text,boolean) to authenticated;

-- Trusted evidence retains the immutable question dictionary version.
create or replace function public.profile_validate_evidence(p_data jsonb,p_internal boolean) returns void
language plpgsql set search_path='' as $$
declare v_source text:=p_data->>'source'; v_time timestamptz;
begin
 if p_internal is null or jsonb_typeof(p_data) is distinct from 'object' or not p_data ?& array['source','label','context','observedAt','skills'] then raise exception 'RF_INVALID_INPUT'; end if;
 if (not p_internal and v_source not in ('self-report','portfolio-reference')) or (p_internal and v_source not in ('scenario','resume-claim')) or v_source is null then raise exception 'RF_FORBIDDEN'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where not (k=any(array['source','label','context','observedAt','skills'] || case v_source when 'self-report' then array['claimedLevel'] when 'portfolio-reference' then array['url'] else array['sourceRef','sourceVersion','rubricVersion','outcome','dictionaryVersion'] end))) then raise exception 'RF_INVALID_INPUT'; end if;
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
 if p_internal and p_data?'dictionaryVersion' then
  if jsonb_typeof(p_data->'dictionaryVersion') is distinct from 'number' or p_data->>'dictionaryVersion' !~ '^[1-9][0-9]{0,15}$' then raise exception 'RF_INVALID_INPUT';end if;
  if not exists(select 1 from public.dictionary_versions where version=(p_data->>'dictionaryVersion')::bigint)
   or exists(select 1 from jsonb_array_elements_text(p_data->'skills') skill where not exists(select 1 from public.dictionary_versions v cross join lateral jsonb_array_elements(v.snapshot->'skills') entry where v.version=(p_data->>'dictionaryVersion')::bigint and entry->>'id'=skill)) then raise exception 'RF_INVALID_INPUT';end if;
 end if;
 if p_internal then
  if not p_data ?& array['sourceRef','sourceVersion','rubricVersion','outcome']
   or (p_data->>'sourceRef') !~ '^[0-9a-fA-F-]{36}$' or jsonb_typeof(p_data->'sourceRef') is distinct from 'string'
   or jsonb_typeof(p_data->'sourceVersion') is distinct from 'string' or length(btrim(p_data->>'sourceVersion')) not between 1 and 200
   or jsonb_typeof(p_data->'outcome') is distinct from 'string' or length(p_data->>'outcome')>2000
   or (v_source='scenario' and (jsonb_typeof(p_data->'rubricVersion') is distinct from 'string' or length(btrim(p_data->>'rubricVersion')) not between 1 and 200)) then raise exception 'RF_INVALID_INPUT'; end if;
 end if;
end $$;
create or replace function public.profile_put_version(p_user uuid,p_id uuid,p_version integer,p_data jsonb,p_internal boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_source text:=p_data->>'source';
begin
 perform public.profile_validate_evidence(p_data,p_internal);
 insert into public.evidence_versions(evidence_id,user_id,version,label,context,observed_at,source_ref,source_version,rubric_version,outcome,review_state,dictionary_version)
 values(p_id,p_user,p_version,btrim(p_data->>'label'),btrim(p_data->>'context'),(p_data->>'observedAt')::timestamptz,
 case when p_internal then (p_data->>'sourceRef')::uuid end,case when p_internal then p_data->>'sourceVersion' else 'member-v1' end,
 case when p_internal then p_data->>'rubricVersion' end,case when p_internal then p_data->>'outcome' end,
 case when v_source='scenario' then 'scored' else 'unreviewed' end,case when p_internal then coalesce((p_data->>'dictionaryVersion')::bigint,public.dictionary_current_version()) else public.dictionary_current_version() end) returning id into v_id;
 insert into public.evidence_skill_links(evidence_version_id,skill_id) select v_id,jsonb_array_elements_text(p_data->'skills');
 if v_source='self-report' then insert into public.skill_claims values(v_id,(p_data->>'claimedLevel')::integer); end if;
 if v_source='portfolio-reference' then insert into public.portfolio_references values(v_id,p_data->>'url'); end if;
 return public.profile_evidence_json(v_id);
end $$;
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
  if p_data?'dictionaryVersion' and v_version.dictionary_version<>(p_data->>'dictionaryVersion')::bigint then raise exception 'RF_CONFLICT';end if;
  if (v_json - array['id','versionId','version','createdAt','reviewState','claimedLevel','url','dictionaryVersion','canonicalSkills','skillLabels']) is distinct from
   ((p_data-'dictionaryVersion') || jsonb_build_object('observedAt',to_jsonb((p_data->>'observedAt')::timestamptz),'skills',(select jsonb_agg(s order by s) from jsonb_array_elements_text(p_data->'skills') s))) then raise exception 'RF_CONFLICT'; end if;
  select revision into v_revision from public.career_preferences where user_id=p_user;
  return jsonb_build_object('evidence',v_json,'revision',v_revision);
 end if;
 insert into public.career_preferences(user_id) values(p_user) on conflict do nothing;
 insert into public.evidence(user_id,source) values(p_user,p_data->>'source') returning id into v_id;
 v_json:=public.profile_put_version(p_user,v_id,1,p_data,true);
 v_revision:=public.profile_bump(p_user,'evidence.changed',v_id);
 return jsonb_build_object('evidence',v_json,'revision',v_revision);
end $$;
create or replace function public.identity_deactivate_profile(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('identity:' || p_user::text, 0));
  update public.profiles set status = 'inactive' where user_id = p_user;
  update public.usage_reservations set state = 'released', updated_at = clock_timestamp() where user_id = p_user and state = 'reserved';
  update public.identity_task_outbox o set available = false where o.task_id in
    (select t.id from public.identity_tasks t where t.user_id = p_user and t.status in ('queued', 'running'));
  update public.identity_tasks set status = 'failed', result_ref = null, failure_category = 'deleted', finished_at = clock_timestamp()
    where user_id = p_user and status in ('queued', 'running');
  perform public.task_cancel_for_user(p_user);
end $$;
create function public.assessment_retry(p_id uuid,p_previous uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.identity_require_user();a public.assessment_attempts%rowtype;t public.tasks%rowtype;v_hash text;v_task uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||v_user::text,0));perform public.identity_require_user();
 select * into a from public.assessment_attempts where id=p_id and user_id=v_user for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if p_previous is null or p_key is null or length(p_key) not between 8 and 200 then raise exception 'RF_INVALID_INPUT';end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('attempt',p_id,'previous',p_previous,'operation','retry')::text,'sha256'),'hex');
 select * into t from public.tasks where user_id=v_user and kind='assessment.grade' and idempotency_key=p_key;
 if found then if t.request_hash<>v_hash or t.source_ref<>p_id then raise exception 'RF_CONFLICT';end if;return jsonb_build_object('taskId',t.id,'status',t.status);end if;
 if a.status<>'failed' or a.task_id is distinct from p_previous or not exists(select 1 from public.tasks where id=p_previous and status='failed' and safe_error='RF_RETRY_EXHAUSTED') then raise exception 'RF_CONFLICT';end if;
 v_task:=public.task_enqueue(v_user,'assessment.grade',p_id,(a.revision+1)::text,p_key,v_hash);update public.assessment_attempts set status='submitted',revision=revision+1,task_id=v_task where id=p_id;
 insert into public.assessment_audit(actor_id,action,resource_id) values(v_user,'assessment.retry.requested',p_id);return jsonb_build_object('taskId',v_task,'status','queued');
end $$;
revoke all on function public.assessment_retry(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.assessment_retry(uuid,uuid,text) to authenticated,service_role;
create function public.task_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then perform public.identity_require_admin();end if;
 return jsonb_build_object('queued',(select count(*) from public.tasks where status='queued'),'running',(select count(*) from public.tasks where status='running'),'failed',(select count(*) from public.tasks where status='failed'),'succeeded',(select count(*) from public.tasks where status='succeeded'),'expiredLeases',(select count(*) from public.tasks where status='running' and lease_expires_at<now()),'oldestQueueSeconds',coalesce((select greatest(0,extract(epoch from now()-min(created_at))) from public.tasks where status='queued'),0),'retryCount',(select coalesce(sum(greatest(0,attempt_count-1)),0) from public.tasks));
end $$;
revoke all on function public.task_metrics() from public,anon,authenticated;
grant execute on function public.task_metrics() to authenticated,service_role;
