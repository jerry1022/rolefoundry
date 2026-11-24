-- Reviewed Traditional Chinese skill labels for learner-facing JSON. Labels come from the same
-- pinned dictionary snapshot as `skillLabels`, so a published record never changes language
-- content behind its version. A missing reviewed translation falls back to the English name.
create function public.dictionary_labels_zh_at(p_ids text[], p_version bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s->>'id', coalesce(nullif(btrim(s->>'nameZhTw'), ''), s->>'nameEn')), '{}'::jsonb)
  from public.dictionary_versions v cross join lateral jsonb_array_elements(v.snapshot->'skills') s
  where v.version = p_version and s->>'id' = any(p_ids)
$$;

-- Each producer keeps its reviewed body under a `_base` name and gains a thin wrapper, so this
-- migration does not restate large SQL bodies. SQL and PL/pgSQL callers resolve the public name
-- at execution time and therefore receive the localized form.
alter function public.profile_evidence_json(uuid) rename to profile_evidence_json_base;
create function public.profile_evidence_json(p_version uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select b || jsonb_build_object('skillLabelsZhTw', public.dictionary_labels_zh_at(
    array(select jsonb_array_elements_text(coalesce(b->'skills', '[]'::jsonb))), (b->>'dictionaryVersion')::bigint))
  from (select public.profile_evidence_json_base(p_version) as b) base
$$;

alter function public.catalog_job_json(uuid) rename to catalog_job_json_base;
create function public.catalog_job_json(p_job uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b is null then null else b || jsonb_build_object('requirements', coalesce((
    select jsonb_agg(r || jsonb_build_object('skillLabelsZhTw', public.dictionary_labels_zh_at(
      array(select jsonb_array_elements_text(coalesce(r->'skills', '[]'::jsonb))), (b->>'dictionaryVersion')::bigint)) order by n)
    from jsonb_array_elements(coalesce(b->'requirements', '[]'::jsonb)) with ordinality as item(r, n)), '[]'::jsonb)) end
  from (select public.catalog_job_json_base(p_job) as b) base
$$;

alter function public.assessment_attempt_json(uuid) rename to assessment_attempt_json_base;
create function public.assessment_attempt_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b is null or jsonb_typeof(b->'items') is distinct from 'array' then b else b || jsonb_build_object('items', (
    select jsonb_agg(i || jsonb_build_object('skillLabelZhTw', coalesce(
      public.dictionary_labels_zh_at(array[i->>'skillId'], (i->>'dictionaryVersion')::bigint)->>(i->>'skillId'), i->>'skillLabel')) order by n)
    from jsonb_array_elements(b->'items') with ordinality as item(i, n))) end
  from (select public.assessment_attempt_json_base(p_id) as b) base
$$;

-- Replay comparison must ignore the derived label map like the other derived keys.
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
  if (v_json - array['id','versionId','version','createdAt','reviewState','claimedLevel','url','dictionaryVersion','canonicalSkills','skillLabels','skillLabelsZhTw']) is distinct from
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

do $$ declare f text; begin
  foreach f in array array[
    'public.dictionary_labels_zh_at(text[],bigint)',
    'public.profile_evidence_json(uuid)', 'public.profile_evidence_json_base(uuid)',
    'public.catalog_job_json(uuid)', 'public.catalog_job_json_base(uuid)',
    'public.assessment_attempt_json(uuid)', 'public.assessment_attempt_json_base(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
