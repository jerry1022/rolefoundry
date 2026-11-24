import { z } from "zod";
import { tracks, type Track } from "../skills/catalog";
import { skillIdSchema } from "../skills/model";
const workplace = z.enum(["Remote", "Hybrid", "On-site"]);
export const matchEvidenceSchema = z
  .object({
    id: z.uuid(),
    versionId: z.uuid(),
    label: z.string().max(160),
    context: z.string().max(2000),
    source: z.enum(["self-report", "portfolio-reference", "scenario", "resume-claim"]),
    signal: z.enum(["support", "practice", "claim", "reference", "learning"]),
    skills: z.array(skillIdSchema),
    sourceVersion: z.string(),
    rubricVersion: z.string().nullable(),
  })
  .refine((value) => {
    if (value.source === "scenario")
      return ["support", "practice"].includes(value.signal) && !!value.rubricVersion;
    if (value.source === "self-report") return ["claim", "learning"].includes(value.signal);
    return value.source === "portfolio-reference"
      ? value.signal === "reference"
      : value.signal === "claim";
  });
export type MatchEvidence = z.infer<typeof matchEvidenceSchema>;
/** Consuming-module projection: no database rows, privileged clients or demo workspace. */
export const matchJobInputSchema = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  title: z.string(),
  company: z.string(),
  track: z.enum(tracks),
  workplace: workplace.nullable(),
  level: z.enum(["Intern", "Entry", "Mid", "Senior", "Lead"]).nullable(),
  requirements: z.array(
    z.object({
      text: z.string(),
      priority: z.enum(["mandatory", "preferred"]),
      skills: z.array(skillIdSchema),
    }),
  ),
  conditions: z.object({
    workAuthorization: z.string().nullable(),
    education: z.string().nullable(),
    experienceYears: z.number().min(0).max(80).nullable(),
  }),
});
export type MatchJobInput = z.infer<typeof matchJobInputSchema>;
export const matchConstraintsSchema = z
  .object({
    experienceYears: z.number().min(0).max(80).nullable(),
    confirmations: z
      .array(
        z
          .object({
            jobVersionId: z.uuid().transform((value) => value.toLowerCase()),
            field: z.enum(["workAuthorization", "education"]),
            answer: z.enum(["confirmed", "conflict", "unknown"]),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.confirmations.map((item) => `${item.jobVersionId}:${item.field}`)).size ===
      value.confirmations.length,
  );
export type MatchConstraints = z.infer<typeof matchConstraintsSchema>;
export interface MatchSnapshot {
  profileRevision: number;
  catalogRevision: number;
  dictionaryVersion: number;
  track: Track;
  workplaces: z.infer<typeof workplace>[];
  constraints: MatchConstraints;
  evidence: MatchEvidence[];
  jobs: MatchJobInput[];
}
export interface ConditionCheck {
  field: "workplace" | "experienceYears" | "workAuthorization" | "education" | "seniority";
  status: "confirmed" | "conflict" | "unknown";
  requirement: string | null;
  basis: "preference" | "self-report" | "owner-confirmation" | "unknown";
  reason: string;
}
export interface EvidenceReference {
  evidenceId: string;
  versionId: string;
  source: MatchEvidence["source"];
  signal: MatchEvidence["signal"];
  label: string;
  context: string;
  sourceVersion: string;
  rubricVersion: string | null;
}
export interface RequirementReason {
  jobVersionId: string;
  ordinal: number;
  text: string;
  priority: "mandatory" | "preferred";
  skills: { skillId: string; support: EvidenceReference[]; practice: EvidenceReference[] }[];
}
export interface GapItem {
  kind:
    "missing-evidence" | "short-term-learning" | "longer-term-experience" | "unknown-information";
  skillId: string | null;
  requirementOrdinal: number | null;
  priority: "mandatory" | "preferred";
  reason: string;
}
export interface MatchResult {
  jobId: string;
  jobVersionId: string;
  title: string;
  company: string;
  recipe: "rules-v1";
  conditions: ConditionCheck[];
  requirements: RequirementReason[];
  coverage: {
    mandatory: { covered: number; total: number };
    preferred: { covered: number; total: number };
  };
  gaps: GapItem[];
  action: "explore-now" | "strengthen-evidence" | "longer-term-target" | "condition-conflict";
  limitations: string[];
}

export const matchSnapshotSchema: z.ZodType<MatchSnapshot> = z
  .object({
    profileRevision: z.number().int().nonnegative(),
    catalogRevision: z.number().int().nonnegative(),
    dictionaryVersion: z.number().int().positive(),
    track: z.enum(tracks),
    workplaces: z.array(workplace).max(3),
    constraints: matchConstraintsSchema,
    evidence: z.array(matchEvidenceSchema).max(500),
    jobs: z.array(matchJobInputSchema).max(200),
  })
  .refine(
    (input) =>
      new Set(input.evidence.map((item) => item.versionId)).size === input.evidence.length &&
      new Set(input.jobs.map((item) => item.id)).size === input.jobs.length,
  );
const referenceSchema = z
  .object({
    evidenceId: z.uuid(),
    versionId: z.uuid(),
    source: z.enum(["self-report", "portfolio-reference", "scenario", "resume-claim"]),
    signal: z.enum(["support", "practice", "claim", "reference", "learning"]),
    label: z.string().max(160),
    context: z.string().max(2000),
    sourceVersion: z.string(),
    rubricVersion: z.string().nullable(),
  })
  .strict();
const coverageSchema = z
  .object({ covered: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
  .strict()
  .refine((value) => value.covered <= value.total);
export const matchResultSchema = z
  .object({
    jobId: z.uuid(),
    jobVersionId: z.uuid(),
    title: z.string(),
    company: z.string(),
    recipe: z.literal("rules-v1"),
    conditions: z
      .array(
        z
          .object({
            field: z.enum([
              "workplace",
              "experienceYears",
              "workAuthorization",
              "education",
              "seniority",
            ]),
            status: z.enum(["confirmed", "conflict", "unknown"]),
            requirement: z.string().nullable(),
            basis: z.enum(["preference", "self-report", "owner-confirmation", "unknown"]),
            reason: z.string(),
          })
          .strict(),
      )
      .length(5),
    requirements: z
      .array(
        z
          .object({
            jobVersionId: z.uuid(),
            ordinal: z.number().int().nonnegative(),
            text: z.string(),
            priority: z.enum(["mandatory", "preferred"]),
            skills: z.array(
              z
                .object({
                  skillId: skillIdSchema,
                  support: z.array(referenceSchema),
                  practice: z.array(referenceSchema),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .max(20),
    coverage: z.object({ mandatory: coverageSchema, preferred: coverageSchema }).strict(),
    gaps: z.array(
      z
        .object({
          kind: z.enum([
            "missing-evidence",
            "short-term-learning",
            "longer-term-experience",
            "unknown-information",
          ]),
          skillId: skillIdSchema.nullable(),
          requirementOrdinal: z.number().int().nonnegative().nullable(),
          priority: z.enum(["mandatory", "preferred"]),
          reason: z.string(),
        })
        .strict(),
    ),
    action: z.enum([
      "explore-now",
      "strengthen-evidence",
      "longer-term-target",
      "condition-conflict",
    ]),
    limitations: z.array(z.string()),
  })
  .strict();
export const refreshMatchSchema = z
  .object({
    jobId: z.uuid().nullable(),
    constraints: matchConstraintsSchema,
    /** Opt-in semantic tie-breaking; needs `matching` consent and weekly allowance. */
    semantic: z.boolean().optional(),
  })
  .strict();
export type RefreshMatchInput = z.infer<typeof refreshMatchSchema>;
export const semanticRequestStateSchema = z.object({
  state: z.enum(["not-requested", "reserved", "unavailable"]),
  code: z.string().nullable(),
});
export const matchTaskSchema = z.object({
  runId: z.uuid(),
  taskId: z.uuid(),
  status: z.enum(["queued", "running", "failed", "succeeded"]),
  semantic: semanticRequestStateSchema.optional(),
});
export type MatchTask = z.infer<typeof matchTaskSchema>;
const runStatus = z.enum(["queued", "running", "succeeded", "failed", "invalidated"]);
export const matchRunSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  targetJobId: z.uuid().nullable(),
  status: runStatus,
  profileRevision: z.number().int().nonnegative(),
  catalogRevision: z.number().int().nonnegative(),
  dictionaryVersion: z.number().int().positive(),
  recipe: z.literal("rules-v1"),
  /** Which ordering actually applied; structured results are always rules-v1. */
  ranking: z
    .object({
      recipe: z.enum(["rules-v1", "rules-v1+semantic-rank-v1"]),
      state: z.enum(["not-requested", "applied", "fallback"]),
      code: z.string().nullable(),
    })
    .optional(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  stale: z.boolean(),
  constraints: matchConstraintsSchema.nullable(),
  candidateCount: z.number().int().nonnegative(),
  data: z.array(
    matchResultSchema.extend({
      available: z.boolean(),
      freshness: z.enum(["current", "uncertain"]).nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export type MatchRun = z.infer<typeof matchRunSchema>;
export const matchHistorySchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      targetJobId: z.uuid().nullable(),
      status: runStatus,
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export type MatchHistory = z.infer<typeof matchHistorySchema>;
