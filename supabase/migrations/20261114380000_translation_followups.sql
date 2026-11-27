-- Review follow-ups for reviewed translations (20261114320000, 20261114330000):
-- * Saving or removing display text writes the audit row directly instead of bumping the catalog
--   or course revision, which would mark every owner's match reports and learning plans stale.
--   Question translations already behaved this way. Search results can change without a
--   revision bump; that only affects ordering of an in-flight page, never correctness.
-- * Removing a job translation now requires a reason, like course and question translations.
-- Catalog audit rows can carry a reason, like course and assessment audit rows.
alter table public.catalog_audit add column reason text check (reason is null or length(reason) between 1 and 1000);

create or replace function public.catalog_put_translation(p_job uuid, p_version uuid, p_locale text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.catalog_lock(); v_version public.job_versions%rowtype; v_items text[];
begin
  select v.* into v_version from public.job_versions v join public.jobs j on j.id = v.job_id and j.current_version = v.version
    where j.id = p_job;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  -- The administrator reviewed a specific version; a newer revision must be reviewed again.
  if p_version is distinct from v_version.id then raise exception 'RF_CONFLICT'; end if;
  if p_locale is distinct from 'zh-TW' or jsonb_typeof(p_data) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_data)) <> 4
    or not p_data ?& array['title', 'summary', 'responsibilities', 'reviewNote']
    or jsonb_typeof(p_data->'title') <> 'string' or jsonb_typeof(p_data->'summary') <> 'string'
    or jsonb_typeof(p_data->'reviewNote') <> 'string' or jsonb_typeof(p_data->'responsibilities') <> 'array'
    or exists (select 1 from jsonb_array_elements(p_data->'responsibilities') r
      where jsonb_typeof(r) <> 'string' or length(btrim(r #>> '{}')) not between 1 and 1000)
  then raise exception 'RF_INVALID_INPUT'; end if;
  v_items := array(select btrim(r) from jsonb_array_elements_text(p_data->'responsibilities') with ordinality as t(r, n) order by n);
  -- One translated line per published responsibility keeps the two lists aligned.
  if cardinality(v_items) <> cardinality(v_version.responsibilities)
    or length(btrim(p_data->>'title')) not between 1 and 200 or length(btrim(p_data->>'summary')) not between 1 and 3000
    or length(btrim(p_data->>'reviewNote')) not between 1 and 1000
  then raise exception 'RF_INVALID_INPUT'; end if;
  insert into public.job_version_translations(job_version_id, locale, title, summary, responsibilities, review_note, reviewed_by)
  values (v_version.id, p_locale, btrim(p_data->>'title'), btrim(p_data->>'summary'), v_items, btrim(p_data->>'reviewNote'), v_actor)
  on conflict (job_version_id, locale) do update set title = excluded.title, summary = excluded.summary,
    responsibilities = excluded.responsibilities, review_note = excluded.review_note,
    reviewed_by = excluded.reviewed_by, reviewed_at = now();
  -- Audit only: display text must not bump the catalog revision that marks reports and plans stale.
  insert into public.catalog_audit(actor_id, action, resource_id, reason) values (v_actor, 'job.translated', p_job, btrim(p_data->>'reviewNote'));
  return jsonb_build_object('id', p_job, 'versionId', v_version.id, 'locale', p_locale);
end $$;

create or replace function public.learning_course_translate(p_course uuid, p_version uuid, p_locale text, p_data jsonb) returns jsonb
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
  insert into public.course_audit(actor_id, action, resource_id, reason) values (v_actor, 'course.translated', p_course, btrim(p_data->>'reviewNote'));
  return jsonb_build_object('id', p_course, 'versionId', v_version, 'locale', p_locale);
end $$;

create or replace function public.learning_course_untranslate(p_course uuid, p_version uuid, p_locale text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.learning_admin_lock();
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT'; end if;
  delete from public.course_version_translations t using public.course_versions v
    where t.course_version_id = v.id and v.course_id = p_course and v.id = p_version and t.locale = p_locale;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  insert into public.course_audit(actor_id, action, resource_id, reason) values (v_actor, 'course.translation_removed', p_course, btrim(p_reason));
end $$;

drop function public.catalog_remove_translation(uuid, uuid, text);
create function public.catalog_remove_translation(p_job uuid, p_version uuid, p_locale text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.catalog_lock();
begin
  if p_locale is distinct from 'zh-TW' or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'RF_INVALID_INPUT';
  end if;
  delete from public.job_version_translations t using public.job_versions v
    where t.job_version_id = v.id and v.job_id = p_job and v.id = p_version and t.locale = p_locale;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  insert into public.catalog_audit(actor_id, action, resource_id, reason) values (v_actor, 'job.translation_removed', p_job, btrim(p_reason));
end $$;
revoke all on function public.catalog_remove_translation(uuid, uuid, text, text) from public, anon;
grant execute on function public.catalog_remove_translation(uuid, uuid, text, text) to authenticated, service_role;
