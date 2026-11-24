-- Reviewed per-locale job text. A translation belongs to one immutable job version, so a later
-- revision hides it until it is reviewed again; readers never see text that describes an older
-- version. Only fields that the version itself publishes (and its sources therefore permit) can
-- be translated: title, summary and responsibilities.
create table public.job_version_translations (
  job_version_id uuid not null references public.job_versions(id) on delete cascade,
  locale text not null check (locale in ('zh-TW')),
  title text not null check (length(btrim(title)) between 1 and 200),
  summary text not null check (length(btrim(summary)) between 1 and 3000),
  responsibilities text[] not null check (cardinality(responsibilities) <= 15),
  review_note text not null check (length(btrim(review_note)) between 1 and 1000),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz not null default now(),
  primary key (job_version_id, locale)
);
alter table public.job_version_translations enable row level security;
revoke all on public.job_version_translations from public, anon, authenticated;
grant all on public.job_version_translations to service_role;

create function public.catalog_put_translation(p_job uuid, p_version uuid, p_locale text, p_data jsonb) returns jsonb
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
  perform public.catalog_touch(v_actor, 'job.translated', p_job);
  return jsonb_build_object('id', p_job, 'versionId', v_version.id, 'locale', p_locale);
end $$;

create function public.catalog_remove_translation(p_job uuid, p_version uuid, p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.catalog_lock();
begin
  delete from public.job_version_translations t using public.job_versions v
    where t.job_version_id = v.id and v.job_id = p_job and v.id = p_version and t.locale = p_locale;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  perform public.catalog_touch(v_actor, 'job.translation_removed', p_job);
end $$;

-- Extends the localized wrapper from 20261114300000 with the current version's translations.
create or replace function public.catalog_job_json(p_job uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b is null then null else b
    || jsonb_build_object('requirements', coalesce((
      select jsonb_agg(r || jsonb_build_object('skillLabelsZhTw', public.dictionary_labels_zh_at(
        array(select jsonb_array_elements_text(coalesce(r->'skills', '[]'::jsonb))), (b->>'dictionaryVersion')::bigint)) order by n)
      from jsonb_array_elements(coalesce(b->'requirements', '[]'::jsonb)) with ordinality as item(r, n)), '[]'::jsonb))
    || jsonb_build_object('translations', coalesce((
      select jsonb_object_agg(t.locale, jsonb_build_object('title', t.title, 'summary', t.summary,
        'responsibilities', to_jsonb(t.responsibilities), 'reviewedAt', t.reviewed_at))
      from public.job_version_translations t where t.job_version_id = (b->>'versionId')::uuid), '{}'::jsonb)) end
  from (select public.catalog_job_json_base(p_job) as b) base
$$;

do $$ declare f text; begin
  foreach f in array array['public.catalog_put_translation(uuid,uuid,text,jsonb)', 'public.catalog_remove_translation(uuid,uuid,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
