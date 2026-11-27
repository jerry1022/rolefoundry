"use client";
import type { ResumeHistory } from "@/modules/resume/model";
export function ResumeHistoryList({
  history,
  busy,
  onOpen,
  onMore,
}: {
  history: ResumeHistory;
  busy: boolean;
  onOpen: (id: string) => void;
  onMore: () => void;
}) {
  return (
    <section className="section-block">
      <h2>Your private sources</h2>
      {!history.data.length && <p className="muted">No saved resume sources yet.</p>}
      <div className="assessment-history">
        {history.data.map((item) => (
          <article className="panel" key={item.id}>
            <h3 className="resume-file-title">{item.filename}</h3>
            <p>
              {item.status} · {item.createdAt.slice(0, 10)}
            </p>
            <button className="button secondary" disabled={busy} onClick={() => onOpen(item.id)}>
              Open private source
            </button>
          </article>
        ))}
      </div>
      {history.nextCursor && (
        <button className="button secondary" disabled={busy} onClick={onMore}>
          Load more private sources
        </button>
      )}
    </section>
  );
}
