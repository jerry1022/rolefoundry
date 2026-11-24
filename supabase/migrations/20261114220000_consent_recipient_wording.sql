-- New consent versions name reviewed recipients instead of "the configured AI provider".
-- Changing a version requires owners to consent again, and recipient approvals start empty for
-- the new version (they are bound to policy versions).
update public.consent_policies set version = '2026-11-24', description =
  'Allow your assessment answers and relevant skill evidence to be sent to the AI recipients approved for this policy version, for assessment analysis. Fixed-choice grading keeps working without this permission.'
  where purpose = 'assessment';
update public.consent_policies set version = '2026-11-24', description =
  'Allow your confirmed resume content and target job requirements to be sent to the AI recipients approved for this policy version, for resume analysis. Rule-based resume tools keep working without this permission.'
  where purpose = 'resume';

-- Show who would receive data under each current policy version (recipient IDs only).
alter function public.identity_policies() rename to identity_policies_base;
create function public.identity_policies() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(policy || jsonb_build_object('recipients', (
    select coalesce(jsonb_agg(a.recipient order by a.recipient), '[]'::jsonb) from public.ai_recipient_approvals a
    where a.purpose = policy->>'purpose' and a.policy_version = policy->>'version'))
    order by policy->>'purpose'), '[]'::jsonb)
  from jsonb_array_elements(public.identity_policies_base()) policy
$$;
revoke all on function public.identity_policies_base(), public.identity_policies() from public, anon, authenticated, service_role;
grant execute on function public.identity_policies() to anon, authenticated, service_role;
