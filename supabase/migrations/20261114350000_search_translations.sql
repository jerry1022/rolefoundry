-- Lexical search also matches reviewed translations of the current version, so Traditional
-- Chinese readers can find a job by its reviewed title, summary or responsibilities. This
-- restates the latest definition (20261114040000) with only that addition to the search text.
create or replace function public.catalog_search_jobs(p_filters jsonb,p_after uuid default null,p_revision bigint default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_revision bigint;v_data jsonb;v_last uuid;v_more boolean;v_counts jsonb;
begin
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or p_limit is null or p_limit not between 1 and 50 or length(coalesce(p_filters->>'q',''))>200 then raise exception 'RF_INVALID_INPUT';end if;
 select revision into v_revision from public.catalog_state where singleton;
 if p_after is not null and (p_revision is null or p_revision<>v_revision) then raise exception 'RF_CONFLICT';end if;
 with candidates as (
 select j.id,v.id as version_id,v.specialization from public.jobs j join public.job_versions v on v.job_id=j.id and v.version=j.current_version join public.job_specializations sp on sp.id=v.specialization
 where public.catalog_job_visible(j.id)
 and (not p_filters?'track' or v.track=p_filters->>'track') and (not p_filters?'workplace' or v.workplace=p_filters->>'workplace')
 and (not p_filters?'level' or v.level=p_filters->>'level') and (not p_filters?'location' or position(lower(p_filters->>'location') in lower(coalesce(v.location,'')))>0)
 and not exists(select 1 from regexp_split_to_table(lower(btrim(coalesce(p_filters->>'q',''))),'\s+') term where term<>'' and position(term in lower(v.title||' '||v.company_name||' '||coalesce(v.location,'')||' '||v.summary||' '||sp.title||' '||array_to_string(sp.aliases,' ')||' '||array_to_string(v.responsibilities,' ')||' '||coalesce((select string_agg(t.title||' '||t.summary||' '||array_to_string(t.responsibilities,' '),' ') from public.job_version_translations t where t.job_version_id=v.id),'')||' '||coalesce((select string_agg(r.text||' '||coalesce((select string_agg(k.id||' '||public.dictionary_search_terms(k.id),' ') from public.job_skill_links l join public.skills k on k.id=l.canonical_skill_id where l.requirement_id=r.id),''),' ') from public.job_requirements r where r.job_version_id=v.id),'')))=0)
 ),filtered as (select * from candidates c where (not p_filters?'specialization' or c.specialization=p_filters->>'specialization')),
 page as (select * from filtered where p_after is null or id>p_after order by id limit p_limit+1),shown as(select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(public.catalog_job_json(id) order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*)>p_limit from page),
 coalesce((select jsonb_object_agg(specialization,n) from(select specialization,count(*) n from candidates group by specialization)c),'{}'::jsonb)
 into v_data,v_last,v_more,v_counts;
 return jsonb_build_object('data',v_data,'lastId',case when v_more then v_last end,'revision',v_revision,'counts',v_counts);
end $$;
