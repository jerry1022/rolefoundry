-- Course link checker hardening after review: unprobeable URLs are not claimed, provider waits
-- are capped, only missing pages change availability, claims back off and resume audits name the host.
create or replace function public.course_links_claim(p_source uuid,p_hosts text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.courses%rowtype;v public.course_versions%rowtype;q public.course_link_checks%rowtype;v_now timestamptz:=clock_timestamp();
begin
 if p_source is null or p_hosts is null or cardinality(p_hosts) not between 1 and 20 or array_position(p_hosts,null) is not null or (select count(distinct x) from unnest(p_hosts) x)<>cardinality(p_hosts) then raise exception 'RF_INVALID_INPUT';end if;
 if not exists(select 1 from public.sources s join public.course_source_providers sp on sp.source_id=s.id join public.course_providers p on p.id=sp.provider_id where s.id=p_source and s.status='active' and p_hosts<@s.allowed_hosts and p_hosts<@p.allowed_hosts) then return null;end if;
 insert into public.course_link_hosts(hostname) select x from unnest(p_hosts) x order by x on conflict do nothing;
 perform 1 from public.course_link_hosts where hostname=any(p_hosts) order by hostname for update;
 if exists(select 1 from public.course_link_hosts where hostname=any(p_hosts) and (manual_pause or next_probe_at>v_now)) then return null;end if;
 select courses.* into c from public.courses courses join public.course_versions cv on cv.course_id=courses.id and cv.version=courses.published_version left join public.course_link_checks checks on checks.course_id=courses.id
 where cv.source_id=p_source and not courses.retired and public.learning_valid_source(cv.source_id,courses.provider_id,cv.metadata->>'url')
 and lower(substring(cv.metadata->>'url' from '^https://([^/]+)'))=any(p_hosts)
 -- Query strings, fragments, backslashes and control characters are never probed.
 and cv.metadata->>'url' !~ '[?#\\[:cntrl:]]'
 and (checks.lease_token is null or checks.lease_expires_at<=v_now)
 and (checks.course_id is null or checks.version_id<>cv.id or checks.course_revision<>courses.revision or checks.next_check_at<=v_now or checks.lease_expires_at<=v_now)
 order by coalesce(checks.next_check_at,courses.created_at),courses.id limit 1 for update of courses skip locked;
 if not found then return null;end if;
 select * into v from public.course_versions where course_id=c.id and version=c.published_version;
 insert into public.course_link_checks(course_id,version_id,course_revision,allowed_hosts,lease_token,lease_expires_at)
 values(c.id,v.id,c.revision,p_hosts,gen_random_uuid(),v_now+interval '30 seconds')
 on conflict(course_id) do update set next_check_at=v_now+interval '10 minutes',version_id=excluded.version_id,course_revision=excluded.course_revision,allowed_hosts=excluded.allowed_hosts,lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at,
 reason=case when course_link_checks.version_id=excluded.version_id then course_link_checks.reason else 'unknown' end,
 checked_at=case when course_link_checks.version_id=excluded.version_id then course_link_checks.checked_at else null end,
 http_status=case when course_link_checks.version_id=excluded.version_id then course_link_checks.http_status else null end returning * into q;
 update public.course_link_hosts set next_probe_at=v_now+interval '60 seconds',revision=revision+1 where hostname=any(p_hosts);
 return jsonb_build_object('id',c.id,'versionId',v.id,'revision',c.revision,'lease',q.lease_token,'url',v.metadata->>'url','allowedHosts',to_jsonb(p_hosts));
end $$;
create or replace function public.course_links_complete(p_course uuid,p_lease uuid,p_reason text,p_status integer,p_not_before timestamptz,p_manual boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.courses%rowtype;v public.course_versions%rowtype;q public.course_link_checks%rowtype;v_hosts text[];v_now timestamptz:=clock_timestamp();
begin
 if p_course is null or p_lease is null or p_reason is null or p_reason not in ('ok','not-found','rate-limit','unsupported','access-denied','redirect','blocked','timeout','network','http-error','server-error','invalid-response') or p_manual is null or (p_status is not null and p_status not between 100 and 599) or (p_reason='ok' and (p_status is null or p_status not between 200 and 299)) or ((p_manual or p_not_before is not null) and p_reason not in ('rate-limit','server-error')) or (p_not_before is not null and (not isfinite(p_not_before) or p_not_before>'9999-12-31T23:59:59Z'::timestamptz)) then raise exception 'RF_INVALID_INPUT';end if;
 -- Same publication lock as human edits, followed by sorted host/course/check locks.
 perform pg_advisory_xact_lock_shared(hashtextextended('dictionary:write',0));
 perform pg_advisory_xact_lock(hashtextextended('courses:write',0));
 select allowed_hosts into v_hosts from public.course_link_checks where course_id=p_course and lease_token=p_lease;
 if not found then return false;end if;
 perform 1 from public.course_link_hosts where hostname=any(v_hosts) order by hostname for update;
 select * into c from public.courses where id=p_course for update;
 select * into q from public.course_link_checks where course_id=p_course for update;
 if q.lease_token is distinct from p_lease or q.lease_expires_at<=v_now then return false;end if;
 select * into v from public.course_versions where course_id=c.id and version=c.published_version;
 if c.retired or c.revision<>q.course_revision or v.id is distinct from q.version_id or not public.learning_valid_source(v.source_id,c.provider_id,v.metadata->>'url') then
  update public.course_link_checks set lease_token=null,lease_expires_at=null,next_check_at=v_now+interval '1 hour' where course_id=p_course;return false;
 end if;
 -- Waits beyond seven days need an operator: they become a clearable manual pause.
 if p_not_before>v_now+interval '7 days' then p_not_before:=null;p_manual:=true;end if;
 update public.course_link_checks set checked_at=v_now,reason=p_reason,http_status=p_status,lease_token=null,lease_expires_at=null,next_check_at=greatest(v_now+interval '24 hours',p_not_before) where course_id=p_course;
 update public.course_link_hosts set next_probe_at=greatest(next_probe_at,v_now+interval '60 seconds',p_not_before),manual_pause=manual_pause or p_manual,revision=revision+1 where hostname=any(v_hosts);
 -- Only a missing page is evidence of breakage; checker-side failures stay observations.
 if p_reason='not-found' and c.availability='available' then
  update public.courses set availability='uncertain',revision=revision+1 where id=p_course;
  -- Bind this observation to the resulting revision so it does not requeue itself.
  update public.course_link_checks set course_revision=c.revision+1 where course_id=p_course;
  perform public.learning_catalog_touch(null,'course.link_uncertain',p_course,'Automated HEAD observation requires review: '||p_reason);
 end if;
 return true;
end $$;
create or replace function public.course_links_resume(p_host text,p_expected bigint,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.learning_admin_lock();h public.course_link_hosts%rowtype;
begin
 if p_host is null or p_expected is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT';end if;
 select * into h from public.course_link_hosts where hostname=p_host for update;
 if not found then raise exception 'RF_NOT_FOUND';end if;
 if h.revision<>p_expected or not h.manual_pause then raise exception 'RF_CONFLICT';end if;
 update public.course_link_hosts set manual_pause=false,revision=revision+1 where hostname=p_host;
 -- A manual pause may be cleared, but a known provider wait is never shortened.
 insert into public.course_audit(actor_id,action,reason) values(v_actor,'course.links_resume',p_host||': '||btrim(p_reason));
end $$;
