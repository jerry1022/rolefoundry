-- Reviewed per-locale course text, bound to the published course version like job translations.
-- Official course titles stay in the provider's language because they name the linked page;
-- only RoleFoundry's editorial text is translated: the summary and the practice prompt and
-- completion criteria.
create table public.course_version_translations (
  course_version_id uuid not null references public.course_versions(id) on delete cascade,
  locale text not null check (locale in ('zh-TW')),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  practice_prompt text not null check (length(btrim(practice_prompt)) between 1 and 1000),
  completion_criteria text not null check (length(btrim(completion_criteria)) between 1 and 1000),
  review_note text not null check (length(btrim(review_note)) between 1 and 1000),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz not null default now(),
  primary key (course_version_id, locale)
);
alter table public.course_version_translations enable row level security;
revoke all on public.course_version_translations from public, anon, authenticated;
grant all on public.course_version_translations to service_role;

create function public.learning_course_translate(p_course uuid, p_version uuid, p_locale text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.learning_admin_lock(); v_version uuid;
begin
  select v.id into v_version from public.courses c join public.course_versions v on v.course_id = c.id and v.version = c.published_version
    where c.id = p_course and not c.retired;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  -- Review applies to the version the administrator saw; a newer publication must be reviewed again.
  if p_version is distinct from v_version then raise exception 'RF_CONFLICT'; end if;
  if p_locale is distinct from 'zh-TW' or jsonb_typeof(p_data) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_data)) <> 4
    or not p_data ?& array['summary', 'practicePrompt', 'completionCriteria', 'reviewNote']
    or exists (select 1 from jsonb_each(p_data) e where jsonb_typeof(e.value) <> 'string')
    or length(btrim(p_data->>'summary')) not between 1 and 2000
    or length(btrim(p_data->>'practicePrompt')) not between 1 and 1000
    or length(btrim(p_data->>'completionCriteria')) not between 1 and 1000
    or length(btrim(p_data->>'reviewNote')) not between 1 and 1000
  then raise exception 'RF_INVALID_INPUT'; end if;
  insert into public.course_version_translations(course_version_id, locale, summary, practice_prompt, completion_criteria, review_note, reviewed_by)
  values (v_version, p_locale, btrim(p_data->>'summary'), btrim(p_data->>'practicePrompt'), btrim(p_data->>'completionCriteria'), btrim(p_data->>'reviewNote'), v_actor)
  on conflict (course_version_id, locale) do update set summary = excluded.summary, practice_prompt = excluded.practice_prompt,
    completion_criteria = excluded.completion_criteria, review_note = excluded.review_note, reviewed_by = excluded.reviewed_by, reviewed_at = now();
  perform public.learning_catalog_touch(v_actor, 'course.translated', p_course, btrim(p_data->>'reviewNote'));
  return jsonb_build_object('id', p_course, 'versionId', v_version, 'locale', p_locale);
end $$;

create function public.learning_course_untranslate(p_course uuid, p_version uuid, p_locale text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.learning_admin_lock();
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT'; end if;
  delete from public.course_version_translations t using public.course_versions v
    where t.course_version_id = v.id and v.course_id = p_course and v.id = p_version and t.locale = p_locale;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform public.learning_catalog_touch(v_actor, 'course.translation_removed', p_course, btrim(p_reason));
end $$;

-- Public course JSON gains the published version's translations. The reviewed body is kept
-- under a `_base` name rather than restated.
alter function public.learning_course_json(uuid, boolean) rename to learning_course_json_base;
create function public.learning_course_json(p_id uuid, p_history boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b is null then null else b || jsonb_build_object('translations', coalesce((
    select jsonb_object_agg(t.locale, jsonb_build_object('summary', t.summary, 'practicePrompt', t.practice_prompt,
      'completionCriteria', t.completion_criteria, 'reviewedAt', t.reviewed_at))
    from public.course_version_translations t where t.course_version_id = (b->>'versionId')::uuid), '{}'::jsonb)) end
  from (select public.learning_course_json_base(p_id, p_history) as b) base
$$;

do $$ declare f text; begin
  foreach f in array array['public.learning_course_json(uuid,boolean)', 'public.learning_course_json_base(uuid,boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.learning_course_translate(uuid,uuid,text,jsonb)', 'public.learning_course_untranslate(uuid,uuid,text,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
