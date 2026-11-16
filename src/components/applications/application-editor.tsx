"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { applicationStages } from "@/modules/applications/model";
import type { Application, EditInput, ResumeChoicePage } from "@/modules/applications/model";
type Props = {
  record: Application;
  choices: ResumeChoicePage;
  busy: boolean;
  onMoreResumes: () => void;
  onSave: (input: EditInput) => Promise<boolean>;
};
export function ApplicationEditor({ record, choices, busy, onMoreResumes, onSave }: Props) {
  const initial = () => ({
    expectedRevision: record.revision,
    stage: record.stage,
    note: record.note,
    resumeVersionId: record.resume?.id ?? null,
    confirmationReference: record.confirmationReference,
  });
  const [draft, setDraft] = useState<EditInput>(initial),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(initial());
  }, [record.revision, dirty]); // A dirty draft keeps its original optimistic baseline.
  const stale = draft.expectedRevision !== record.revision;
  const reset = () => {
    setDraft(initial());
    setDirty(false);
  };
  function change(value: Partial<EditInput>) {
    setDirty(true);
    setDraft((current) => ({ ...current, ...value }));
  }
  const options = [...choices.data];
  if (record.resume && !options.some((item) => item.id === record.resume!.id))
    options.unshift(record.resume);
  return (
    <section className="panel application-editor" aria-label="Edit tracked role">
      <h3>Record your progress</h3>
      <p className="muted">
        Stages are your own report. Saving here sends no application or message. No response does
        not mean rejection.
      </p>
      {stale && (
        <div className="notice" role="status">
          This record changed. Your unsaved draft is retained.{" "}
          <button type="button" className="button secondary" disabled={busy} onClick={reset}>
            Load latest saved fields
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                expectedRevision: record.revision,
                resumeVersionId: record.resume?.id ?? null,
              }))
            }
          >
            Keep draft for review on latest revision
          </button>
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onSave(draft)) setDirty(false);
        }}
      >
        <fieldset disabled={busy || stale}>
          <label>
            Stage
            <select
              aria-label="Application stage"
              value={draft.stage}
              onChange={(event) => change({ stage: event.target.value as EditInput["stage"] })}
            >
              {applicationStages
                .filter((stage) => record.stage !== "Closed" || stage === "Closed")
                .map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
            </select>
          </label>
          <label>
            Private note
            <textarea
              aria-label="Application note"
              rows={5}
              maxLength={4000}
              value={draft.note}
              onChange={(event) => change({ note: event.target.value })}
            />
          </label>
          <label>
            Submission reference (optional)
            <input
              aria-label="Submission reference"
              maxLength={300}
              value={draft.confirmationReference ?? ""}
              onChange={(event) => change({ confirmationReference: event.target.value || null })}
            />
          </label>
          <p className="muted">
            This is a private reference you supply; it is not independent confirmation.
          </p>
          <label>
            Confirmed resume version
            <select
              aria-label="Confirmed resume version"
              value={draft.resumeVersionId ?? ""}
              onChange={(event) => change({ resumeVersionId: event.target.value || null })}
            >
              <option value="">No version selected</option>
              {options.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.filename} · version {item.version}
                </option>
              ))}
            </select>
          </label>
          {choices.nextCursor && (
            <button type="button" className="button secondary" onClick={onMoreResumes}>
              Show more resume versions
            </button>
          )}
          <button className="button primary" disabled={!dirty}>
            Save application record
          </button>
        </fieldset>
      </form>
      {record.resume && (
        <Link className="text-link" href={`/resume/?version=${record.resume.id}`}>
          View selected fixed resume version ↗
        </Link>
      )}
      <p className="muted">
        Deleting that source removes this link. Tracking keeps no copy of its statements.
      </p>
    </section>
  );
}
