"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { tracks, type Track } from "@/modules/skills/catalog";
import type { AssessmentClient, AssessmentAdminClient } from "@/modules/assessment/ports";
import type { SkillClient } from "@/modules/skills/ports";
import type { AssessmentAttempt, attemptPageSchema } from "@/modules/assessment/model";
import type { z } from "zod";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
import { AttemptForm } from "./attempt-form";
import { AttemptResult } from "./attempt-result";
import { AssessmentBank } from "./bank-editor";
const statusLabels: Record<AssessmentAttempt["status"], string> = {
  draft: msg("draft"),
  submitted: msg("submitted"),
  completed: msg("completed"),
  failed: msg("failed"),
};
export function AssessmentScreen({
  client,
  adminClient,
  skills,
  isAdmin,
}: {
  client: AssessmentClient;
  adminClient: AssessmentAdminClient;
  skills: SkillClient;
  isAdmin: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [openVersion, setOpenVersion] = useState(0);
  const [list, setList] = useState<z.infer<typeof attemptPageSchema> | null>(null),
    [active, setActive] = useState<AssessmentAttempt | null>(null),
    [track, setTrack] = useState<Track>(tracks[0]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState(false),
    [admin, setAdmin] = useState(false),
    [polling, setPolling] = useState(true);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : t("The assessment service is unavailable."),
    );
    setLogin(error instanceof ApplicationError && error.status === 401);
  }
  function changed(attempt: AssessmentAttempt) {
    setActive((current) => (current?.id === attempt.id ? attempt : current));
    setList((current) =>
      current
        ? {
            ...current,
            data: current.data.map((item) => (item.id === attempt.id ? attempt : item)),
          }
        : current,
    );
  }
  async function open(id: string) {
    setError("");
    try {
      const attempt = await client.find(id);
      setActive(attempt);
      setOpenVersion((value) => value + 1);
      setPolling(true);
      window.history.replaceState(
        null,
        "",
        `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/assessments/?attempt=${id}`,
      );
    } catch (error) {
      failed(error);
    }
  }
  useEffect(() => {
    let present = true;
    void client
      .list()
      .then((value) => {
        if (present) setList(value);
      })
      .catch((error) => {
        if (present) failed(error);
      });
    const id = new URL(window.location.href).searchParams.get("attempt");
    if (id)
      void client
        .find(id)
        .then((value) => {
          if (present) setActive(value);
        })
        .catch((error) => {
          if (present) failed(error);
        });
    void isAdmin()
      .then((value) => {
        if (present) setAdmin(value);
      })
      .catch(() => {});
    return () => {
      present = false;
    };
  }, [client, isAdmin]);
  useEffect(() => {
    if (active?.status !== "submitted" || !polling) return;
    let present = true;
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.find(active.id);
        if (!present) return;
        changed(next);
        count++;
        if (next.status === "submitted" && count < 60) timer = setTimeout(() => void poll(), 1000);
        else setPolling(false);
      } catch (error) {
        if (present) {
          failed(error);
          setPolling(false);
        }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      present = false;
      clearTimeout(timer);
    };
  }, [active?.id, active?.status, polling, client]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const attempt = await client.start(track);
      setActive(attempt);
      setList(await client.list());
      window.history.replaceState(
        null,
        "",
        `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/assessments/?attempt=${attempt.id}`,
      );
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t("PRIVATE ATTEMPTS · TRACEABLE FEEDBACK")}
        title={t("Find a useful starting point.")}
        description={t(
          "Try three reviewed scenarios for your direction. Fixed-answer scoring stays in this system and uses no external AI provider.",
        )}
      />
      {error && (
        <div className="notice" role="alert">
          <p>{t(error)}</p>
          {login ? (
            <Link className="button secondary" href="/account/">
              {t("Sign in to start an assessment")}
            </Link>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                void client.list().then(setList).catch(failed);
              }}
            >
              {t("Reload assessment history")}
            </button>
          )}
        </div>
      )}
      {!login && list && (
        <>
          <section className="panel">
            <h2>{t("Choose your direction")}</h2>
            <label>
              {t("Assessment track")}
              <select
                aria-label={t("Assessment track")}
                className="text-input"
                value={track}
                onChange={(event) => setTrack(event.target.value as Track)}
              >
                {tracks.map((track) => (
                  <option key={track} value={track}>
                    {t(track)}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={busy} onClick={() => void start()}>
              {t("Start a private assessment")}
            </button>
            <p className="muted">
              {t(
                "A new attempt keeps earlier results. Fixed-choice grading does not send answers to a model or consume AI analysis allowance.",
              )}
            </p>
          </section>
          {active?.status === "draft" && (
            <AttemptForm
              key={`${active.id}-${openVersion}-draft`}
              initial={active}
              client={client}
              onChanged={changed}
              onReload={() => open(active.id)}
            />
          )}
          {active?.status === "submitted" && (
            <section className="panel section-block">
              <h2>{t("Scoring is queued")}</h2>
              <p>
                {t(
                  "Your answers are sealed and saved. You can leave and return while scoring completes.",
                )}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  void open(active.id);
                  setPolling(true);
                }}
              >
                {t("Check scoring status")}
              </button>
            </section>
          )}
          {active?.status === "failed" && (
            <section className="panel section-block">
              <h2>{t("Scoring could not finish")}</h2>
              <p>
                {t(
                  "Your submitted answers are retained. A retry uses these sealed answers; invalid or stale inputs require a new attempt.",
                )}
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void client
                    .retry(active.id, active.taskId!, crypto.randomUUID())
                    .then(() => open(active.id))
                    .catch(failed)
                    .finally(() => setBusy(false));
                }}
              >
                {t("Retry scoring with saved answers")}
              </button>
            </section>
          )}
          {active?.status === "completed" && <AttemptResult attempt={active} />}
          <section className="section-block">
            <h2>{t("Your assessment history")}</h2>
            {!list.data.length && <p className="muted">{t("No private attempts yet.")}</p>}
            <div className="assessment-history">
              {list.data.map((attempt) => (
                <article className="panel" key={attempt.id}>
                  <h3>{t(attempt.track)}</h3>
                  <p>
                    {t(statusLabels[attempt.status])} · {attempt.createdAt.slice(0, 10)}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void open(attempt.id)}
                  >
                    {t("Open assessment")}
                  </button>
                </article>
              ))}
            </div>
            {list.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void client
                    .list(list.nextCursor!)
                    .then((next) => setList({ ...next, data: [...list.data, ...next.data] }))
                    .catch(failed)
                    .finally(() => setBusy(false));
                }}
              >
                {t("Load more assessments")}
              </button>
            )}
          </section>
        </>
      )}
      {admin && <AssessmentBank client={adminClient} skills={skills} />}
    </>
  );
}
