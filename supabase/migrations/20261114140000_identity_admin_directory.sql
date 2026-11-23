-- Bounded, minimized administrative reads and unused-invitation revocation.
create index invitations_admin_page on public.invitations(created_at desc,id desc);
create function public.identity_admin_invitations(p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_admin();rows jsonb;last_time timestamptz;last_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_admin();
 if (p_before is null)<>(p_id is null) then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'expiresAt',expires_at,'createdAt',created_at,'status',case when used_at is not null then 'redeemed' when expires_at<=clock_timestamp() then 'expired' else 'available' end) order by created_at desc,id desc),'[]'::jsonb),(array_agg(created_at order by created_at desc,id desc))[20],(array_agg(id order by created_at desc,id desc))[20] into rows,last_time,last_id
 from(select id,expires_at,created_at,used_at from public.invitations where p_before is null or (created_at,id)<(p_before,p_id) order by created_at desc,id desc limit 20) page;
 insert into public.identity_audit(actor_id,action) values(u,'invitations.listed');
 return jsonb_build_object('data',rows,'next',case when last_id is not null and exists(select 1 from public.invitations where (created_at,id)<(last_time,last_id)) then jsonb_build_object('createdAt',last_time,'id',last_id) else null end);
end $$;
create function public.identity_admin_quota_policies(p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_admin();rows jsonb;last_id bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_admin();
 if p_before is not null and p_before<1 then raise exception 'RF_INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'feature',feature,'limit',weekly_limit,'effectiveFrom',effective_from,'createdAt',created_at) order by id desc),'[]'::jsonb),min(id) into rows,last_id from(select * from public.quota_policies where p_before is null or id<p_before order by id desc limit 20) page;
 insert into public.identity_audit(actor_id,action) values(u,'quota.policies.listed');
 return jsonb_build_object('data',rows,'next',case when exists(select 1 from public.quota_policies where id<last_id) then last_id::text else null end);
end $$;
create function public.identity_revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.identity_require_admin();i public.invitations%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('identity:'||u::text,0));perform public.identity_require_admin();
 select * into i from public.invitations where id=p_id for update;if not found then raise exception 'RF_NOT_FOUND';end if;
 if i.used_at is not null then raise exception 'RF_CONFLICT';end if;
 if i.expires_at<=clock_timestamp() then return;end if;
 update public.invitations set expires_at=clock_timestamp() where id=i.id;
 insert into public.identity_audit(actor_id,action,resource_id) values(u,'invitation.revoked',i.id);
end $$;
revoke all on function public.identity_admin_invitations(timestamptz,uuid),public.identity_admin_quota_policies(bigint),public.identity_revoke_invitation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.identity_admin_invitations(timestamptz,uuid),public.identity_admin_quota_policies(bigint),public.identity_revoke_invitation(uuid) to authenticated;
