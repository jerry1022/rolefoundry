-- Optional AI wording suggestions on revision proposals. Suggestions never change a confirmed
-- version: the owner applies them to a draft and confirms through the existing flow, so facts
-- and claim histories stay owner-confirmed. The order recipe and its validation are unchanged.
alter table public.revision_proposals
  add column wording jsonb,
  add column wording_state text not null default 'not-requested'
    check (wording_state in ('not-requested', 'applied', 'fallback')),
  add column wording_code text check (wording_code ~ '^RF_[A-Z_]{2,60}$'),
  add column wording_task_id uuid unique references public.identity_tasks(id) on delete set null,
  add constraint revision_proposals_wording_consistent check (
    (wording_state = 'applied') = (wording is not null)
    and (wording_state = 'fallback') = (wording_code is not null));

-- Reservation lookup (created before the proposal, keyed by its request key) plus the target
-- role's published text, under the current lease.
create function public.resume_wording_context(p_task uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tasks := public.resume_task_lock(p_task, p_token); p public.revision_proposals%rowtype; v_user uuid; v_identity uuid; v_job jsonb;
begin
  if t.kind <> 'resume.revise' then raise exception 'RF_CONFLICT'; end if;
  select p1.* into p from public.revision_proposals p1 join public.resume_documents d on d.id = p1.document_id
    where p1.id = t.source_ref and d.user_id = t.user_id and d.deleted_at is null;
  if not found then raise exception 'RF_STALE_INPUT'; end if;
  v_user := t.user_id;
  select i.id into v_identity from public.identity_tasks i
    where i.user_id = v_user and i.feature = 'resume' and i.idempotency_key = 'resume-wording:' || p.request_key;
  if v_identity is null then return null; end if;
  v_job := public.matching_job_input(p.job_id);
  return jsonb_build_object('identityTaskId', v_identity, 'ownerId', v_user,
    'inputVersion', 'resume-wording-key:' || p.request_key,
    'jobTitle', coalesce(v_job->>'title', ''),
    'requirements', coalesce((select jsonb_agg(r->>'text') from jsonb_array_elements(v_job->'requirements') r), '[]'::jsonb));
end $$;

-- Structural validation of suggestions against the sealed version; semantic fact checks ran in
-- the gateway before publication.
create function public.resume_validate_wording(p_input jsonb, p_wording jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare s jsonb; v_seen text[] := '{}';
begin
  if jsonb_typeof(p_wording) <> 'array' or jsonb_array_length(p_wording) > 250 or octet_length(p_wording::text) > 524288 then
    raise exception 'RF_INVALID_INPUT';
  end if;
  for s in select value from jsonb_array_elements(p_wording) loop
    if not public.resume_keys(s, array['factId', 'text', 'rationale']) or not public.resume_strings(s, array['factId', 'text', 'rationale'])
      or s->>'factId' = any(v_seen) or not public.resume_text_valid(s->>'text', 4000) or not public.resume_text_valid(s->>'rationale', 300)
      or not exists (select 1 from jsonb_array_elements(p_input->'version'->'content'->'facts') f where f->>'id' = s->>'factId' and f->>'kind' <> 'contact')
    then raise exception 'RF_INVALID_INPUT'; end if;
    v_seen := array_append(v_seen, s->>'factId');
  end loop;
end $$;

-- Records wording metadata and publishes the order proposal in one transaction.
create function public.resume_revision_publish_worded(p_task uuid, p_token uuid, p_output jsonb, p_wording jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks := public.resume_task_lock(p_task, p_token); v_input jsonb; v_state text := p_wording->>'state';
  v_identity uuid; p public.revision_proposals%rowtype;
begin
  if jsonb_typeof(p_wording) <> 'object' or v_state not in ('not-requested', 'applied', 'fallback') then raise exception 'RF_INVALID_INPUT'; end if;
  v_input := public.resume_revision_load(p_task, p_token);
  if v_state = 'applied' then perform public.resume_validate_wording(v_input, p_wording->'suggestions'); end if;
  select * into p from public.revision_proposals where id = t.source_ref;
  if p_wording->>'identityTaskId' is not null then
    v_identity := (p_wording->>'identityTaskId')::uuid;
    if not exists (select 1 from public.identity_tasks i where i.id = v_identity and i.user_id = t.user_id and i.feature = 'resume'
      and i.idempotency_key = 'resume-wording:' || p.request_key) then raise exception 'RF_INVALID_INPUT'; end if;
  end if;
  update public.revision_proposals set
    wording = case when v_state = 'applied' then p_wording->'suggestions' end,
    wording_state = v_state,
    wording_code = case when v_state = 'fallback' then p_wording->>'code' end,
    wording_task_id = v_identity
  where id = t.source_ref and status = 'queued';
  perform public.resume_revision_publish(p_task, p_token, p_output);
exception when invalid_text_representation then raise exception 'RF_INVALID_INPUT';
end $$;

-- Extend the owner proposal read without copying its body.
alter function public.resume_proposal_find(uuid) rename to resume_proposal_find_base;
create function public.resume_proposal_find(p_id uuid) returns jsonb language sql security definer set search_path = '' as $$
  select base || jsonb_build_object('wording', jsonb_build_object('state', p.wording_state, 'code', p.wording_code,
    'suggestions', coalesce(p.wording, '[]'::jsonb)))
  from public.resume_proposal_find_base(p_id) base join public.revision_proposals p on p.id = p_id
$$;

revoke all on function public.resume_wording_context(uuid, uuid), public.resume_validate_wording(jsonb, jsonb),
  public.resume_revision_publish_worded(uuid, uuid, jsonb, jsonb), public.resume_proposal_find_base(uuid), public.resume_proposal_find(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resume_wording_context(uuid, uuid), public.resume_revision_publish_worded(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.resume_proposal_find(uuid) to authenticated;
