import type {
  ConditionCheck,
  EvidenceReference,
  MatchEvidence,
  MatchJobInput,
  MatchResult,
  MatchSnapshot,
} from "./model";
function evidenceReference(evidence: MatchEvidence): EvidenceReference {
  return {
    evidenceId: evidence.id,
    versionId: evidence.versionId,
    source: evidence.source,
    signal: evidence.signal,
    label: evidence.label,
    context: evidence.context,
    sourceVersion: evidence.sourceVersion,
    rubricVersion: evidence.rubricVersion,
  };
}
function conditions(job: MatchJobInput, snapshot: MatchSnapshot): ConditionCheck[] {
  const workplace =
    job.workplace && snapshot.workplaces.length
      ? snapshot.workplaces.includes(job.workplace)
        ? "confirmed"
        : "conflict"
      : "unknown";
  const experience =
    job.conditions.experienceYears !== null && snapshot.constraints.experienceYears !== null
      ? snapshot.constraints.experienceYears >= job.conditions.experienceYears
        ? "confirmed"
        : "conflict"
      : "unknown";
  return [
    {
      field: "seniority",
      status: "unknown",
      requirement: job.level,
      basis: "unknown",
      reason:
        "Seniority fit has not been established. Skill overlap and self-reported years do not determine it.",
    },
    {
      field: "workplace",
      status: workplace,
      requirement: job.workplace,
      basis: workplace === "unknown" ? "unknown" : "preference",
      reason:
        workplace === "confirmed"
          ? "The listed workplace matches an explicit preference."
          : workplace === "conflict"
            ? "The listed workplace is outside the selected preferences."
            : "Workplace or preference information is missing.",
    },
    {
      field: "experienceYears",
      status: experience,
      requirement:
        job.conditions.experienceYears === null
          ? null
          : `At least ${job.conditions.experienceYears} years`,
      basis: experience === "unknown" ? "unknown" : "self-report",
      reason:
        experience === "confirmed"
          ? "Self-reported years meet the listed minimum; relevance still needs review."
          : experience === "conflict"
            ? "Self-reported years are below the listed minimum."
            : "Experience requirements or self-reported years are unknown.",
    },
    ...(["workAuthorization", "education"] as const).map((field) => {
      const requirement = job.conditions[field];
      const answer = requirement
        ? snapshot.constraints.confirmations.find(
            (item) => item.jobVersionId === job.versionId && item.field === field,
          )?.answer
        : undefined;
      return {
        field,
        status: answer || "unknown",
        requirement,
        basis: answer && answer !== "unknown" ? "owner-confirmation" : "unknown",
        reason:
          answer === "confirmed"
            ? "The owner reports meeting this exact listed requirement; it is not independently verified."
            : answer === "conflict"
              ? "The owner reports not meeting this listed requirement."
              : "No conclusion can be drawn from the available information.",
      } satisfies ConditionCheck;
    }),
  ];
}
/** Deterministic, source-grounded ranking. No inferred qualifications or model-generated facts. */
const ratio = (value: { covered: number; total: number }) =>
  value.total ? value.covered / value.total : 0;

/** Limitation text that rules-v1 attaches when no semantic ordering was applied. */
export const rulesOnlyLimitation =
  "This recipe uses rules only; semantic/model ranking and narrative generation are unavailable.";
export const semanticOrderLimitation =
  "Order within equal rule results used semantic-rank-v1; strengths, gaps and conditions remain rule-based.";

export function rankMatches(snapshot: MatchSnapshot): MatchResult[] {
  const evidence = [...new Map(snapshot.evidence.map((item) => [item.versionId, item])).values()];
  const results = snapshot.jobs.map((job) => {
    const checks = conditions(job, snapshot);
    const gaps: MatchResult["gaps"] = [];
    const requirements = job.requirements.map((requirement, ordinal) => {
      const skills = [...new Set(requirement.skills)].map((skillId) => {
        const linked = evidence.filter((item) => item.skills.includes(skillId));
        const support = linked
          .filter((item) => ["support", "claim", "reference"].includes(item.signal))
          .map(evidenceReference);
        const practice = linked.filter((item) => item.signal === "practice").map(evidenceReference);
        if (!support.length || practice.length)
          gaps.push({
            kind: practice.length ? "short-term-learning" : "missing-evidence",
            skillId,
            requirementOrdinal: ordinal,
            priority: requirement.priority,
            reason: practice.length
              ? "A scored scenario suggests revisiting this skill; other claims remain separate."
              : "No supporting evidence is linked to this requirement. This does not prove inability.",
          });
        return { skillId, support, practice };
      });
      if (!skills.length)
        gaps.push({
          kind: "unknown-information",
          skillId: null,
          requirementOrdinal: ordinal,
          priority: requirement.priority,
          reason: "This textual requirement has no reviewed skill mapping; check it directly.",
        });
      return {
        jobVersionId: job.versionId,
        ordinal,
        text: requirement.text,
        priority: requirement.priority,
        skills,
      };
    });
    const mandatory = new Map(
      requirements
        .filter((item) => item.priority === "mandatory")
        .flatMap((item) =>
          item.skills.map((skill) => [skill.skillId, skill.support.length > 0] as const),
        ),
    );
    const preferred = new Map(
      requirements
        .filter((item) => item.priority === "preferred")
        .flatMap((item) =>
          item.skills
            .filter((skill) => !mandatory.has(skill.skillId))
            .map((skill) => [skill.skillId, skill.support.length > 0] as const),
        ),
    );
    const coverage = {
      mandatory: { covered: [...mandatory.values()].filter(Boolean).length, total: mandatory.size },
      preferred: { covered: [...preferred.values()].filter(Boolean).length, total: preferred.size },
    };
    for (const check of checks) {
      if (check.status === "unknown")
        gaps.push({
          kind: "unknown-information",
          skillId: null,
          requirementOrdinal: null,
          priority: "mandatory",
          reason: check.reason,
        });
      if (check.field === "experienceYears" && check.status === "conflict")
        gaps.push({
          kind: "longer-term-experience",
          skillId: null,
          requirementOrdinal: null,
          priority: "mandatory",
          reason: check.reason,
        });
    }
    const conflicts = checks.filter((check) => check.status === "conflict");
    const action = conflicts.some((check) => check.field !== "experienceYears")
      ? "condition-conflict"
      : conflicts.length
        ? "longer-term-target"
        : mandatory.size &&
            coverage.mandatory.covered === mandatory.size &&
            !gaps.some(
              (item) => item.priority === "mandatory" && item.kind === "short-term-learning",
            ) &&
            !requirements.some((item) => item.priority === "mandatory" && !item.skills.length)
          ? "explore-now"
          : "strengthen-evidence";
    return {
      jobId: job.id,
      jobVersionId: job.versionId,
      title: job.title,
      company: job.company,
      recipe: "rules-v1",
      conditions: checks,
      requirements,
      coverage,
      gaps,
      action,
      limitations: [
        "Coverage counts linked observations, self-reports and unreviewed references; it does not establish independent mastery or hiring probability.",
        "An unknown condition is not a conflict. Confirm it with the source before deciding.",
        rulesOnlyLimitation,
      ],
    } satisfies MatchResult;
  });
  return results.sort(
    (left, right) =>
      structuralOrder(left, right) ||
      (left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0),
  );
}

/**
 * Structured facts first: fewer conflicts, more confirmed conditions, then mandatory and
 * preferred coverage. Returns 0 only for results that the rules cannot distinguish.
 */
export function structuralOrder(left: MatchResult, right: MatchResult) {
  const count = (result: MatchResult, status: "conflict" | "confirmed") =>
    result.conditions.filter((item) => item.status === status).length;
  return (
    count(left, "conflict") - count(right, "conflict") ||
    count(right, "confirmed") - count(left, "confirmed") ||
    ratio(right.coverage.mandatory) - ratio(left.coverage.mandatory) ||
    ratio(right.coverage.preferred) - ratio(left.coverage.preferred)
  );
}

/**
 * `semantic-rank-v1` may only replace the final job-ID tiebreak: a semantic score never moves a
 * result across a structural tier. Jobs without a score keep the rules order after scored ties.
 */
export function applySemanticTiebreak(
  ranked: readonly MatchResult[],
  scores: ReadonlyMap<string, number>,
) {
  const score = (result: MatchResult) => scores.get(result.jobId) ?? -1;
  return [...ranked].sort(
    (left, right) =>
      structuralOrder(left, right) ||
      score(right) - score(left) ||
      (left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0),
  );
}
