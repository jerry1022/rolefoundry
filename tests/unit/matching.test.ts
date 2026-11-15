import { describe, it, expect } from "vitest";
import { rankMatches } from "../../src/modules/matching/rules";
import {
  matchConstraintsSchema,
  matchEvidenceSchema,
  type MatchSnapshot,
  type MatchJobInput,
  type MatchEvidence,
} from "../../src/modules/matching/model";
const jobId = "11111111-1111-4111-8111-111111111111";
function job(overrides: Partial<MatchJobInput> = {}): MatchJobInput {
  return {
    id: jobId,
    versionId: crypto.randomUUID(),
    title: "AI engineer",
    company: "Fixture",
    track: "Engineering & data",
    workplace: null,
    conditions: { workAuthorization: null, education: null, experienceYears: null },
    requirements: [{ text: "Build Python services", priority: "mandatory", skills: ["python"] }],
    ...overrides,
  };
}
function evidence(overrides: Partial<MatchEvidence> = {}): MatchEvidence {
  return {
    id: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    label: "My Python claim",
    context: "A self-reported project",
    source: "self-report",
    signal: "claim",
    skills: ["python"],
    sourceVersion: "1",
    rubricVersion: null,
    ...overrides,
  };
}
function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    profileRevision: 1,
    catalogRevision: 1,
    dictionaryVersion: 1,
    track: "Engineering & data",
    workplaces: [],
    constraints: { experienceYears: null, confirmations: [] },
    evidence: [],
    jobs: [job()],
    ...overrides,
  };
}
describe("source-grounded matching rules", () => {
  it("keeps missing conditions unknown and separates explicit preference conflicts", () => {
    const target = job({ workplace: "On-site" });
    const [unknown] = rankMatches(snapshot({ jobs: [target] }));
    expect(unknown.conditions.every((item) => item.status === "unknown")).toBe(true);
    expect(unknown.action).toBe("strengthen-evidence");
    const [conflict] = rankMatches(snapshot({ jobs: [target], workplaces: ["Remote"] }));
    expect(conflict.conditions.find((item) => item.field === "workplace")?.status).toBe("conflict");
    expect(conflict.action).toBe("condition-conflict");
    const [confirmed] = rankMatches(snapshot({ jobs: [target], workplaces: ["On-site"] }));
    expect(confirmed.conditions.find((item) => item.field === "workplace")?.basis).toBe(
      "preference",
    );
  });
  it("requires confirmations for the exact job version and never infers education or authorization", () => {
    const target = job({
      conditions: {
        workAuthorization: "Local work authorization",
        education: "Bachelor or equivalent",
        experienceYears: 2,
      },
    });
    const input = snapshot({
      jobs: [target],
      constraints: {
        experienceYears: 3,
        confirmations: [
          { jobVersionId: crypto.randomUUID(), field: "education", answer: "confirmed" },
          { jobVersionId: target.versionId, field: "workAuthorization", answer: "conflict" },
        ],
      },
    });
    const [result] = rankMatches(input);
    expect(result.conditions.find((item) => item.field === "education")?.status).toBe("unknown");
    expect(result.conditions.find((item) => item.field === "experienceYears")?.status).toBe(
      "confirmed",
    );
    expect(result.conditions.find((item) => item.field === "workAuthorization")?.status).toBe(
      "conflict",
    );
    expect(result.action).toBe("condition-conflict");
  });
  it("retains requirement and evidence citations without treating claims or references as verified mastery", () => {
    const claim = evidence(),
      reference = evidence({ source: "portfolio-reference", signal: "reference" });
    const target = job();
    const [result] = rankMatches(snapshot({ jobs: [target], evidence: [claim, reference] }));
    expect(result.requirements[0]).toMatchObject({
      jobVersionId: target.versionId,
      ordinal: 0,
      text: "Build Python services",
    });
    expect(result.requirements[0].skills[0].support.map((item) => item.versionId)).toEqual([
      claim.versionId,
      reference.versionId,
    ]);
    expect(result.requirements[0].skills[0].support[0]).toMatchObject({
      source: "self-report",
      signal: "claim",
      context: claim.context,
    });
    expect(result.coverage.mandatory).toEqual({ covered: 1, total: 1 });
    expect(result.limitations.join(" ")).toContain("does not establish independent mastery");
  });
  it("keeps failed scenarios and learning-only claims out of supporting coverage", () => {
    const practice = evidence({
      source: "scenario",
      signal: "practice",
      rubricVersion: "rubric-v1",
    });
    const [result] = rankMatches(
      snapshot({ evidence: [practice, evidence({ signal: "learning" })] }),
    );
    expect(result.coverage.mandatory.covered).toBe(0);
    expect(
      result.gaps.some((item) => item.kind === "short-term-learning" && item.skillId === "python"),
    ).toBe(true);
    const [both] = rankMatches(snapshot({ evidence: [practice, evidence()] }));
    expect(both.coverage.mandatory.covered).toBe(1);
    expect(both.action).toBe("strengthen-evidence");
    expect(both.requirements[0].skills[0].practice).toHaveLength(1);
  });
  it("counts canonical skills once, keeps preferred skills separate and uses stable IDs for ties", () => {
    const lower = job(),
      higher = job({ id: "22222222-2222-4222-8222-222222222222" });
    const better = job({
      id: "33333333-3333-4333-8333-333333333333",
      requirements: [
        { text: "Python", priority: "mandatory", skills: ["python", "python"] },
        {
          text: "Preferred Python and SQL",
          priority: "preferred",
          skills: ["python", "sql", "sql"],
        },
      ],
    });
    const result = rankMatches(
      snapshot({
        jobs: [higher, better, lower],
        evidence: [evidence(), evidence({ skills: ["sql"] })],
      }),
    );
    expect(result.map((item) => item.jobId)).toEqual([better.id, lower.id, higher.id]);
    expect(result[0].coverage).toEqual({
      mandatory: { covered: 1, total: 1 },
      preferred: { covered: 1, total: 1 },
    });
    const duplicate = evidence();
    expect(
      rankMatches(snapshot({ evidence: [duplicate, duplicate] }))[0].requirements[0].skills[0]
        .support,
    ).toHaveLength(1);
  });
  it("reports empty/unrelated evidence and unmapped text as gaps rather than inventing support", () => {
    const target = job({
      requirements: [
        { text: "Python service", priority: "mandatory", skills: ["python"] },
        { text: "Communicate clearly with stakeholders", priority: "mandatory", skills: [] },
      ],
    });
    for (const entries of [[], [evidence({ skills: ["sql"] })]]) {
      const [result] = rankMatches(snapshot({ jobs: [target], evidence: entries }));
      expect(result.coverage.mandatory).toEqual({ covered: 0, total: 1 });
      expect(result.gaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "missing-evidence", requirementOrdinal: 0 }),
          expect.objectContaining({ kind: "unknown-information", requirementOrdinal: 1 }),
        ]),
      );
    }
  });
  it("identifies a years shortfall as a longer-term experience gap", () => {
    const [result] = rankMatches(
      snapshot({
        jobs: [
          job({ conditions: { workAuthorization: null, education: null, experienceYears: 5 } }),
        ],
        constraints: { experienceYears: 1, confirmations: [] },
      }),
    );
    expect(result.action).toBe("longer-term-target");
    expect(result.gaps.some((item) => item.kind === "longer-term-experience")).toBe(true);
  });
  it("rejects spoofed observation semantics and duplicate or unversioned confirmations", () => {
    expect(
      matchEvidenceSchema.safeParse(evidence({ source: "self-report", signal: "support" })).success,
    ).toBe(false);
    expect(
      matchEvidenceSchema.safeParse(
        evidence({ source: "scenario", signal: "support", rubricVersion: null }),
      ).success,
    ).toBe(false);
    const confirmation = {
      jobVersionId: crypto.randomUUID(),
      field: "education",
      answer: "confirmed",
    };
    expect(
      matchConstraintsSchema.safeParse({
        experienceYears: null,
        confirmations: [confirmation, confirmation],
      }).success,
    ).toBe(false);
    expect(
      matchConstraintsSchema.safeParse({
        experienceYears: null,
        confirmations: [{ field: "education", answer: "confirmed" }],
      }).success,
    ).toBe(false);
  });
});
