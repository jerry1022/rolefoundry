"use client";
import { useState } from "react";
import { confirmedResumeSchema, resumeLimits } from "@/modules/resume/model";
import type { ResumeDocument, ConfirmedResume, ResumeFact } from "@/modules/resume/model";
import type { SkillDictionary } from "@/modules/skills/model";
function initial(document: ResumeDocument): ConfirmedResume {
  if (document.currentVersion) return structuredClone(document.currentVersion.content);
  const facts = (document.draft?.blocks || []).map((block) => ({
    id: crypto.randomUUID(),
    text: block.text,
    kind: "other" as const,
    state: "unspecified" as const,
    skillIds: [],
    sourceBlockId: block.id,
  }));
  return {
    facts,
    sections: [
      {
        id: crypto.randomUUID(),
        heading: "Profile and experience",
        factIds: facts.map((fact) => fact.id),
      },
    ],
  };
}
export function ResumeFactEditor({
  document,
  busy,
  dictionary,
  onConfirm,
}: {
  document: ResumeDocument;
  busy: boolean;
  dictionary: SkillDictionary | null;
  onConfirm: (content: ConfirmedResume, revision: number) => Promise<ResumeDocument>;
}) {
  const [draft, setDraft] = useState(() => initial(document)),
    [base, setBase] = useState(document.revision),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const clean = {
      facts: draft.facts,
      sections: draft.sections.filter((section) => section.factIds.length),
    },
    valid = confirmedResumeSchema.safeParse(clean);
  const labels = new Map(
    (dictionary?.skills || []).map((skill) => [skill.id, skill.nameEn] as const),
  );
  function change(value: ConfirmedResume) {
    setDraft(value);
    setDirty(true);
  }
  function update(id: string, patch: Partial<ResumeFact>) {
    change({
      ...draft,
      facts: draft.facts.map((fact) => (fact.id === id ? { ...fact, ...patch } : fact)),
    });
  }
  function add() {
    if (draft.facts.length >= resumeLimits.facts) return;
    const fact: ResumeFact = {
      id: crypto.randomUUID(),
      text: "",
      kind: "other",
      state: "unspecified",
      skillIds: [],
      sourceBlockId: null,
    };
    const sections = draft.sections.length
      ? draft.sections
      : [{ id: crypto.randomUUID(), heading: "Profile and experience", factIds: [] }];
    change({
      ...draft,
      facts: [...draft.facts, fact],
      sections: sections.map((section, index) =>
        index === 0 ? { ...section, factIds: [...section.factIds, fact.id] } : section,
      ),
    });
  }
  function remove(id: string) {
    change({
      ...draft,
      facts: draft.facts.filter((fact) => fact.id !== id),
      sections: draft.sections.map((section) => ({
        ...section,
        factIds: section.factIds.filter((factId) => factId !== id),
      })),
    });
  }
  function move(id: string, sectionId: string) {
    change({
      ...draft,
      sections: draft.sections.map((section) => ({
        ...section,
        factIds:
          section.id === sectionId
            ? [...section.factIds.filter((factId) => factId !== id), id]
            : section.factIds.filter((factId) => factId !== id),
      })),
    });
  }
  function split(fact: ResumeFact) {
    const parts: string[] = [];
    let remaining = fact.text;
    while (remaining.length > 4000) {
      let end = 4000;
      if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
      const space = remaining.lastIndexOf(" ", end);
      if (space > 2000) end = space;
      parts.push(remaining.slice(0, end));
      remaining = remaining.slice(end).trimStart();
    }
    if (remaining) parts.push(remaining);
    if (draft.facts.length + parts.length - 1 > resumeLimits.facts) return;
    const facts = parts.map((text, index) => ({
      ...fact,
      id: index === 0 ? fact.id : crypto.randomUUID(),
      text,
    }));
    change({
      ...draft,
      facts: draft.facts.flatMap((item) => (item.id === fact.id ? facts : [item])),
      sections: draft.sections.map((section) => ({
        ...section,
        factIds: section.factIds.flatMap((id) =>
          id === fact.id ? facts.map((part) => part.id) : [id],
        ),
      })),
    });
  }
  async function submit() {
    if (!valid.success) return;
    setSaving(true);
    try {
      const saved = await onConfirm(valid.data, base);
      setDraft(structuredClone(saved.currentVersion!.content));
      setBase(saved.revision);
      setDirty(false);
    } catch {
      /* The parent shows the safe error; preserve this draft. */
    } finally {
      setSaving(false);
    }
  }
  let ordinal = 0;
  return (
    <section className="panel section-block">
      <h2>Review and confirm the facts</h2>
      <p className="muted">
        Extracted text is a draft. Check each statement, completion state and linked skill.
        Confirmed links become unreviewed resume claims in your private skill profile; learning
        goals do not become ability evidence.
      </p>
      {base !== document.revision && (
        <div className="notice" role="status">
          <p>
            A newer source version is available. Your unsaved edits are still here. Review it before
            confirming again.
          </p>
          <button
            className="button secondary"
            disabled={busy || saving}
            onClick={() => {
              setDraft(initial(document));
              setBase(document.revision);
              setDirty(false);
            }}
          >
            {dirty ? "Discard draft and load latest facts" : "Load latest confirmed facts"}
          </button>
          {dirty && (
            <button
              type="button"
              className="button secondary"
              disabled={busy || saving}
              onClick={() => setBase(document.revision)}
            >
              Keep this draft for review
            </button>
          )}
          {dirty && (
            <p className="fine-print">
              Keeping this draft allows a new confirmation against the latest revision. Review the
              current version before replacing its claims.
            </p>
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy || saving} className="resume-editor-fields">
          {draft.sections.map((section) => (
            <section className="resume-edit-section" key={section.id}>
              <label>
                Section heading
                <input
                  aria-label="Resume section heading"
                  className="text-input"
                  maxLength={120}
                  value={section.heading}
                  onChange={(event) =>
                    change({
                      ...draft,
                      sections: draft.sections.map((item) =>
                        item.id === section.id ? { ...item, heading: event.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              {!section.factIds.length && (
                <p className="muted">
                  Move a statement here to use this section. Empty sections are omitted when
                  confirming.
                </p>
              )}
              {section.factIds.map((factId) => {
                const fact = draft.facts.find((item) => item.id === factId)!;
                const number = ++ordinal,
                  block = document.draft?.blocks.find((item) => item.id === fact.sourceBlockId);
                return (
                  <article className="resume-fact-card" key={fact.id}>
                    <p className="mini-label">
                      Statement {number} ·{" "}
                      {block
                        ? block.source.page
                          ? `Extracted page ${block.source.page}`
                          : "Extracted text"
                        : "Owner-added statement"}
                    </p>
                    <label>
                      Statement text
                      <textarea
                        aria-label={`Statement ${number}`}
                        className="text-input resume-statement"
                        value={fact.text}
                        onChange={(event) => update(fact.id, { text: event.target.value })}
                      />
                    </label>
                    <p className="fine-print">{fact.text.length} / 4,000 characters</p>
                    {fact.text.length > 4000 && (
                      <div className="notice">
                        <p>
                          This statement is too long. Split it without dropping its text, or edit it
                          before confirming.
                        </p>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => split(fact)}
                        >
                          Split long statement
                        </button>
                      </div>
                    )}
                    <div className="resume-field-grid">
                      <label>
                        Statement type
                        <select
                          aria-label={`Statement type ${number}`}
                          className="text-input"
                          value={fact.kind}
                          onChange={(event) =>
                            update(fact.id, { kind: event.target.value as ResumeFact["kind"] })
                          }
                        >
                          {[
                            "experience",
                            "project",
                            "education",
                            "credential",
                            "skill-claim",
                            "contact",
                            "other",
                          ].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Completion state
                        <select
                          aria-label={`Completion state ${number}`}
                          className="text-input"
                          value={fact.state}
                          onChange={(event) =>
                            update(fact.id, { state: event.target.value as ResumeFact["state"] })
                          }
                        >
                          <option value="unspecified">Unspecified</option>
                          <option value="completed">Completed</option>
                          <option value="in-progress">In progress</option>
                          <option value="learning">Learning goal</option>
                        </select>
                      </label>
                      <label>
                        Section
                        <select
                          aria-label={`Section for statement ${number}`}
                          className="text-input"
                          value={section.id}
                          onChange={(event) => move(fact.id, event.target.value)}
                        >
                          {draft.sections.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.heading || "Untitled section"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Linked skills (up to 20)
                        <select
                          multiple
                          aria-label={`Linked skills ${number}`}
                          className="text-input resume-skill-select"
                          value={fact.skillIds}
                          onChange={(event) =>
                            update(fact.id, {
                              skillIds: Array.from(
                                event.target.selectedOptions,
                                (option) => option.value,
                              ),
                            })
                          }
                        >
                          {[
                            ...new Set([
                              ...(dictionary?.skills
                                .filter((skill) => skill.status === "active")
                                .map((skill) => skill.id) || []),
                              ...fact.skillIds,
                            ]),
                          ].map((id) => (
                            <option key={id} value={id}>
                              {labels.get(id) || id}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {block && (
                      <details>
                        <summary>Review the extracted source</summary>
                        <p className="resume-preserve-text">{block.text}</p>
                      </details>
                    )}
                    <button type="button" className="text-link" onClick={() => remove(fact.id)}>
                      Remove statement
                    </button>
                  </article>
                );
              })}
            </section>
          ))}
          <div className="resume-actions">
            <button
              type="button"
              className="button secondary"
              disabled={draft.facts.length >= resumeLimits.facts}
              onClick={add}
            >
              Add a statement
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={draft.sections.length >= resumeLimits.sections}
              onClick={() =>
                change({
                  ...draft,
                  sections: [
                    ...draft.sections,
                    { id: crypto.randomUUID(), heading: "New section", factIds: [] },
                  ],
                })
              }
            >
              Add a section
            </button>
          </div>
          <p className="fine-print">
            Removing a linked statement or changing it to a learning goal removes its profile claim
            and can invalidate reports based on it. Your confirmation creates a new version; it
            never edits an older one.
          </p>
          {!valid.success && (
            <p role="status">
              Review empty or oversized statements, section names and skill counts before
              confirming.
            </p>
          )}
          <button
            className="button primary"
            disabled={!valid.success || busy || saving || base !== document.revision}
          >
            {saving ? "Confirming facts…" : "Confirm facts and linked claims"}
          </button>
          {dirty && (
            <p className="fine-print">Unsaved edits stay in this tab until you confirm or leave.</p>
          )}
        </fieldset>
      </form>
    </section>
  );
}
