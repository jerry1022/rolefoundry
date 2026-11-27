-- Aggregate-only operational measurements. No subject/URL/body/request ID is stored.
create table public.telemetry_http (
 family text not null check(family in ('account.deletion','account.exports','admin.account-deletions','admin.assessments','admin.catalog','admin.courses','admin.imports','admin.operations','admin.skills','applications','assessments','bookmarks','courses','evidence','identity','jobs','learning-plans','learning-progress','matches','profile','resume-downloads','resume-exports','resume-revisions','resume-versions','resumes','skills','tasks')),
 method text not null check(method in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','OTHER')),
 status_class smallint not null check(status_class between 1 and 5),
 upper_ms integer not null check(upper_ms in (5,10,25,50,100,250,500,1000,2500,5000,10000,30000,2147483647)),
 samples bigint not null check(samples>=0),sum_ms bigint not null check(sum_ms>=0),
 primary key(family,method,status_class,upper_ms)
);
alter table public.telemetry_http enable row level security;
revoke all on public.telemetry_http from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.operations_snapshot_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_now timestamptz:=clock_timestamp();v_data jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'queued',queued,'ready',ready,'running',running,'failed24h',failed,'succeeded24h',succeeded,'retried24h',retried,'expiredLeases',expired,'oldestReadySeconds',oldest,'maxLeaseAgeSeconds',lease_age,'activeWorkers',workers) order by kind),'[]'::jsonb) into v_data
 from(select kind,
 (select count(*) from public.tasks t where t.kind=k.kind and status='queued') queued,
 (select count(*) from public.tasks t where t.kind=k.kind and status='queued' and next_run_at<=v_now) ready,
 (select count(*) from public.tasks t where t.kind=k.kind and status='running') running,
 (select count(*) from public.tasks t where t.kind=k.kind and status='failed' and finished_at>=v_now-interval '24 hours') failed,
 (select count(*) from public.tasks t where t.kind=k.kind and status='succeeded' and finished_at>=v_now-interval '24 hours') succeeded,
 (select count(*) from public.task_events e join public.tasks t on t.id=e.task_id where t.kind=k.kind and e.event='task.retry_scheduled' and e.created_at>=v_now-interval '24 hours') retried,
 (select count(*) from public.tasks t where t.kind=k.kind and status='running' and (lease_expires_at is null or lease_expires_at<=v_now)) expired,
 (select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(next_run_at))) end from public.tasks t where t.kind=k.kind and status='queued' and next_run_at<=v_now) oldest,
 (select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(coalesce(heartbeat_at,started_at,created_at)))) end from public.tasks t where t.kind=k.kind and status='running') lease_age,
 (select count(*) from public.worker_instances w where w.state='active' and w.last_seen_at>=v_now-interval '45 seconds' and k.kind=any(w.kinds)) workers
 from unnest(array['assessment.grade','matches.refresh','learning.plan','resume.parse','resume.revise','resume.export','catalog.import','catalog.fetch','account.delete','account.export']) k(kind)) counts;
 return jsonb_build_object('observedAt',v_now,'workerFreshSeconds',45,'kinds',v_data,'deliveryCount',(select count(*) from pgmq.q_rolefoundry_tasks),'poison24h',(select count(*) from public.task_events where event='queue.poison' and created_at>=v_now-interval '24 hours'));
end $function$;

create or replace function public.operations_summary() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.operations_admin_lock('summary.read');return public.operations_snapshot_data();end $$;
create function public.telemetry_record_http(p_family text,p_method text,p_status integer,p_duration_ms integer) returns void language plpgsql security definer set search_path='' as $$
declare v_upper integer;
begin
 if p_family is null or p_family not in ('account.deletion','account.exports','admin.account-deletions','admin.assessments','admin.catalog','admin.courses','admin.imports','admin.operations','admin.skills','applications','assessments','bookmarks','courses','evidence','identity','jobs','learning-plans','learning-progress','matches','profile','resume-downloads','resume-exports','resume-revisions','resume-versions','resumes','skills','tasks') or p_method is null or p_method not in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','OTHER') or p_status is null or p_status not between 100 and 599 or p_duration_ms is null or p_duration_ms not between 0 and 300000 then raise exception 'RF_INVALID_INPUT';end if;
 select min(bound) into v_upper from unnest(array[5,10,25,50,100,250,500,1000,2500,5000,10000,30000,2147483647]) bound where bound>=p_duration_ms;
 insert into public.telemetry_http(family,method,status_class,upper_ms,samples,sum_ms) values(p_family,p_method,p_status/100,v_upper,1,p_duration_ms)
 on conflict(family,method,status_class,upper_ms) do update set samples=public.telemetry_http.samples+1,sum_ms=public.telemetry_http.sum_ms+excluded.sum_ms;
end $$;
create function public.telemetry_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_operations jsonb:=public.operations_snapshot_data();v_now timestamptz:=clock_timestamp();
begin
 return jsonb_build_object('observedAt',v_operations->'observedAt','operations',v_operations,
 'http',(select coalesce(jsonb_agg(jsonb_build_object('family',family,'method',method,'statusClass',status_class,'upperMs',upper_ms,'count',samples::text,'sumMs',sum_ms::text) order by family,method,status_class,upper_ms),'[]') from public.telemetry_http),
 'invalidations',(select jsonb_agg(jsonb_build_object('consumer',c,'pending',(select count(*) from public.invalidation_deliveries d where d.consumer=c and completed_at is null),'leased',(select count(*) from public.invalidation_deliveries d where d.consumer=c and completed_at is null and lease_expires_at>v_now),'retrying',(select count(*) from public.invalidation_deliveries d where d.consumer=c and completed_at is null and safe_error is not null),'oldestSeconds',(select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(created_at))) end from public.invalidation_deliveries d where d.consumer=c and completed_at is null)) order by c) from unnest(array['matching','learning','resume']) c),
 'sources',jsonb_build_array(
  jsonb_build_object('catalog','jobs','published',(select count(*) from public.jobs where status='published'),
   'unreviewed',(select count(*) from public.jobs j where j.status='published' and not exists(select 1 from public.job_sources s where s.job_id=j.id and s.last_validated_at is not null)),
   'uncertain',(select count(*) from public.jobs j where j.status='published' and exists(select 1 from public.job_sources s where s.job_id=j.id and s.freshness='uncertain')),
   'unavailable',(select count(*) from public.jobs j where j.status='published' and not public.catalog_job_visible(j.id)),
   'oldestReviewSeconds',(select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(s.last_validated_at))) end from public.jobs j join public.job_sources s on s.job_id=j.id where j.status='published' and s.last_validated_at is not null)),
  jsonb_build_object('catalog','courses','published',(select count(*) from public.courses where published_version is not null),
   'unreviewed',(select count(*) from public.courses where published_version is not null and last_reviewed_at is null),
   'uncertain',(select count(*) from public.courses c where c.published_version is not null and not c.retired and (c.availability='uncertain' or c.last_reviewed_at is null or c.last_reviewed_at<v_now-interval '90 days')),
   'unavailable',(select count(*) from public.courses c where c.published_version is not null and not public.learning_course_visible(c.id)),
   'oldestReviewSeconds',(select case when count(*)=0 then null else greatest(0,extract(epoch from v_now-min(last_reviewed_at))) end from public.courses where published_version is not null and last_reviewed_at is not null))
 ));
end $$;
revoke all on function public.operations_snapshot_data(),public.telemetry_record_http(text,text,integer,integer),public.telemetry_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.telemetry_record_http(text,text,integer,integer),public.telemetry_snapshot() to service_role;
