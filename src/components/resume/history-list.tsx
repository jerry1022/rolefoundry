"use client";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  return (
    <section className="section-block">
      <h2>{t("Your private sources")}</h2>
      {!history.data.length && <p className="muted">{t("No saved resume sources yet.")}</p>}
      <div className="assessment-history">
        {history.data.map((item) => (
          <article className="panel" key={item.id}>
            <h3 className="resume-file-title">{item.filename}</h3>
            <p>
              {item.status} · {item.createdAt.slice(0, 10)}
            </p>
            <button className="button secondary" disabled={busy} onClick={() => onOpen(item.id)}>
              {t("Open private source")}
            </button>
          </article>
        ))}
      </div>
      {history.nextCursor && (
        <button className="button secondary" disabled={busy} onClick={onMore}>
          {t("Load more private sources")}
        </button>
      )}
    </section>
  );
}
