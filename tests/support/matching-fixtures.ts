import { expect } from "vitest";
import type { LocalFixtures, LocalMember } from "./local-fixtures";
import { leaseTask } from "./task-fixtures";
import type { CapabilityEvidence } from "../../src/modules/profile/model";
import { publicationFields, type JobDraft, type PublishedJob } from "../../src/modules/jobs/model";

/** Owned, fictional catalog/profile fixtures for matching tests; callers clean up by prefix. */
export class MatchingFixtures {
  readonly jobIds: string[] = [];
  readonly sourceIds: string[] = [];
  private sequence = 0;
  constructor(
    private readonly stack: LocalFixtures,
    private readonly admin: LocalMember,
    readonly prefix = `rf-match-${crypto.randomUUID()}`,
  ) {}

  async publishJob(overrides: Partial<JobDraft> = {}): Promise<PublishedJob> {
    const n = ++this.sequence;
    const source = await this.stack.request("admin/catalog/sources", this.admin, "POST", {
      name: `${this.prefix}-${n}`,
      publisher: "Local matching fixtures",
      authorizationBasis: "Authored fictional local fixtures",
      rightsSummary: "Not a real opening",
      allowedHosts: ["jobs.test.invalid"],
      permittedFields: publicationFields,
      isDemo: true,
    });
    expect(source.status).toBe(201);
    const sourceId = (await source.json()).data.id;
    this.sourceIds.push(sourceId);
    const job: JobDraft = {
      canonicalKey: `${this.prefix}-${n}`,
      company: this.prefix,
      title: `${this.prefix} role ${n}`,
      track: "Engineering & data",
      specialization: "ai-llm-applications",
      location: "Taipei",
      workplace: "Remote",
      level: "Mid",
      salary: null,
      summary: "An authored fictional role for matching checks",
      responsibilities: ["Build useful tools"],
      requirements: [{ text: "Build Python services", priority: "mandatory", skills: ["python"] }],
      conditions: { workAuthorization: null, education: null, experienceYears: null },
      expiresAt: null,
      ...overrides,
    };
    const created = await this.stack.request("admin/catalog/jobs", this.admin, "POST", {
      job,
      source: {
        sourceId,
        externalId: `${this.prefix}-${n}`,
        url: `https://jobs.test.invalid/${n}`,
      },
    });
    expect(created.status).toBe(201);
    const record = (await created.json()).data;
    this.jobIds.push(record.id);
    for (const status of ["review", "published"]) {
      const response = await this.stack.request(
        `admin/catalog/jobs/${record.id}/status`,
        this.admin,
        "POST",
        {
          expectedRevision: record.revision,
          status,
        },
      );
      expect(response.status).toBe(200);
      record.revision = (await response.json()).data.revision;
    }
    return (await (await this.stack.request(`jobs/${record.id}`)).json()).data;
  }

  /** A member with remote Engineering preferences and one private Python claim. */
  async ownerWithEvidence(context = `${this.prefix} private evidence context`) {
    const owner = await this.stack.member();
    const profile = await this.stack.request("profile", owner, "PATCH", {
      name: "Taylor",
      track: "Engineering & data",
      workplaces: ["Remote"],
      weeklyHours: 5,
      expectedRevision: 0,
    });
    expect(profile.status).toBe(200);
    const evidence = await this.stack.request("evidence", owner, "POST", {
      expectedRevision: 1,
      evidence: {
        source: "self-report",
        label: `${this.prefix} private Python project`,
        context,
        observedAt: "2026-11-01T00:00:00Z",
        skills: ["python"],
        claimedLevel: 2,
      },
    });
    expect(evidence.status).toBe(201);
    const created = (await evidence.json()).data as {
      evidence: CapabilityEvidence;
      revision: number;
    };
    return { owner, ...created };
  }

  lease(taskId: string, seconds = 30) {
    return leaseTask(this.stack, taskId, "matches.refresh", seconds);
  }

  /** Removes this fixture's queue messages, runs and catalog records (in dependency order). */
  async cleanup(userIds: string[]) {
    const sql = this.stack.sql;
    await sql.query(
      "update public.tasks set status='failed',safe_error='RF_CANCELED',lease_token=null,lease_expires_at=null where user_id=any($1::uuid[]) and status in ('queued','running')",
      [userIds],
    );
    await sql.query(
      "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where user_id=any($1::uuid[]) and queue_message_id is not null",
      [userIds],
    );
    await sql.query(
      "delete from pgmq.a_rolefoundry_tasks where message->>'taskId' in(select id::text from public.tasks where user_id=any($1::uuid[]))",
      [userIds],
    );
    await sql.query("delete from public.match_runs where user_id=any($1::uuid[])", [userIds]);
    const jobs = [this.jobIds];
    // Dependents that reference fixture job versions must go first, or the catalog would be
    // left with a half-deleted published job.
    await sql.query("delete from public.revision_proposals where job_id=any($1::uuid[])", jobs);
    await sql.query("delete from public.bookmarks where job_id=any($1::uuid[])", jobs);
    await sql.query(
      "delete from public.job_skill_links where requirement_id in(select r.id from public.job_requirements r join public.job_versions v on v.id=r.job_version_id where v.job_id=any($1::uuid[]))",
      jobs,
    );
    await sql.query(
      "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
      jobs,
    );
    await sql.query("delete from public.job_versions where job_id=any($1::uuid[])", jobs);
    await sql.query("delete from public.job_sources where job_id=any($1::uuid[])", jobs);
    await sql.query("delete from public.jobs where id=any($1::uuid[])", jobs);
    await sql.query("delete from public.sources where id=any($1::uuid[])", [this.sourceIds]);
    await sql.query("delete from public.catalog_audit where actor_id=any($1::uuid[])", [userIds]);
    await sql.query(
      "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=public.companies.id)",
      [this.prefix],
    );
  }
}
