-- Short-answer grading uses the existing assessment consent and allowance. Only the calibration
-- harness sends requests today; no learner attempt is graded until the enablement gate passes.
create or replace function public.gateway_feature(p_purpose text) returns text language sql immutable set search_path = '' as $$
  select case p_purpose
    when 'resume.wording' then 'resume'
    when 'matching.semantic-rank' then 'matching'
    when 'assessment.short-answer' then 'assessment'
  end
$$;
