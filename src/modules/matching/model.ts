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
            jobVersionId: z.uuid(),
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
  field: "workplace" | "experienceYears" | "workAuthorization" | "education";
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
