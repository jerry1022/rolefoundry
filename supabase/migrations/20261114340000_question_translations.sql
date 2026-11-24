-- Reviewed per-locale question text. Question versions are immutable and attempts reference the
-- exact version, so a translation keys on the version itself. Options keep their order and count,
-- so `correct_index` and grading are unchanged. The translated explanation reveals the answer and
-- is exposed only for completed attempts, matching the source explanation.
create table public.question_version_translations (
  question_version_id uuid not null references public.question_versions(id) on delete cascade,
  locale text not null check (locale in ('zh-TW')),
  prompt text not null check (length(btrim(prompt)) between 1 and 3000),
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  explanation text not null check (length(btrim(explanation)) between 1 and 3000),
  review_note text not null check (length(btrim(review_note)) between 1 and 1000),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz not null default now(),
  primary key (question_version_id, locale)
);
alter table public.question_version_translations enable row level security;
revoke all on public.question_version_translations from public, anon, authenticated;
grant all on public.question_version_translations to service_role;

create function public.assessment_question_translate(p_id uuid, p_locale text, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.catalog_lock(); v_question public.question_versions%rowtype;
begin
  select * into v_question from public.question_versions where id = p_id;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  if p_locale is distinct from 'zh-TW' or jsonb_typeof(p_data) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_data)) <> 4
    or not p_data ?& array['prompt', 'options', 'explanation', 'reviewNote']
    or jsonb_typeof(p_data->'prompt') <> 'string' or jsonb_typeof(p_data->'explanation') <> 'string'
    or jsonb_typeof(p_data->'reviewNote') <> 'string' or jsonb_typeof(p_data->'options') <> 'array'
    -- One translated option per source option, in the same order, so the answer key still applies.
    or jsonb_array_length(p_data->'options') <> jsonb_array_length(v_question.options)
    or exists (select 1 from jsonb_array_elements(p_data->'options') o
      where jsonb_typeof(o) <> 'string' or length(btrim(o #>> '{}')) not between 1 and 1000)
    or length(btrim(p_data->>'prompt')) not between 1 and 3000
    or length(btrim(p_data->>'explanation')) not between 1 and 3000
    or length(btrim(p_data->>'reviewNote')) not between 1 and 1000
  then raise exception 'RF_INVALID_INPUT'; end if;
  insert into public.question_version_translations(question_version_id, locale, prompt, options, explanation, review_note, reviewed_by)
  values (p_id, p_locale, btrim(p_data->>'prompt'),
    (select jsonb_agg(btrim(o) order by n) from jsonb_array_elements_text(p_data->'options') with ordinality as t(o, n)),
    btrim(p_data->>'explanation'), btrim(p_data->>'reviewNote'), v_actor)
  on conflict (question_version_id, locale) do update set prompt = excluded.prompt, options = excluded.options,
    explanation = excluded.explanation, review_note = excluded.review_note, reviewed_by = excluded.reviewed_by, reviewed_at = now();
  insert into public.assessment_audit(actor_id, action, resource_id, reason) values (v_actor, 'question.translated', p_id, btrim(p_data->>'reviewNote'));
end $$;

create function public.assessment_question_untranslate(p_id uuid, p_locale text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.catalog_lock();
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'RF_INVALID_INPUT'; end if;
  delete from public.question_version_translations where question_version_id = p_id and locale = p_locale;
  if not found then raise exception 'RF_NOT_FOUND'; end if;
  insert into public.assessment_audit(actor_id, action, resource_id, reason) values (v_actor, 'question.translation_removed', p_id, btrim(p_reason));
end $$;

-- Translation map for one question; the explanation only when the caller may see answers.
create function public.question_translations_json(p_id uuid, p_with_explanation boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.locale, jsonb_build_object('prompt', t.prompt, 'options', t.options, 'reviewedAt', t.reviewed_at)
    || case when p_with_explanation then jsonb_build_object('explanation', t.explanation) else '{}'::jsonb end), '{}'::jsonb)
  from public.question_version_translations t where t.question_version_id = p_id
$$;

-- Attempt JSON (wrapper from 20261114300000) gains per-item translations.
create or replace function public.assessment_attempt_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b is null or jsonb_typeof(b->'items') is distinct from 'array' then b else b || jsonb_build_object('items', (
    select jsonb_agg(i || jsonb_build_object(
      'skillLabelZhTw', coalesce(public.dictionary_labels_zh_at(array[i->>'skillId'], (i->>'dictionaryVersion')::bigint)->>(i->>'skillId'), i->>'skillLabel'),
      'translations', public.question_translations_json((i->>'questionVersionId')::uuid, b->>'status' = 'completed')) order by n)
    from jsonb_array_elements(b->'items') with ordinality as item(i, n))) end
  from (select public.assessment_attempt_json_base(p_id) as b) base
$$;

-- The administrator bank shows each version's current translation, including the explanation.
alter function public.assessment_bank_admin() rename to assessment_bank_admin_base;
create function public.assessment_bank_admin() returns jsonb
language sql stable security definer set search_path = '' as $$
  select b || jsonb_build_object('questions', coalesce((
    select jsonb_agg(q || jsonb_build_object('translations', public.question_translations_json((q->>'id')::uuid, true)) order by n)
    from jsonb_array_elements(coalesce(b->'questions', '[]'::jsonb)) with ordinality as item(q, n)), '[]'::jsonb))
  from (select public.assessment_bank_admin_base() as b) base
$$;

do $$ declare f text; begin
  foreach f in array array['public.question_translations_json(uuid,boolean)', 'public.assessment_bank_admin_base()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.assessment_question_translate(uuid,text,jsonb)', 'public.assessment_question_untranslate(uuid,text,text)', 'public.assessment_bank_admin()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
