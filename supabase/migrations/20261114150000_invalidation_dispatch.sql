-- Reference-only delivery, committed with producer writes. Privacy purges remain synchronous.
create table public.invalidation_deliveries (
 id uuid primary key default gen_random_uuid(),
 profile_event_id bigint references public.profile_change_outbox(id) on delete cascade,
 dictionary_version bigint references public.dictionary_change_outbox(version) on delete cascade,
 consumer text not null check(consumer in ('matching','learning','resume')),
 attempts bigint not null default 0 check(attempts>=0),
 available_at timestamptz not null default now(),
 lease_token uuid,lease_expires_at timestamptz,completed_at timestamptz,
 safe_error text check(safe_error='RF_UNAVAILABLE'),
 created_at timestamptz not null default now(),
 check(num_nonnulls(profile_event_id,dictionary_version)=1),
 check((lease_token is null)=(lease_expires_at is null)),
 unique(profile_event_id,consumer),unique(dictionary_version,consumer)
);
create index invalidation_pending on public.invalidation_deliveries(available_at,id) where completed_at is null;
alter table public.invalidation_deliveries enable row level security;
revoke all on public.invalidation_deliveries from public,anon,authenticated,service_role;

create function public.invalidation_enqueue_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.invalidation_deliveries(profile_event_id,consumer)
 select new.id,c from unnest(array['matching','learning','resume']) c;
 return new;
end $$;
create function public.invalidation_enqueue_dictionary() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.invalidation_deliveries(dictionary_version,consumer)
 select new.version,c from unnest(array['matching','learning','resume']) c;
 return new;
end $$;
create trigger invalidation_profile_created after insert on public.profile_change_outbox
 for each row execute function public.invalidation_enqueue_profile();
create trigger invalidation_dictionary_created after insert on public.dictionary_change_outbox
 for each row execute function public.invalidation_enqueue_dictionary();
-- Install triggers before catch-up; unique receipts avoid duplicates without a commit-order watermark.
insert into public.invalidation_deliveries(profile_event_id,consumer)
 select e.id,c from public.profile_change_outbox e cross join unnest(array['matching','learning','resume']) c on conflict do nothing;
insert into public.invalidation_deliveries(dictionary_version,consumer)
 select e.version,c from public.dictionary_change_outbox e cross join unnest(array['matching','learning','resume']) c on conflict do nothing;

-- Tasks own the terminal transition; consumers supply only their verified queued task IDs.
create function public.invalidation_cancel_tasks(p_ids uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare t uuid;n integer:=0;
begin
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'RF_INVALID_INPUT';end if;
 for t in update public.tasks set status='failed',safe_error='RF_STALE_INPUT',finished_at=clock_timestamp(),
  worker_id=null,lease_token=null,lease_expires_at=null
  where id=any(p_ids) and status='queued' and kind in ('matches.refresh','learning.plan','resume.revise') returning id
 loop
  insert into public.task_events(task_id,event,safe_code) values(t,'task.failed','RF_STALE_INPUT');n:=n+1;
 end loop;
 return n;
end $$;

-- Each consumer owns its source/version projection. Completed history and running leases survive.
create function public.matching_consume_invalidation(p_user uuid,p_revision bigint,p_dictionary bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];n integer;pending boolean;
begin
 if ((p_user is not null and p_revision>0 and p_dictionary is null) or (p_user is null and p_revision is null and p_dictionary>0)) is not true then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(array_agg(id),'{}') into ids from (
  select t.id from public.match_runs r join public.tasks t on t.id=r.task_id and t.source_ref=r.id and t.input_version=r.input_hash and t.kind='matches.refresh'
  where t.status='queued' and ((p_user is not null and r.user_id=p_user and r.profile_revision<p_revision) or (p_dictionary is not null and r.dictionary_version<p_dictionary))
  order by t.id limit 20 for update of t skip locked
 ) batch;
 n:=public.invalidation_cancel_tasks(ids);
 select exists(select 1 from public.match_runs r join public.tasks t on t.id=r.task_id and t.source_ref=r.id and t.input_version=r.input_hash and t.kind='matches.refresh'
  where t.status='queued' and ((p_user is not null and r.user_id=p_user and r.profile_revision<p_revision) or (p_dictionary is not null and r.dictionary_version<p_dictionary))) into pending;
 return jsonb_build_object('completed',not pending,'canceled',n);
end $$;
create function public.learning_consume_invalidation(p_user uuid,p_revision bigint,p_dictionary bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];n integer;pending boolean;
begin
 if ((p_user is not null and p_revision>0 and p_dictionary is null) or (p_user is null and p_revision is null and p_dictionary>0)) is not true then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(array_agg(id),'{}') into ids from (
  select t.id from public.learning_plans r join public.tasks t on t.id=r.task_id and t.source_ref=r.id and t.input_version=r.input_hash and t.kind='learning.plan'
  where t.status='queued' and ((p_user is not null and r.user_id=p_user and (r.input_snapshot->'matching'->>'profileRevision')::bigint<p_revision) or (p_dictionary is not null and (r.input_snapshot->'matching'->>'dictionaryVersion')::bigint<p_dictionary))
  order by t.id limit 20 for update of t skip locked
 ) batch;
 n:=public.invalidation_cancel_tasks(ids);
 select exists(select 1 from public.learning_plans r join public.tasks t on t.id=r.task_id and t.source_ref=r.id and t.input_version=r.input_hash and t.kind='learning.plan'
  where t.status='queued' and ((p_user is not null and r.user_id=p_user and (r.input_snapshot->'matching'->>'profileRevision')::bigint<p_revision) or (p_dictionary is not null and (r.input_snapshot->'matching'->>'dictionaryVersion')::bigint<p_dictionary))) into pending;
 return jsonb_build_object('completed',not pending,'canceled',n);
end $$;
create function public.resume_consume_invalidation(p_user uuid,p_revision bigint,p_dictionary bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];n integer;pending boolean;
begin
 if ((p_user is not null and p_revision>0 and p_dictionary is null) or (p_user is null and p_revision is null and p_dictionary>0)) is not true then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(array_agg(id),'{}') into ids from (
  select t.id from public.revision_proposals r join public.resume_documents d on d.id=r.document_id
  join public.tasks t on t.id=r.task_id and t.source_ref=r.id and t.input_version=r.input_hash and t.kind='resume.revise'
  where t.status='queued' and ((p_user is not null and d.user_id=p_user and r.profile_revision<p_revision) or (p_dictionary is not null and r.dictionary_version<p_dictionary))
  order by t.id limit 20 for update of t skip locked
 ) batch;
 n:=public.invalidation_cancel_tasks(ids);
 select exists(select 1 from public.revision_proposals r join public.resume_documents d on d.id=r.document_id
  join public.tasks t on t.id=r.task_id and t.source_ref=r.id and t.input_version=r.input_hash and t.kind='resume.revise'
  where t.status='queued' and ((p_user is not null and d.user_id=p_user and r.profile_revision<p_revision) or (p_dictionary is not null and r.dictionary_version<p_dictionary))) into pending;
 return jsonb_build_object('completed',not pending,'canceled',n);
end $$;

-- A bounded optional scope supports controlled operator/integration runs, never browser authority.
create function public.invalidation_claim(p_ids uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.invalidation_deliveries;token uuid;result jsonb:='[]';
begin
 if p_ids is not null and (cardinality(p_ids) not between 1 and 4 or array_position(p_ids,null) is not null) then raise exception 'RF_INVALID_INPUT';end if;
 for d in select * from public.invalidation_deliveries where completed_at is null and available_at<=clock_timestamp()
  and (lease_expires_at is null or lease_expires_at<=clock_timestamp()) and (p_ids is null or id=any(p_ids))
  order by available_at,id limit 4 for update skip locked
 loop
  token:=gen_random_uuid();
  update public.invalidation_deliveries set attempts=least(attempts+1,1000000000),lease_token=token,lease_expires_at=clock_timestamp()+interval '60 seconds' where id=d.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'token',token));
 end loop;
 return result;
end $$;
create function public.invalidation_apply(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.invalidation_deliveries;u uuid;r bigint;v bigint;result jsonb;
begin
 select * into d from public.invalidation_deliveries where id=p_id for update;
 if not found or p_token is null or d.completed_at is not null or d.lease_token is null or d.lease_expires_at is null or d.lease_token is distinct from p_token or d.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 if d.profile_event_id is not null then
  select user_id,revision into u,r from public.profile_change_outbox where id=d.profile_event_id;
 else select version into v from public.dictionary_change_outbox where version=d.dictionary_version;end if;
 case d.consumer
  when 'matching' then result:=public.matching_consume_invalidation(u,r,v);
  when 'learning' then result:=public.learning_consume_invalidation(u,r,v);
  when 'resume' then result:=public.resume_consume_invalidation(u,r,v);
  else raise exception 'RF_INVALID_INPUT';
 end case;
 if d.lease_expires_at<=clock_timestamp() then raise exception 'RF_CONFLICT';end if;
 update public.invalidation_deliveries set lease_token=null,lease_expires_at=null,safe_error=null,
  completed_at=case when (result->>'completed')::boolean then clock_timestamp() else null end,
  available_at=clock_timestamp()+interval '1 second' where id=d.id;
 return result;
end $$;
create function public.invalidation_retry(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.invalidation_deliveries set available_at=clock_timestamp()+make_interval(secs=>least(300,power(2,least(attempts,8))::integer)),
  lease_token=null,lease_expires_at=null,safe_error='RF_UNAVAILABLE'
 where id=p_id and lease_token=p_token and lease_expires_at>clock_timestamp() and completed_at is null;
 if not found then raise exception 'RF_CONFLICT';end if;
end $$;

do $$ declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
  'invalidation_enqueue_profile','invalidation_enqueue_dictionary','invalidation_cancel_tasks',
  'matching_consume_invalidation','learning_consume_invalidation','resume_consume_invalidation',
  'invalidation_claim','invalidation_apply','invalidation_retry'
 ) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f);end loop;
end $$;
grant execute on function public.invalidation_claim(uuid[]),public.invalidation_apply(uuid,uuid),public.invalidation_retry(uuid,uuid) to service_role;
