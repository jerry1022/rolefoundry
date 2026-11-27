import { describe, expect, it } from "vitest";
import {
  extractionPasses,
  runExtractionCalibration,
  scoreExtraction,
  skillExtractionRequest,
  type SkillExtractor,
} from "../../src/modules/resume/skill-extraction";
import {
  extractionSkills,
  reviewedResumes,
} from "../../src/modules/resume/skill-extraction-examples";
import { skillExtractionSpec, type SkillExtractionOutput } from "../../src/modules/gateway/recipes";

const facts = [{ id: "f1", text: "Wrote SQL queries to track weekly ticket volume." }];
const request = skillExtractionRequest(facts, extractionSkills, {
  taskId: "t",
  ownerId: "o",
  inputVersion: "v",
  locale: "en",
});
const verify = (output: SkillExtractionOutput) =>
  skillExtractionSpec.verify!(skillExtractionSpec.schema.parse(output), request);

describe("skill extraction grounding", () => {
  it("accepts listed skills quoted from their own fact", () => {
    expect(
      verify({
        facts: [{ factRef: "f1", skills: [{ skillRef: "sql", quote: "wrote  SQL queries" }] }],
      }),
    ).toBe(true);
    expect(verify({ facts: [] })).toBe(true);
  });

  it("rejects unlisted skills, invented quotes, duplicates and skill refs used as facts", () => {
    const sql = { skillRef: "sql", quote: "SQL queries" };
    expect(
      verify({ facts: [{ factRef: "f1", skills: [{ skillRef: "java", quote: "SQL" }] }] }),
    ).toBe(false);
    expect(
      verify({
        facts: [{ factRef: "f1", skills: [{ skillRef: "python", quote: "Python scripts" }] }],
      }),
    ).toBe(false);
    expect(verify({ facts: [{ factRef: "f1", skills: [sql, sql] }] })).toBe(false);
    expect(
      verify({
        facts: [
          { factRef: "f1", skills: [sql] },
          { factRef: "f1", skills: [] },
        ],
      }),
    ).toBe(false);
    expect(verify({ facts: [{ factRef: "sql", skills: [] }] })).toBe(false);
  });

  it("sends skills and facts as data with only their refs allowed", () => {
    expect(request.allowedRefs).toContain("f1");
    expect(request.allowedRefs).toContain("rag");
    expect(request.segments.find((segment) => segment.ref === "rag")?.text).toBe(
      "RAG & retrieval / RAG 與檢索",
    );
  });
});

describe("skill extraction calibration", () => {
  it("scores pairs and counts failed batches as missed labels", () => {
    const report = scoreExtraction([
      {
        facts: 2,
        expected: new Set(["a:sql", "b:python"]),
        predicted: new Set(["a:sql", "a:rag"]),
      },
      { facts: 1, expected: new Set(["c:sql"]), predicted: null },
    ]);
    expect(report).toMatchObject({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 2,
      precision: 0.5,
      ungradedBatches: 1,
    });
    expect(report.recall).toBeCloseTo(1 / 3);
    expect(extractionPasses(report)).toBe(false);
  });

  it("keeps the reviewed set bilingual, large enough and grounded", () => {
    const allFacts = reviewedResumes.flatMap((resume) => resume.facts);
    expect(allFacts.length).toBeGreaterThanOrEqual(30);
    expect(new Set(reviewedResumes.map((resume) => resume.locale))).toEqual(
      new Set(["en", "zh-TW"]),
    );
    expect(new Set(allFacts.map((fact) => fact.id)).size).toBe(allFacts.length);
    const known = new Set(extractionSkills.map((skill) => skill.id));
    for (const fact of allFacts)
      for (const [skill, evidence] of Object.entries(fact.labels)) {
        expect(known.has(skill)).toBe(true);
        expect(fact.text).toContain(evidence);
      }
    expect(
      allFacts.filter((fact) => !Object.keys(fact.labels).length).length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("passes the gate for an extractor that reproduces reviewer labels", async () => {
    const byVersion = new Map(
      reviewedResumes.map((resume) => [`calibration:${resume.id}`, resume]),
    );
    const oracle: SkillExtractor = async (graded) => {
      const resume = byVersion.get(graded.inputVersion)!;
      const output = {
        facts: resume.facts.map((fact) => ({
          factRef: fact.id,
          skills: Object.entries(fact.labels).map(([skillRef, quote]) => ({ skillRef, quote })),
        })),
      };
      expect(skillExtractionSpec.verify!(output, graded)).toBe(true);
      return { state: "succeeded", code: null, output };
    };
    const run = await runExtractionCalibration(
      oracle,
      reviewedResumes,
      extractionSkills,
      new AbortController().signal,
    );
    expect(run.report).toMatchObject({ precision: 1, recall: 1 });
    expect(run.passes).toBe(true);
  });
});
