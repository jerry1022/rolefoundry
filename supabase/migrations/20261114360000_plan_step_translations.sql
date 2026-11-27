-- Plan steps show reviewed course translations of the exact course version they were planned
-- from. A later course version's translation never rewrites an earlier plan.
alter function public.learning_plan_json(uuid) rename to learning_plan_json_base;
create function public.learning_plan_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b is null or jsonb_typeof(b->'steps') is distinct from 'array' then b else b || jsonb_build_object('steps', coalesce((
    select jsonb_agg(s || jsonb_build_object('translations', coalesce((
      select jsonb_object_agg(t.locale, jsonb_build_object('practicePrompt', t.practice_prompt,
        'completionCriteria', t.completion_criteria, 'reviewedAt', t.reviewed_at))
      from public.course_version_translations t
      where s->>'courseVersionId' is not null and t.course_version_id = (s->>'courseVersionId')::uuid), '{}'::jsonb)) order by n)
    from jsonb_array_elements(b->'steps') with ordinality as item(s, n)), '[]'::jsonb)) end
  from (select public.learning_plan_json_base(p_id) as b) base
$$;
do $$ declare f text; begin
  foreach f in array array['public.learning_plan_json(uuid)', 'public.learning_plan_json_base(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
