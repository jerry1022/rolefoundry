import type {
  LearningSnapshot,
  LearningGapInput,
  LearningOutput,
  LearningCourse,
  LearningStep,
} from "./model";
/** Pure scheduling rules: progress never becomes evidence and unknowns never become qualifications. */
export function planLearning(input: LearningSnapshot, gapInput: LearningGapInput): LearningOutput {
  const budget = Math.floor(input.weeklyHours * 60),
    remaining = [budget, budget];
  const steps: LearningStep[] = [],
    issues: LearningOutput["issues"] = [];
  const completed = new Set(input.completedCourseIds),
    supported = new Set(gapInput.supportedSkills),
    courses = new Map(input.courses.map((course) => [course.id, course]));
  const used = new Set<string>(),
    visiting = new Set<string>();
  const available = (course: LearningCourse) => course.availability === "available";
  function duration(course: LearningCourse) {
    const override = input.durationOverrides.find((item) => item.courseId === course.id);
    return override
      ? { minutes: override.minutes, basis: "owner-estimate" as const }
      : course.officialMinutes !== null
        ? { minutes: course.officialMinutes, basis: "official" as const }
        : course.editorialMinutes !== null
          ? { minutes: course.editorialMinutes, basis: "editorial" as const }
          : null;
  }
  function allocate(minutes: number) {
    const weeks: LearningStep["weeks"] = [];
    let pending = minutes;
    for (let index = 0; index < 2 && pending > 0; index++) {
      const used = Math.min(pending, remaining[index]);
      if (used) {
        remaining[index] -= used;
        pending -= used;
        weeks.push({ week: (index + 1) as 1 | 2, minutes: used });
      }
    }
    return { weeks, scheduled: minutes - pending };
  }
  function foundationFor(skill: string, exclude: string) {
    return input.courses
      .filter(
        (course) =>
          course.id !== exclude &&
          available(course) &&
          course.skills.includes(skill) &&
          !completed.has(course.id),
      )
      .sort(
        (a, b) =>
          a.prerequisiteSkills.filter((value) => !supported.has(value)).length -
            b.prerequisiteSkills.filter((value) => !supported.has(value)).length ||
          (duration(a)?.minutes ?? Infinity) - (duration(b)?.minutes ?? Infinity) ||
          a.id.localeCompare(b.id),
      )[0];
  }
  function addCourse(course: LearningCourse): boolean {
    if (completed.has(course.id)) return true;
    if (steps.length >= 40) {
      issues.push({
        skillId: null,
        kind: "time-budget",
        reason:
          "The initial plan reached its 40-step review limit. Remaining work needs a later plan.",
      });
      return false;
    }
    if (used.has(course.id))
      return steps.find((step) => step.courseId === course.id)?.scope === "full-resource";
    if (visiting.has(course.id) || !available(course)) return false;
    visiting.add(course.id);
    const dependencies: string[] = [];
    let blocked = false;
    for (const id of course.prerequisiteCourseIds) {
      if (completed.has(id)) continue;
      const prerequisite = courses.get(id);
      if (!prerequisite || !addCourse(prerequisite)) blocked = true;
      else dependencies.push(`course:${id}`);
    }
    for (const skill of course.prerequisiteSkills) {
      if (supported.has(skill)) continue;
      const prerequisite = foundationFor(skill, course.id);
      if (!prerequisite || !addCourse(prerequisite)) blocked = true;
      else dependencies.push(`course:${prerequisite.id}`);
    }
    visiting.delete(course.id);
    if (blocked) {
      for (const skill of course.skills)
        issues.push({
          skillId: skill,
          kind: "blocked-prerequisite",
          reason:
            "A required foundation is missing, unavailable, cyclic or cannot finish inside this two-week budget.",
        });
      return false;
    }
    const estimate = duration(course);
    if (!estimate) {
      for (const skill of course.skills)
        issues.push({
          skillId: skill,
          kind: "unknown-duration",
          reason:
            "No reviewed duration or owner estimate is available. Adjust the estimate before scheduling this resource.",
        });
      return false;
    }
    if (!remaining.some(Boolean)) {
      for (const skill of course.skills)
        issues.push({
          skillId: skill,
          kind: "time-budget",
          reason:
            "This resource needs a later stage because the two-week time budget is already allocated.",
        });
      return false;
    }
    const allocation = allocate(estimate.minutes + course.practice.minutes);
    const study = Math.min(estimate.minutes, allocation.scheduled),
      practice = Math.max(0, allocation.scheduled - study);
    const full = study === estimate.minutes && practice === course.practice.minutes;
    steps.push({
      key: `course:${course.id}`,
      kind: "course",
      courseId: course.id,
      courseVersionId: course.versionId,
      title: course.title,
      skills: course.skills,
      durationBasis: estimate.basis,
      studyMinutes: study,
      practiceMinutes: practice,
      remainingMinutes: estimate.minutes + course.practice.minutes - allocation.scheduled,
      scope: full ? "full-resource" : "partial-resource",
      weeks: allocation.weeks,
      dependsOn: [...new Set(dependencies)],
      practicePrompt: course.practice.prompt,
      completionCriteria: full
        ? course.practice.completionCriteria
        : `Complete the assigned ${study} study minutes, keep notes and continue the remaining work in a later plan. This step does not mean course completion.`,
      notes: [
        "Course and step completion are self-reported progress, not verified ability.",
        ...(!full ? ["Only a portion fits in two weeks; later work remains explicit."] : []),
        ...(estimate.basis !== "official"
          ? ["This duration is an estimate; review and adjust it to your pace."]
          : []),
        ...(course.prerequisiteSkills.length
          ? [
              "Prerequisite skill support may be self-reported or scoped; confirm it before relying on it.",
            ]
          : []),
      ],
    });
    used.add(course.id);
    return full;
  }
  const distinctGaps = new Map<string, LearningGapInput["gaps"][number]>();
  for (const gap of gapInput.gaps
    .filter((gap) => gap.skillId && ["missing-evidence", "short-term-learning"].includes(gap.kind))
    .sort((a, b) => Number(b.priority === "mandatory") - Number(a.priority === "mandatory")))
    if (!distinctGaps.has(gap.skillId!)) distinctGaps.set(gap.skillId!, gap);
  const gaps = [...distinctGaps.values()];
  for (const gap of gapInput.gaps.filter(
    (gap) => !gap.skillId || !["missing-evidence", "short-term-learning"].includes(gap.kind),
  ))
    issues.push({ skillId: gap.skillId, kind: "non-learning-gap", reason: gap.reason });
  for (const gap of gaps) {
    if (steps.some((step) => step.skills.includes(gap.skillId!))) continue;
    const candidates = input.courses
      .filter(
        (course) =>
          available(course) && course.skills.includes(gap.skillId!) && !completed.has(course.id),
      )
      .sort(
        (a, b) =>
          a.prerequisiteSkills.filter((skill) => !supported.has(skill)).length -
            b.prerequisiteSkills.filter((skill) => !supported.has(skill)).length ||
          b.skills.filter((skill) => gaps.some((gap) => gap.skillId === skill)).length -
            a.skills.filter((skill) => gaps.some((gap) => gap.skillId === skill)).length ||
          (duration(a)?.minutes ?? Infinity) - (duration(b)?.minutes ?? Infinity) ||
          a.id.localeCompare(b.id),
      );
    if (candidates.length) {
      for (const candidate of candidates) {
        addCourse(candidate);
        if (steps.some((step) => step.skills.includes(gap.skillId!))) break;
      }
      continue;
    }
    const alreadyCompleted = input.courses.some(
      (course) => course.skills.includes(gap.skillId!) && completed.has(course.id),
    );
    issues.push({
      skillId: gap.skillId,
      kind: alreadyCompleted ? "completed-needs-evidence" : "no-resource",
      reason: alreadyCompleted
        ? "A related course is already reported complete. Build or assess evidence instead of repeating it automatically."
        : "No reviewed, available resource covers this gap. This provider may not cover the domain.",
    });
    if (steps.length < 40 && remaining.reduce((a, b) => a + b, 0) >= 5) {
      const allocation = allocate(
        Math.min(
          30,
          remaining.reduce((a, b) => a + b, 0),
        ),
      );
      steps.push({
        key: `practice:${gap.skillId}`,
        kind: "practice",
        courseId: null,
        courseVersionId: null,
        title: `Practice ${gap.skillId}`,
        skills: [gap.skillId!],
        durationBasis: "practice",
        studyMinutes: 0,
        practiceMinutes: allocation.scheduled,
        remainingMinutes: 0,
        scope: "practice-only",
        weeks: allocation.weeks,
        dependsOn: [],
        practicePrompt: `Create a small example demonstrating ${gap.skillId}; describe its limits and one test.`,
        completionCriteria:
          "Keep a reference and a short explanation, then request assessment or independent review. No ability is promoted automatically.",
        notes: [
          "This is an original editorial practice prompt, not a provider course or graded evidence.",
        ],
      });
    }
  }
  if (
    steps.length === 40 &&
    gaps.some((gap) => !steps.some((step) => step.skills.includes(gap.skillId!)))
  )
    issues.push({
      skillId: null,
      kind: "time-budget",
      reason:
        "The initial plan reached its 40-step review limit. Remaining gaps need a later plan.",
    });
  if (!budget)
    issues.push({
      skillId: null,
      kind: "time-budget",
      reason: "No weekly time is allocated. Choose a positive time budget to schedule learning.",
    });
  return {
    recipe: "learning-rules-v1",
    matchingRecipe: gapInput.recipe,
    budgetMinutes: budget * 2,
    scheduledMinutes: budget * 2 - remaining[0] - remaining[1],
    steps,
    issues,
    limitations: [
      "This is an initial two-week plan, not a promise of course completion or professional proficiency.",
      "Resource facts belong to the provider; summaries, mappings, estimates and practice prompts are editorial.",
      "Completing a course or submitting a reference never changes capability evidence.",
    ],
  };
}
