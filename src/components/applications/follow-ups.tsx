"use client";
import { useEffect, useState } from "react";
import type { Application, FollowUpInput, FollowUpEdit } from "@/modules/applications/model";
import { localDateInput, localInputToUtc } from "@/modules/applications/record-state";
type FollowUp = Application["followUps"][number];
type Props = {
  record: Application;
  busy: boolean;
  onAdd: (input: FollowUpInput) => Promise<boolean>;
  onEdit: (id: string, input: FollowUpEdit) => Promise<boolean>;
  onRemove: (id: string, revision: number) => Promise<boolean>;
};
function TaskForm({
  revision,
  item,
  busy,
  onSave,
  onCancel,
}: {
  revision: number;
  item?: FollowUp;
  busy: boolean;
  onSave: (input: FollowUpEdit) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? ""),
    [due, setDue] = useState(item ? localDateInput(item.dueAt) : ""),
    [completed, setCompleted] = useState(item?.completed ?? false),
    [baseline, setBaseline] = useState(revision),
    [invalid, setInvalid] = useState("");
  const pristine = !item && !title && !due;
  useEffect(() => {
    if (pristine) setBaseline(revision);
  }, [revision, pristine]);
  const stale = baseline !== revision;
  return (
    <form
      className="application-follow-up-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const dueAt = localInputToUtc(due);
        if (!dueAt) {
          setInvalid("Choose an existing date and time in your device timezone.");
          return;
        }
        if (await onSave({ expectedRevision: baseline, title, dueAt, completed })) {
          setTitle("");
          setDue("");
          setInvalid("");
        }
      }}
    >
      {stale && (
        <div className="notice" role="status">
          The record changed. Review the current tasks before saving this draft.{" "}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setBaseline(revision)}
          >
            Use latest revision for this draft
          </button>
        </div>
      )}
      {invalid && <p role="alert">{invalid}</p>}
      <fieldset disabled={busy || stale}>
        <label>
          Next step
          <input
            aria-label={item ? "Edit next step" : "Next step"}
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Due date and time
          <input
            type="datetime-local"
            aria-label={item ? "Edit due date and time" : "Due date and time"}
            required
            min="2000-01-01T00:00"
            max="2100-12-31T23:59"
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </label>
        {item && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={completed}
              onChange={(event) => setCompleted(event.target.checked)}
            />
            Completed
          </label>
        )}
        <button className="button secondary">{item ? "Save follow-up" : "Add follow-up"}</button>
        {onCancel && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel follow-up edit
          </button>
        )}
      </fieldset>
    </form>
  );
}
export function FollowUps({ record, busy, onAdd, onEdit, onRemove }: Props) {
  const [editing, setEditing] = useState<string | null>(null),
    [removing, setRemoving] = useState<string | null>(null);
  return (
    <section className="panel" aria-label="Follow-up tasks">
      <h3>Next actions</h3>
      <p className="muted">
        Dates use your device timezone and are stored in UTC. These are private reminders on this
        page; no email or calendar messages are sent.
      </p>
      {!record.followUps.length && <p>No next action recorded.</p>}
      <ul className="application-follow-ups">
        {record.followUps.map((item) => (
          <li key={item.id}>
            {editing === item.id ? (
              <TaskForm
                revision={record.revision}
                item={item}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={async (input) => {
                  const ok = await onEdit(item.id, input);
                  if (ok) setEditing(null);
                  return ok;
                }}
              />
            ) : (
              <>
                <strong>{item.title}</strong>
                <p>
                  <time dateTime={item.dueAt}>{new Date(item.dueAt).toLocaleString()}</time> ·{" "}
                  {item.completed ? "Completed" : "Open"}
                  {!item.completed && Date.parse(item.dueAt) < Date.now() ? " · Overdue" : ""}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditing(item.id)}
                >
                  Edit follow-up
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setRemoving(item.id)}
                >
                  Remove follow-up
                </button>
                {removing === item.id && (
                  <div role="group" aria-label="Confirm follow-up removal">
                    <p>Remove this follow-up?</p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (await onRemove(item.id, record.revision)) setRemoving(null);
                      }}
                    >
                      Confirm follow-up removal
                    </button>
                    <button className="button secondary" onClick={() => setRemoving(null)}>
                      Keep follow-up
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {record.followUps.length < 50 && (
        <TaskForm
          revision={record.revision}
          busy={busy}
          onSave={(input) =>
            onAdd({
              expectedRevision: input.expectedRevision,
              title: input.title,
              dueAt: input.dueAt,
            })
          }
        />
      )}
    </section>
  );
}
