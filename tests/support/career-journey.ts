import { expect } from "vitest";
import pg from "pg";
import { LocalFixtures, type LocalMember } from "./local-fixtures";
import { ReplayExecution } from "./replay-execution";
import { publicationFields } from "../../src/modules/jobs/model";
import { courseFields } from "../../src/modules/learning/model";

/** Owns authored records only; never drains or resets the shared developer queue. */
export class CareerJourney {
  readonly prefix = `journey-${crypto.randomUUID()}`;
  readonly tasks = new Set<string>();
  readonly sources: string[] = [];
  readonly jobs: string[] = [];
  readonly courses: string[] = [];
  readonly questions: string[] = [];
  readonly rubrics: string[] = [];
  readonly execution: ReplayExecution;
  private constructor(readonly stack: LocalFixtures) {
    this.execution = new ReplayExecution(stack.sql, stack.privileged, this.tasks);
  }
  static async open() {
    return new CareerJourney(await LocalFixtures.open());
  }
  async data(path: string, user?: LocalMember, method = "GET", body?: unknown, status = 200) {
    const response = await this.stack.request(path, user, method, body, {
      "Idempotency-Key": crypto.randomUUID(),
    });
    expect(response.status, `${method} ${path}`).toBe(status);
    return (await response.json()).data;
  }
  async execute(taskId: string) {
    this.tasks.add(taskId);
    const message = await this.stack.sql.query(
      "select message from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
      [taskId],
    );
    expect(message.rows.map((row) => row.message)).toEqual([{ taskId }]);
    await this.execution.execute(taskId);
    const task = await this.stack.sql.query("select status from public.tasks where id=$1", [
      taskId,
    ]);
    expect(task.rows[0].status).toBe("succeeded");
    expect(
      (
        await this.stack.sql.query(
          "select 1 from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
          [taskId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await this.stack.sql.query(
          "select message from pgmq.a_rolefoundry_tasks where message->>'taskId'=$1",
          [taskId],
        )
      ).rows.map((row) => row.message),
    ).toEqual([{ taskId }]);
  }
  async publishJob(admin: LocalMember) {
    const source = await this.data(
      "admin/catalog/sources",
      admin,
      "POST",
      {
        name: this.prefix,
        publisher: "Authored journey fixtures",
        authorizationBasis: "Authored synthetic metadata for local acceptance",
        rightsSummary: "Fictional opening; no employer or hiring claim",
        allowedHosts: ["jobs.test.invalid"],
        permittedFields: publicationFields,
        isDemo: true,
      },
      201,
    );
    this.sources.push(source.id);
    const record = await this.data(
      "admin/catalog/jobs",
      admin,
      "POST",
      {
        job: {
          canonicalKey: this.prefix,
          company: this.prefix,
          title: `${this.prefix} AI engineer`,
          track: "Engineering & data",
          specialization: "ai-llm-applications",
          location: "Taipei",
          workplace: "Remote",
          level: "Mid",
          salary: null,
          summary: "Synthetic role for a continuous private career journey",
          responsibilities: ["Build and evaluate grounded services"],
          requirements: [
            { text: "Demonstrate Python evaluation", priority: "mandatory", skills: ["python"] },
            { text: "Build a retrieval pipeline", priority: "preferred", skills: ["rag"] },
          ],
          conditions: { workAuthorization: null, education: null, experienceYears: null },
          expiresAt: null,
        },
        source: {
          sourceId: source.id,
          externalId: this.prefix,
          url: `https://jobs.test.invalid/${this.prefix}`,
        },
      },
      201,
    );
    this.jobs.push(record.id);
    let revision = record.revision;
    for (const status of ["review", "published"])
      revision = (
        await this.data(`admin/catalog/jobs/${record.id}/status`, admin, "POST", {
          expectedRevision: revision,
          status,
        })
      ).revision;
    return record.id as string;
  }
  async publishCourse(admin: LocalMember) {
    const source = await this.data(
      "admin/courses/sources",
      admin,
      "POST",
      {
        providerId: "deeplearning-ai",
        name: this.prefix,
        publisher: "Authored journey fixtures",
        authorizationBasis: "Synthetic course metadata for local acceptance",
        rightsSummary: "Fictional resource; not a real provider offering",
        allowedHosts: ["www.deeplearning.ai"],
        permittedFields: courseFields,
        isDemo: true,
      },
      201,
    );
    this.sources.push(source.id);
    const course = await this.data(
      "admin/courses",
      admin,
      "POST",
      {
        key: this.prefix,
        providerId: "deeplearning-ai",
        sourceId: source.id,
        title: `${this.prefix} retrieval practice`,
        url: `https://www.deeplearning.ai/courses/${this.prefix}/`,
        summary: "Authored metadata; no external page is requested",
        skills: ["rag"],
        prerequisiteSkills: ["python"],
        prerequisiteCourseIds: [],
        language: "en",
        difficulty: "Intermediate",
        format: "Course",
        officialMinutes: null,
        editorialMinutes: 45,
        durationNote: "Synthetic editorial estimate for acceptance",
        practice: {
          prompt: "Build and evaluate a small retrieval example",
          completionCriteria: "Retain source references and evaluation results",
          minutes: 15,
        },
      },
      201,
    );
    this.courses.push(course.id);
    let revision = course.revision;
    for (const action of ["review", "publish"]) {
      await this.data(`admin/courses/${course.id}/transition`, admin, "POST", {
        expectedRevision: revision,
        action,
        reason: "Authored synthetic metadata reviewed for this test",
      });
      revision++;
    }
    return course.id as string;
  }
  async publishQuestions(admin: LocalMember) {
    const rubric = await this.data(
      "admin/assessments/rubrics",
      admin,
      "POST",
      {
        key: this.prefix,
        version: 1,
        description: "Authored fixed-choice observation; no certification claim",
      },
      201,
    );
    this.rubrics.push(rubric.id);
    for (let i = 0; i < 3; i++) {
      const question = await this.data(
        "admin/assessments/questions",
        admin,
        "POST",
        {
          key: `${this.prefix}-${i}`,
          version: 1,
          track: "Engineering & data",
          skillId: "python",
          rubricId: rubric.id,
          prompt: `${this.prefix} evaluation scenario ${i}`,
          options: ["Compare against a measured baseline", "Assume the output is correct"],
          correctIndex: 0,
          explanation: "A measured comparison supports this narrow scenario observation",
        },
        201,
      );
      this.questions.push(question.id);
      await this.data(`admin/assessments/questions/${question.id}/review`, admin, "POST", {
        reason: "Synthetic fixed-choice fixture review",
      });
    }
  }
  async close() {
    const { stack } = this,
      users = stack.users.map((user) => user.id);
    // Capture task IDs before the user cascade, including a task accepted just before a failure.
    const tasks = (
      await stack.sql.query("select id from public.tasks where user_id=any($1::uuid[])", [users])
    ).rows.map((row) => row.id);
    const objects = (
      await stack.sql.query(
        "select name from storage.objects where bucket_id='rolefoundry-resumes' and split_part(name,'/',1)=any($1::text[])",
        [users],
      )
    ).rows.map((row) => row.name);
    if (objects.length)
      expect(
        (await stack.privileged.storage.from("rolefoundry-resumes").remove(objects)).error,
      ).toBeNull();
    await stack.sql.query(
      "delete from public.resume_storage_objects where user_id=any($1::uuid[])",
      [users],
    );
    await stack.sql.query(
      "delete from pgmq.q_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
      [tasks],
    );
    await stack.sql.query(
      "delete from pgmq.a_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
      [tasks],
    );
    await stack.sql.query("delete from public.tasks where id=any($1::uuid[])", [tasks]);
    // Public fixture records outlive their creator; remove them after private references cascade.
    const sql = new pg.Client({ connectionString: stack.env.DB_URL });
    await sql.connect();
    try {
      await stack.close();
      await sql.query(
        "delete from public.question_publications where question_version_id=any($1::uuid[])",
        [this.questions],
      );
      await sql.query("delete from public.question_versions where id=any($1::uuid[])", [
        this.questions,
      ]);
      await sql.query("delete from public.rubric_versions where id=any($1::uuid[])", [
        this.rubrics,
      ]);
      await sql.query(
        "delete from public.course_prerequisites where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
        [this.courses],
      );
      await sql.query(
        "delete from public.course_skill_links where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
        [this.courses],
      );
      await sql.query("delete from public.course_url_registry where course_id=any($1::uuid[])", [
        this.courses,
      ]);
      await sql.query("delete from public.course_versions where course_id=any($1::uuid[])", [
        this.courses,
      ]);
      await sql.query("delete from public.courses where id=any($1::uuid[])", [this.courses]);
      await sql.query(
        "delete from public.job_skill_links where requirement_id in(select id from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[])))",
        [this.jobs],
      );
      await sql.query(
        "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
        [this.jobs],
      );
      await sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [this.jobs]);
      await sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [this.jobs]);
      await sql.query("delete from public.jobs where id=any($1::uuid[])", [this.jobs]);
      await sql.query(
        "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=companies.id)",
        [this.prefix],
      );
      await sql.query("delete from public.sources where id=any($1::uuid[])", [this.sources]);
    } finally {
      await sql.end();
    }
  }
}
