import {
  confirmedResumeSchema,
  extractedResumeSchema,
  revisionInputSchema,
  revisionOutputSchema,
  ResumeProcessingError,
  resumeLimits,
} from "./model";
import type {
  ConfirmedResume,
  ExtractedResume,
  ResumeRevisionInput,
  ResumeRevisionOutput,
} from "./model";

/** Offsets refer to the normalized extracted UTF-16 text, never to PDF byte offsets. */
export function extractedText(
  pages: { text: string; page: number | null }[],
  id: () => string,
): ExtractedResume {
  const blocks: ExtractedResume["blocks"] = [];
  let text = "";
  for (const page of pages) {
    const normalized = page.text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim();
    if (!normalized) continue;
    if (text) text += "\n\n";
    const offset = text.length;
    text += normalized;
    for (const match of normalized.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)) {
      const value = match[0].trimEnd();
      if (value)
        blocks.push({
          id: id(),
          text: value,
          source: {
            start: offset + match.index!,
            end: offset + match.index! + value.length,
            page: page.page,
          },
        });
    }
  }
  if (!text.trim()) throw new ResumeProcessingError("empty-text");
  if (text.length > resumeLimits.textCharacters || blocks.length > resumeLimits.blocks)
    throw new ResumeProcessingError("too-large");
  const parsed = extractedResumeSchema.safeParse({
    text,
    blocks,
    pageCount: pages.some((p) => p.page !== null) ? pages.length : null,
    warnings: ["layout-not-preserved", "review-extracted-text"],
  });
  if (!parsed.success) throw new ResumeProcessingError("invalid-file");
  return parsed.data;
}

export function sectionText(content: ConfirmedResume, sectionId: string): string {
  const section = content.sections.find((section) => section.id === sectionId);
  if (!section) throw new ResumeProcessingError("invalid-output");
  return section.factIds
    .map((id) => content.facts.find((fact) => fact.id === id)!.text)
    .join("\n\n");
}

/** Deliberately constrained fallback: reorder exact confirmed statements, never generate claims. */
export function proposeResumeOrder(
  input: ResumeRevisionInput,
  id: () => string,
): ResumeRevisionOutput {
  input = revisionInputSchema.parse(input);
  const target = new Set(input.target.skillIds),
    content = input.version.content;
  const facts = new Map(content.facts.map((fact) => [fact.id, fact]));
  // Learning goals are not evidence of a completed skill/project.
  const coverage = new Set(
    content.facts.filter((fact) => fact.state !== "learning").flatMap((fact) => fact.skillIds),
  );
  const changes: ResumeRevisionOutput["changes"] = [];
  for (const section of content.sections) {
    const score = (factId: string) => {
      const fact = facts.get(factId)!;
      return fact.state === "learning"
        ? 0
        : fact.skillIds.filter((skill) => target.has(skill)).length;
    };
    const order = section.factIds
      .map((id, index) => ({ id, index }))
      .sort((a, b) => score(b.id) - score(a.id) || a.index - b.index)
      .map((item) => item.id);
    if (order.some((id, index) => id !== section.factIds[index]))
      changes.push({
        id: id(),
        sectionId: section.id,
        beforeText: sectionText(content, section.id),
        afterText: order.map((id) => facts.get(id)!.text).join("\n\n"),
        factIds: order,
        reason:
          "Place confirmed statements linked to the target's skills earlier in this section. Their wording and completion state are unchanged.",
      });
  }
  return revisionOutputSchema.parse({
    recipe: "resume-order-v1",
    versionId: input.version.id,
    jobVersionId: input.target.jobVersionId,
    changes,
    questions: [...target]
      .filter((skill) => !coverage.has(skill))
      .map((skill) => ({
        skillId: skill,
        prompt:
          "Do you have a real example for this requirement? Add it as a separately confirmed fact if appropriate; the requirement is not added as a claim.",
      })),
    limitations: [
      "This deterministic fallback reorders existing confirmed statements only; it does not rewrite, measure ATS fit or certify ability.",
      "Linked skills are owner-confirmed labels. Target requirements are not proof of personal experience.",
      "Model-assisted wording requires the separately evaluated AI Gateway integration.",
    ],
  });
}

/** Publication validates every cited ID and exact before/after content, including replaced adapters. */
export function validateResumeRevision(
  input: ResumeRevisionInput,
  output: unknown,
): ResumeRevisionOutput {
  input = revisionInputSchema.parse(input);
  const parsed = revisionOutputSchema.safeParse(output);
  if (!parsed.success) throw new ResumeProcessingError("invalid-output");
  const proposal = parsed.data;
  const sectionIds = new Set<string>(),
    facts = new Map(input.version.content.facts.map((fact) => [fact.id, fact]));
  if (
    proposal.versionId !== input.version.id ||
    proposal.jobVersionId !== input.target.jobVersionId
  )
    throw new ResumeProcessingError("invalid-output");
  for (const change of proposal.changes) {
    const section = input.version.content.sections.find(
      (section) => section.id === change.sectionId,
    );
    if (
      !section ||
      sectionIds.has(section.id) ||
      change.beforeText !== sectionText(input.version.content, section.id) ||
      change.factIds.length !== section.factIds.length ||
      new Set(change.factIds).size !== change.factIds.length ||
      change.factIds.some((id) => !section.factIds.includes(id)) ||
      change.afterText !== change.factIds.map((id) => facts.get(id)!.text).join("\n\n")
    )
      throw new ResumeProcessingError("invalid-output");
    sectionIds.add(section.id);
  }
  if (proposal.questions.some((question) => !input.target.skillIds.includes(question.skillId)))
    throw new ResumeProcessingError("invalid-output");
  return proposal;
}

export function acceptResumeChanges(
  input: ResumeRevisionInput,
  output: unknown,
  acceptedIds: string[],
): ConfirmedResume {
  input = revisionInputSchema.parse(input);
  acceptedIds = acceptedIds.map((id) => id.toLowerCase());
  const proposal = validateResumeRevision(input, output);
  if (
    new Set(acceptedIds).size !== acceptedIds.length ||
    acceptedIds.some((id) => !proposal.changes.some((change) => change.id === id))
  )
    throw new ResumeProcessingError("invalid-output");
  const accepted = new Set(acceptedIds);
  return confirmedResumeSchema.parse({
    ...input.version.content,
    sections: input.version.content.sections.map((section) => {
      const change = proposal.changes.find(
        (change) => change.sectionId === section.id && accepted.has(change.id),
      );
      return change ? { ...section, factIds: change.factIds } : section;
    }),
  });
}

/** Exact visible source for the controlled PDF template; status is part of confirmed content. */
export function resumeRenderSections(
  content: ConfirmedResume,
): { heading: string; statements: string[] }[] {
  content = confirmedResumeSchema.parse(content);
  return content.sections.map((section) => ({
    heading: section.heading,
    statements: section.factIds.map((id) => {
      const fact = content.facts.find((fact) => fact.id === id)!;
      const prefix =
        fact.state === "in-progress"
          ? "[In progress] "
          : fact.state === "learning"
            ? "[Learning goal] "
            : "";
      return prefix + fact.text;
    }),
  }));
}
export function resumeText(content: ConfirmedResume): string {
  return resumeRenderSections(content)
    .map((section) => `${section.heading}\n${section.statements.join("\n\n")}`)
    .join("\n\n");
}

/** Ignore layout whitespace around Han characters, while preserving Latin word boundaries. */
export function resumeContentTokens(text: string): string[] {
  return text.match(/\p{Script=Han}|[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}\s]/gu) ?? [];
}
