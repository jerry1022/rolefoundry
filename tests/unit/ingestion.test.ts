import { describe, it, expect } from "vitest";
import { sanitizeImport, normalizeSourceUrl } from "../../src/modules/ingestion/input";
import { parseCsv } from "../../src/modules/ingestion/csv";
import { planImport, durationMinutes } from "../../src/modules/ingestion/normalizer";
import { Sha256ImportKey } from "../../src/modules/ingestion/adapters/identity";
import { ImportSubmissionService } from "../../src/modules/ingestion/service";
import {
  StaticFeedRegistry,
  SafeFeedReader,
  isPublicAddress,
  allowedFeedUrl,
  pinnedHttpsGet,
  type FeedNetwork,
  type FeedResponse,
} from "../../src/modules/ingestion/adapters/safe-feed";
import {
  ingestionLimits,
  type ImportSource,
  type ImportContext,
  type SkillDictionary,
} from "../../src/modules/ingestion/model";
import { publicationFields } from "../../src/modules/jobs/model";
import { courseFields } from "../../src/modules/learning/model";
import type { ImportSubmissionStore } from "../../src/modules/ingestion/ports";
import type { Actor } from "../../src/modules/identity/core";
const id = () => crypto.randomUUID(),
  keys = new Sha256ImportKey();
const source: ImportSource = {
  id: id(),
  kind: "jobs",
  status: "active",
  fingerprint: "owned-source-policy-v1",
  allowedHosts: ["jobs.example.invalid"],
  permittedFields: [...publicationFields],
  allowClosure: true,
  provider: null,
};
const dictionary: SkillDictionary = {
  version: 1,
  createdAt: "2026-11-17T00:00:00Z",
  skills: [
    {
      id: "python",
      nameEn: "Python",
      nameZhTw: "Python",
      description: "Authored Python concept",
      status: "active",
      redirectTo: null,
    },
    {
      id: "rag",
      nameEn: "Retrieval",
      nameZhTw: "檢索",
      description: "Authored retrieval concept",
      status: "active",
      redirectTo: null,
    },
  ],
  aliases: [
    {
      skillId: "python",
      locale: "en",
      alias: "Python language",
      normalizedAlias: "python language",
    },
  ],
  relations: [],
  trackSkills: [],
};
const job = {
  company: "Authored company",
  title: "AI engineer",
  track: "Engineering & data",
  specialization: "ai-llm-applications",
  location: "Taipei",
  workplace: "Remote",
  level: null,
  salary: null,
  summary: "Authored summary",
  responsibilities: ["Maintain a prototype"],
  requirements: [{ text: "Build with Python", priority: "mandatory", skills: ["python"] }],
  conditions: { workAuthorization: null, education: null, experienceYears: null },
  expiresAt: null,
};
function row(
  fields: Record<string, unknown> = job,
  externalId = "job-1",
  url = "https://jobs.example.invalid/role",
) {
  return { externalId, url, state: "active", fields };
}
function input(rows: unknown[], policy = source) {
  return sanitizeImport(JSON.stringify({ records: rows }), "json", policy);
}
function context(policy = source): ImportContext {
  return { source: policy, dictionary: structuredClone(dictionary), existing: [], matches: [] };
}
function prepared(fields: Record<string, unknown> = job) {
  return planImport(input([row(fields)]), context(), keys).rows[0];
}
const registry = new StaticFeedRegistry([
  {
    id: "authored-feed",
    kind: "jobs",
    format: "json",
    url: "https://feeds.example.invalid/list.json",
    allowedHosts: ["feeds.example.invalid", "cdn.example.invalid"],
  },
]);
const feed = registry.find("authored-feed", "jobs")!;
function response(
  status = 200,
  headers: Record<string, string> = {},
  body = '{"records":[]}',
): FeedResponse {
  return {
    status,
    headers: { "content-type": "application/json", ...headers },
    body: new TextEncoder().encode(body),
  };
}
function network(responses: FeedResponse[] = [response()]) {
  const calls: { url: string; address: string }[] = [],
    delays: number[] = [];
  let clock = 0;
  const port: FeedNetwork = {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    get: async (url, address) => {
      calls.push({ url: url.href, address: address.address });
      return responses.shift() ?? response();
    },
    sleep: async (delay) => {
      delays.push(delay);
      clock += delay;
    },
    now: () => clock,
  };
  return { port, calls, delays };
}
describe("authorized import parsing and review plans", () => {
  it("keeps a valid row when another record is malformed or repeats its source/external ID", () => {
    const result = input([
      row(),
      { externalId: 2, url: "bad", fields: {} },
      row({ summary: "Repeated" }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[1].issues[0].code).toBe("duplicate-external-id");
    expect(result.total).toBe(3);
  });
  it("does not retain values outside source permission, including unknown field names", () => {
    const result = input(
      [
        row({ ...job, secretContent: "DO NOT RETAIN THIS" }),
        row({ summary: "Restricted source value" }, "second"),
      ],
      { ...source, permittedFields: ["title"] },
    );
    expect(result.rows).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("DO NOT RETAIN THIS");
    expect(JSON.stringify(result)).not.toContain("Restricted source value");
    expect(
      result.rejected.every((item) =>
        item.issues.some((issue) => issue.code === "forbidden-field"),
      ),
    ).toBe(true);
  });
  it("parses quoted CSV, embedded line breaks, doubled quotes and safe literal formulas", () => {
    expect(parseCsv('title,summary\r\n"AI, engineer","Line one\r\nLine ""two"""\r\n')).toEqual([
      ["title", "summary"],
      ["AI, engineer", 'Line one\r\nLine "two"'],
    ]);
    const content =
      'externalId,url,title,summary\njob-1,https://jobs.example.invalid/role,=1+1,"A, quoted summary"\n';
    const result = sanitizeImport(content, "csv", source);
    expect(result.rows[0].fields.title).toBe("=1+1");
    expect(result.rows[0].fields.summary).toBe("A, quoted summary");
    expect(() => parseCsv('a,b\n"unfinished,b')).toThrow();
    expect(() => sanitizeImport("externalId,url,url\nx,y,z", "csv", source)).toThrow();
  });
  it("distinguishes absent CSV fields from explicit null and rejects one bad cell without dropping a valid row", () => {
    const csv =
      "externalId,url,location,salary\nfirst,https://jobs.example.invalid/first,,null\nsecond,https://jobs.example.invalid/second,,not-json\nthird,https://jobs.example.invalid/third,Taipei,null";
    const result = sanitizeImport(csv, "csv", source);
    expect(result.rows).toHaveLength(2);
    expect(Object.hasOwn(result.rows[0].fields, "location")).toBe(false);
    expect(result.rows[0].fields.salary).toBeNull();
    expect(result.rejected).toHaveLength(1);
  });
  it("bounds bytes, rows, nesting and individual records and treats parser pollution keys as invalid", () => {
    expect(() => sanitizeImport(" ".repeat(ingestionLimits.bytes + 1), "json", source)).toThrow();
    expect(() =>
      input(Array.from({ length: 101 }, (_, index) => row({}, String(index)))),
    ).toThrow();
    const result = input([
      row({ summary: "x".repeat(ingestionLimits.rowBytes + 1) }),
      row({}, "second"),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(() =>
      sanitizeImport(
        '{"records":[{"externalId":"x","url":"https://jobs.example.invalid/role","fields":{"__proto__":{"polluted":true}}}]}',
        "json",
        source,
      ),
    ).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("normalizes salary and work-mode units without inventing missing or undisclosed values", () => {
    expect(
      sanitizeImport(
        "externalId,url,salary\nfirst,https://jobs.example.invalid/role,undisclosed",
        "csv",
        source,
      ).rows[0].fields.salary,
    ).toBe("undisclosed");
    const undisclosed = prepared({ ...job, salary: "面議", workplace: " remote " });
    expect(undisclosed.candidate.salary).toBeNull();
    expect(undisclosed.candidate.workplace).toBe("Remote");
    const amount = prepared({
      ...job,
      salary: { min: "50,000", max: null, currency: "usd", interval: "annual" },
    });
    expect(amount.candidate.salary).toEqual({
      min: 50000,
      max: null,
      currency: "USD",
      interval: "year",
    });
    const missingCurrency = prepared({ ...job, salary: { min: 50000, interval: "year" } });
    expect(missingCurrency.issues.some((issue) => issue.blocking)).toBe(true);
    expect(JSON.stringify(missingCurrency.candidate.salary)).not.toContain("USD");
  });
  it("preserves curated fields on partial updates, marks explicit removal and detects changed source URLs", () => {
    const ctx = context();
    ctx.existing = [
      {
        externalId: "job-1",
        url: "https://jobs.example.invalid/old",
        target: {
          kind: "jobs",
          id: id(),
          versionId: id(),
          revision: 7,
          draft: {
            ...job,
            canonicalKey: "curated-job",
            workplace: "Remote" as const,
            track: "Engineering & data" as const,
            specialization: "ai-llm-applications" as const,
            requirements: [
              { text: "Curated requirement", priority: "mandatory", skills: ["python"] },
            ],
          },
        },
      },
    ];
    const output = planImport(
      input([row({ summary: "Updated source summary", conditions: { education: null } })]),
      ctx,
      keys,
    ).rows[0];
    expect(output.candidate.title).toBe("AI engineer");
    expect(output.candidate.workplace).toBe("Remote");
    expect(output.targetRevision).toBe(7);
    expect(output.changes.map((change) => change.field)).toEqual(["sourceUrl", "summary"]);
    expect(output.disposition).toBe("pending-review");
    const cleared = planImport(
      input([row({ location: null })]),
      {
        ...ctx,
        existing: ctx.existing.map((item) => ({
          ...item,
          url: "https://jobs.example.invalid/role",
        })),
      },
      keys,
    ).rows[0];
    expect(cleared.changes[0]).toEqual({
      field: "location",
      operation: "clear",
      before: "Taipei",
      after: null,
    });
    const salaryContext = structuredClone(ctx);
    const target = salaryContext.existing[0].target;
    if (target.kind !== "jobs") throw Error("Expected authored job fixture");
    target.draft.salary = { min: 30000, max: 80000, currency: "TWD", interval: "month" };
    const salaryUpdate = planImport(
      input([row({ salary: { min: "35,000" } })]),
      salaryContext,
      keys,
    ).rows[0];
    expect(salaryUpdate.candidate.salary).toEqual({
      min: 35000,
      max: 80000,
      currency: "TWD",
      interval: "month",
    });
  });
  it("maps explicit bilingual aliases, preserves unmapped terms and requires review for ambiguity", () => {
    const valid = prepared({
      ...job,
      requirements: [
        {
          text: "Python and retrieval",
          priority: "mandatory",
          skills: ["Python language", "檢索"],
        },
      ],
    });
    expect((valid.candidate.requirements as { skills: string[] }[])[0].skills).toEqual([
      "python",
      "rag",
    ]);
    const unresolved = prepared({
      ...job,
      requirements: [
        {
          text: "Keep this raw requirement",
          priority: "mandatory",
          skills: ["unknown capability"],
        },
      ],
    });
    expect(unresolved.unmappedSkills).toEqual(["unknown capability"]);
    expect(unresolved.sourceFields.requirements).toEqual([
      { text: "Keep this raw requirement", priority: "mandatory", skills: ["unknown capability"] },
    ]);
    expect(
      unresolved.issues.some((issue) => issue.code === "unmapped-skill" && issue.blocking),
    ).toBe(true);
    const ctx = context();
    ctx.dictionary.aliases.push(
      { skillId: "python", locale: "en", alias: "shared", normalizedAlias: "shared" },
      { skillId: "rag", locale: "zh-TW", alias: "shared", normalizedAlias: "shared" },
    );
    const ambiguous = planImport(
      input([
        row({
          ...job,
          requirements: [{ text: "Shared term", priority: "mandatory", skills: ["shared"] }],
        }),
      ]),
      ctx,
      keys,
    ).rows[0];
    expect(ambiguous.issues.some((issue) => issue.code === "ambiguous-skill")).toBe(true);
  });
  it("proposes cross-source matches without automatically attaching or overwriting another catalog record", () => {
    const ctx = context(),
      target = id();
    ctx.matches = [
      {
        externalId: "job-1",
        candidates: [{ id: target, title: "Similar role", company: "Authored company" }],
      },
    ];
    const output = planImport(input([row()]), ctx, keys).rows[0];
    expect(output.targetId).toBeNull();
    expect(output.candidateIds).toEqual([target]);
    expect(
      output.issues.some((issue) => issue.code === "cross-source-match" && issue.blocking),
    ).toBe(true);
  });
  it("keeps course duration unknown unless stated, validates provider paths and produces only review candidates", () => {
    const courseSource: ImportSource = {
      ...source,
      kind: "courses",
      allowedHosts: ["www.deeplearning.ai"],
      permittedFields: [...courseFields],
      provider: {
        id: "deeplearning-ai",
        pathPrefixes: ["/courses/", "/short-courses/"],
        urlIdentity: "path",
      },
    };
    const fields = {
      title: "Authored metadata",
      summary: "Independent authored summary",
      skills: ["Python language"],
      format: "Short course",
      officialMinutes: "2 hours",
      durationNote: "Duration stated in the authored fixture",
      practice: {
        prompt: "Build a synthetic prototype",
        completionCriteria: "Explain the result",
        minutes: "30 min",
      },
    };
    const output = planImport(
      input(
        [
          row(
            fields,
            "course-1",
            "https://www.deeplearning.ai/short-courses/authored/?utm_source=test#part",
          ),
        ],
        courseSource,
      ),
      context(courseSource),
      keys,
    ).rows[0];
    expect(output.candidate.officialMinutes).toBe(120);
    expect(output.candidate.editorialMinutes).toBeNull();
    expect(output.candidate.language).toBeNull();
    expect(output.candidate.difficulty).toBe("Unknown");
    expect(output.url).toBe("https://www.deeplearning.ai/short-courses/authored/");
    expect(output.disposition).toBe("pending-review");
    expect(output.issues.some((issue) => issue.blocking)).toBe(false);
    expect(
      sanitizeImport(
        "externalId,url,officialMinutes\nfirst,https://www.deeplearning.ai/short-courses/authored/,2 hours",
        "csv",
        courseSource,
      ).rows[0].fields.officialMinutes,
    ).toBe("2 hours");
    expect(normalizeSourceUrl("https://www.deeplearning.ai/login/", courseSource)).toBeNull();
    expect(durationMinutes("1.5 hours")).toBe(90);
    expect(durationMinutes("half a day")).toBe("half a day");
  });
  it("never infers closure from an absent record and enforces explicit closure permission", () => {
    const explicit = input([{ ...row({}), state: "closed" }]);
    expect(planImport(explicit, context(), keys).rows[0].disposition).toBe("closure");
    expect(
      input([{ ...row({}), state: "closed" }], { ...source, allowClosure: false }).rejected[0]
        .issues[0].code,
    ).toBe("closure-not-permitted");
    const ctx = context();
    ctx.existing = [
      {
        externalId: "absent",
        url: "https://jobs.example.invalid/absent",
        target: {
          kind: "jobs",
          id: id(),
          versionId: id(),
          revision: 1,
          draft: {
            ...job,
            canonicalKey: "old",
            track: "Engineering & data",
            specialization: "ai-llm-applications",
            workplace: "Remote",
            requirements: [{ text: "Python", priority: "mandatory", skills: ["python"] }],
          },
        },
      },
    ];
    expect(planImport(input([row()]), ctx, keys).rows.map((item) => item.externalId)).toEqual([
      "job-1",
    ]);
  });
  it("reauthorizes sanitized snapshots and uses stable source/external identities across batches", () => {
    const sanitized = input([row()]);
    expect(() =>
      planImport(sanitized, { ...context(), source: { ...source, status: "revoked" } }, keys),
    ).toThrow();
    expect(() =>
      planImport(sanitized, { ...context(), source: { ...source, permittedFields: [] } }, keys),
    ).toThrow();
    expect(keys.key(source, "external")).toBe(keys.key(source, "external"));
    expect(keys.key(source, "external")).not.toBe(keys.key({ ...source, id: id() }, "external"));
    expect(keys.key(source, "x".repeat(200)).length).toBeLessThan(200);
  });
  it("authorizes before reading or persisting source data and persists only sanitized input", async () => {
    let calls = 0;
    const store = {
        source: async () => {
          calls++;
          return source;
        },
        submit: async (value: unknown) => {
          calls++;
          expect(JSON.stringify(value)).not.toContain("secretContent");
          return { id: id(), taskId: id(), status: "queued" };
        },
      } as ImportSubmissionStore,
      actor = { userId: id(), role: "member" } as Actor;
    const denied = new ImportSubmissionService(store, {
      authorize: async () => {
        throw Error("Denied");
      },
    });
    await expect(denied.submit(actor, {}, "authored-key")).rejects.toThrow("Denied");
    expect(calls).toBe(0);
    const allowed = new ImportSubmissionService(store, { authorize: async () => {} });
    await allowed.submit(
      actor,
      {
        sourceId: source.id,
        batchId: "authored-batch",
        format: "json",
        content: JSON.stringify({ records: [row({ ...job, secretContent: "Do not persist" })] }),
      },
      "authored-key",
    );
    expect(calls).toBe(2);
  });
});
describe("deployment-approved feed network boundary", () => {
  it("uses only immutable deployment registry IDs and rejects credentialed, private and off-host URLs", () => {
    expect(Object.isFrozen(feed)).toBe(true);
    expect(registry.find(feed.id, "courses")).toBeNull();
    expect(registry.find("https://attacker.invalid", "jobs")).toBeNull();
    expect(
      () =>
        new StaticFeedRegistry([
          {
            id: "bad",
            kind: "jobs",
            format: "json",
            url: "https://user:secret@feeds.example.invalid/x",
            allowedHosts: ["feeds.example.invalid"],
          },
        ]),
    ).toThrow();
    for (const url of [
      "http://feeds.example.invalid/x",
      "https://127.1/x",
      "https://[::1]/x",
      "https://feeds.example.invalid:8443/x",
      "https://other.invalid/x",
      "https://feeds.example.invalid./x",
    ])
      expect(() => allowedFeedUrl(url, feed.allowedHosts)).toThrow();
  });
  it("blocks private/reserved, mapped and mixed DNS answers before any request", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "192.0.2.1",
      "198.18.0.1",
      "224.0.0.1",
    ])
      expect(isPublicAddress({ address, family: 4 })).toBe(false);
    for (const address of [
      "::1",
      "::ffff:127.0.0.1",
      "fe80::1",
      "fd00::1",
      "2001:db8::1",
      "2002:7f00:1::",
      "3fff::1",
    ])
      expect(isPublicAddress({ address, family: 6 })).toBe(false);
    expect(isPublicAddress({ address: "2001:4860:4860::8888", family: 6 })).toBe(true);
    const net = network();
    net.port.resolve = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ];
    await expect(
      new SafeFeedReader(net.port).read(feed, new AbortController().signal),
    ).rejects.toMatchObject({ code: "blocked" });
    expect(net.calls).toHaveLength(0);
    await expect(
      pinnedHttpsGet(
        new URL(feed.url),
        { address: "127.0.0.1", family: 4 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "blocked" });
  });
  it("passes the validated address to transport and validates every redirect again", async () => {
    const net = network([
      response(302, { location: "https://cdn.example.invalid/next" }),
      response(),
    ]);
    let lookups = 0;
    net.port.resolve = async () => [
      { address: ++lookups === 1 ? "93.184.216.34" : "1.1.1.1", family: 4 },
    ];
    await new SafeFeedReader(net.port).read(feed, new AbortController().signal);
    expect(net.calls.map((call) => call.address)).toEqual(["93.184.216.34", "1.1.1.1"]);
    const blocked = network([response(302, { location: "http://127.0.0.1/private" })]);
    await expect(
      new SafeFeedReader(blocked.port).read(feed, new AbortController().signal),
    ).rejects.toMatchObject({ code: "blocked" });
    expect(blocked.calls).toHaveLength(1);
    const loop = network([response(302, { location: feed.url })]);
    await expect(
      new SafeFeedReader(loop.port).read(feed, new AbortController().signal),
    ).rejects.toMatchObject({ code: "redirect" });
    expect(loop.calls).toHaveLength(1);
  });
  it("enforces media, UTF-8, compression and body bounds", async () => {
    for (const invalid of [
      response(200, { "content-type": "text/html" }),
      response(200, { "content-encoding": "gzip" }),
      { ...response(), body: new Uint8Array([0xff]) },
      { ...response(), body: new Uint8Array(ingestionLimits.bytes + 1) },
    ]) {
      await expect(
        new SafeFeedReader(network([invalid]).port).read(feed, new AbortController().signal),
      ).rejects.toBeInstanceOf(Error);
    }
  });
  it("bounds transient retries and honors Retry-After without sleeping through a long provider limit", async () => {
    const net = network([response(429, { "retry-after": "3" }), response()]);
    await new SafeFeedReader(net.port).read(feed, new AbortController().signal);
    expect(net.delays).toEqual([3000]);
    expect(net.calls).toHaveLength(2);
    const long = network([response(429, { "retry-after": "60" })]);
    await expect(
      new SafeFeedReader(long.port).read(feed, new AbortController().signal),
    ).rejects.toMatchObject({ code: "rate-limit", retryAfterSeconds: 60 });
    expect(long.calls).toHaveLength(1);
    expect(long.delays).toHaveLength(0);
    const manual = network([response(429, { "retry-after": "999999" })]);
    await expect(
      new SafeFeedReader(manual.port).read(feed, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "rate-limit",
      requiresManualRetry: true,
      retryAfterSeconds: 999999,
    });
    expect(manual.calls).toHaveLength(1);
    expect(manual.delays).toHaveLength(0);
    const outage = network([response(503), response(503), response(503)]);
    await expect(
      new SafeFeedReader(outage.port).read(feed, new AbortController().signal),
    ).rejects.toMatchObject({ code: "network" });
    expect(outage.calls).toHaveLength(3);
    expect(outage.delays).toEqual([1000, 2000]);
  });
  it("stops pending DNS work and makes no request after cancellation", async () => {
    const controller = new AbortController(),
      net = network();
    net.port.resolve = () => new Promise(() => {});
    const pending = new SafeFeedReader(net.port).read(feed, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
    expect(net.calls).toHaveLength(0);
  });
});
