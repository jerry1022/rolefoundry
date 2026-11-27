"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import type { MatchingClient } from "@/modules/matching/ports";
import type {
  MatchConstraints,
  MatchHistory,
  MatchRun,
  RefreshMatchInput,
} from "@/modules/matching/model";
import type { CatalogClient } from "@/modules/jobs/ports";
import type { CatalogPage, PublishedJob } from "@/modules/jobs/model";
import type { ProfileClient } from "@/modules/profile/ports";
import type { CareerProfile } from "@/modules/profile/model";
import type { SkillClient } from "@/modules/skills/ports";
import { localizedSkillName } from "@/modules/skills/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
import { acceptMatchRead } from "@/modules/matching/report-state";
import { MatchingConditionsForm } from "./conditions-form";
import { MatchingResultCard } from "./result-card";
const statusLabels: Record<MatchRun["status"], string> = {
  queued: msg("queued"),
  running: msg("running"),
  succeeded: msg("succeeded"),
  failed: msg("failed"),
  invalidated: msg("invalidated"),
};
/** Why AI ordering could not be reserved; the rules-based report is created regardless. */
const semanticUnavailable: Record<string, string> = {
  RF_CONSENT_REQUIRED: msg(
    "AI-assisted ordering needs your semantic ranking permission in Account & privacy. This report uses rules only.",
  ),
  RF_QUOTA_EXCEEDED: msg("Your weekly AI allowance is used up. This report uses rules only."),
  default: msg("AI-assisted ordering is unavailable right now. This report uses rules only."),
};
/** Why a requested AI ordering was not applied to a finished report. */
const semanticFallback: Record<string, string> = {
  RF_SEMANTIC_NOT_NEEDED: msg(
    "AI ordering was not needed: the rules already ordered every role. Your allowance was returned.",
  ),
  RF_GATEWAY_DISABLED: msg(
    "AI ordering is not enabled on this deployment. Rules order shown; your allowance was returned.",
  ),
  RF_CONSENT_REQUIRED: msg("Permission was withdrawn before AI ordering ran. Rules order shown."),
  default: msg("AI ordering could not complete, so the rules order is shown."),
};

export function MatchingScreen({
  client,
  catalog,
  profile,
  skills,
}: {
  client: MatchingClient;
  catalog: CatalogClient;
  profile: ProfileClient;
  skills: SkillClient;
}) {
  const { t, locale } = useI18n();
  const [history, setHistory] = useState<MatchHistory | null>(null),
    [jobs, setJobs] = useState<CatalogPage | null>(null),
    [target, setTarget] = useState<PublishedJob | null>(null),
    [preferences, setPreferences] = useState<CareerProfile | null>(null),
    [active, setActive] = useState<MatchRun | null>(null),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [polling, setPolling] = useState(true),
    [semantic, setSemantic] = useState(false),
    [semanticNotice, setSemanticNotice] = useState("");
  const pending = useRef<{ payload: string; key: string } | null>(null);
  const selectionVersion = useRef(0),
    openVersion = useRef(0);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError ? error.message : t("Matching is temporarily unavailable."),
    );
    setLogin((current) => current || (error instanceof ApplicationError && error.status === 401));
  }
  function locateRun(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("run", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  async function open(id: string) {
    const version = ++openVersion.current;
    setError("");
    try {
      const next = await client.find(id);
      if (version !== openVersion.current) return;
      setActive((current) => acceptMatchRead(current, next));
      setPolling(true);
      locateRun(id);
    } catch (error) {
      if (version === openVersion.current) failed(error);
    }
  }
  useEffect(() => {
    let present = true;
    void Promise.all([client.list(), profile.read(), catalog.list({ q: "", limit: 20 })])
      .then(([history, preferences, jobs]) => {
        if (present) {
          setHistory(history);
          setPreferences(preferences);
          setJobs(jobs);
        }
      })
      .catch((error) => {
        if (present) failed(error);
      });
    const params = new URL(window.location.href).searchParams;
    const run = params.get("run"),
      job = params.get("job");
    if (run)
      void client
        .find(run)
        .then((value) => {
          if (present && openVersion.current === 0)
            setActive((current) => acceptMatchRead(current, value));
        })
        .catch((error) => {
          if (present) failed(error);
        });
    if (job)
      void catalog
        .find(job)
        .then((value) => {
          if (present && selectionVersion.current === 0) setTarget(value);
        })
        .catch((error) => {
          if (present) failed(error);
        });
    return () => {
      present = false;
    };
  }, [client, catalog, profile]);
  useEffect(() => {
    if (!active) return;
    let present = true;
    void skills
      .get(active.dictionaryVersion)
      .then((dictionary) => {
        if (present)
          setLabels(
            Object.fromEntries(
              dictionary.skills.map((skill) => [skill.id, localizedSkillName(skill, locale)]),
            ),
          );
      })
      .catch(() => {
        if (present) setLabels({});
      });
    return () => {
      present = false;
    };
  }, [active?.dictionaryVersion, skills, locale]);
  useEffect(() => {
    if (!active || !["queued", "running"].includes(active.status) || !polling) return;
    let present = true,
      count = 0,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.find(active.id);
        if (!present) return;
        setActive((current) =>
          current?.id === next.id ? acceptMatchRead(current, next) : current,
        );
        count++;
        if (["queued", "running"].includes(next.status) && count < 60)
          timer = setTimeout(() => void poll(), 1000);
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
  useEffect(() => {
    if (!active) return;
    const id = active.id;
    const refresh = () =>
      void client
        .find(id)
        .then((next) =>
          setActive((current) => (current?.id === id ? acceptMatchRead(current, next) : current)),
        )
        .catch(failed);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active?.id, client]);
  useEffect(() => {
    if (active)
      setHistory((current) =>
        current
          ? {
              ...current,
              data: current.data.map((item) =>
                item.id === active.id ? { ...item, status: active.status } : item,
              ),
            }
          : current,
      );
  }, [active?.id, active?.status]);
  async function refresh(constraints: MatchConstraints) {
    setBusy(true);
    setError("");
    setSemanticNotice("");
    const input: RefreshMatchInput = {
      jobId: target?.id || null,
      constraints,
      ...(semantic ? { semantic: true } : {}),
    };
    const payload = JSON.stringify(input);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await client.refresh(input, pending.current.key);
      locateRun(result.runId);
      pending.current = null;
      if (result.semantic?.state === "unavailable")
        setSemanticNotice(
          semanticUnavailable[result.semantic.code ?? ""] ?? semanticUnavailable.default,
        );
      await open(result.runId);
      setHistory(await client.list());
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t("REQUIREMENTS · EVIDENCE · NEXT ACTIONS")}
        title={t("Find opportunities with a clear reason.")}
        description={t(
          "Compare published requirements with your own evidence. Unknown conditions stay unknown; coverage never means hiring probability.",
        )}
      />
      {error && (
        <div role="alert" className="notice">
          <p>{t(error)}</p>
          {login ? (
            <Link className="button secondary" href="/account/">
              {t("Sign in to use private matching")}
            </Link>
          ) : (
            <button className="button secondary" onClick={() => window.location.reload()}>
              {t("Reload matching workspace")}
            </button>
          )}
        </div>
      )}
      {!login && preferences && history && jobs && (
        <>
          <section className="panel">
            <h2>{t("Choose a direction or one target role")}</h2>
            <p className="muted">
              {t("Direction-wide reports use {track}.", { track: t(preferences.track) })}{" "}
              <Link href="/skills/">{t("Change my direction")}</Link>.
            </p>
            <label>
              {t("Target role")}
              <select
                className="text-input"
                aria-label={t("Matching target role")}
                disabled={busy}
                value={target?.id || ""}
                onChange={(event) => {
                  const id = event.target.value;
                  const version = ++selectionVersion.current;
                  setError("");
                  if (!id) {
                    setTarget(null);
                    return;
                  }
                  setBusy(true);
                  void catalog
                    .find(id)
                    .then((job) => {
                      if (version === selectionVersion.current) setTarget(job);
                    })
                    .catch(failed)
                    .finally(() => {
                      if (version === selectionVersion.current) setBusy(false);
                    });
                }}
              >
                <option value="">{t("All published roles in my direction")}</option>
                {target && !jobs.data.some((job) => job.id === target.id) && (
                  <option value={target.id}>
                    {target.title} · {target.company}
                  </option>
                )}
                {jobs.data.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.company}
                  </option>
                ))}
              </select>
            </label>
            {jobs.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void catalog
                    .list({ ...jobs.appliedFilters, q: "", limit: 20, cursor: jobs.nextCursor! })
                    .then((next) => setJobs({ ...next, data: [...jobs.data, ...next.data] }))
                    .catch(failed)
                    .finally(() => setBusy(false));
                }}
              >
                {t("Load more target roles")}
              </button>
            )}
          </section>
          <label className="matching-ai-option">
            <input
              type="checkbox"
              checked={semantic}
              disabled={busy}
              onChange={(event) => setSemantic(event.target.checked)}
            />
            <span>
              <strong>{t("Use AI-assisted ordering for equal results")}</strong>
              <small>
                {t(
                  "Needs your semantic ranking permission and uses one weekly allowance. It only orders roles the rules rate equally; strengths, gaps and conditions stay rule-based.",
                )}
              </small>
            </span>
          </label>
          {semanticNotice && (
            <p className="notice warning" role="status">
              {t(semanticNotice)}
            </p>
          )}
          <MatchingConditionsForm
            key={target?.versionId || "direction"}
            target={target}
            workplaces={preferences.workplaces}
            busy={busy}
            aiOrdering={semantic}
            onSubmit={(constraints) => void refresh(constraints)}
          />
        </>
      )}
      {active && (
        <section className="section-block">
          <div className="matching-report-heading">
            <h2>
              {active.status === "invalidated"
                ? t("Report content removed")
                : active.status === "failed"
                  ? t("Matching could not finish")
                  : ["queued", "running"].includes(active.status)
                    ? t("Matching is queued or running")
                    : t("Your matching report")}
            </h2>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void open(active.id)}
            >
              {t("Check report status")}
            </button>
          </div>
          {active.ranking && active.ranking.state !== "not-requested" && (
            <p className="muted matching-ranking" role="status">
              {active.ranking.state === "applied"
                ? t("Equal rule results were ordered with AI assistance (semantic-rank-v1).")
                : t(semanticFallback[active.ranking.code ?? ""] ?? semanticFallback.default)}
            </p>
          )}
          {active.stale && active.status !== "invalidated" && (
            <p className="notice" role="status">
              {t(
                "This report is historical because its inputs changed. Create a fresh report before using it to prioritize current opportunities.",
              )}
            </p>
          )}
          {active.status === "invalidated" && (
            <p className="notice">
              {t(
                "An input evidence record was deleted. Its copied report content has been removed. Create a fresh report with current evidence.",
              )}
            </p>
          )}
          {active.status === "failed" && (
            <p className="notice">
              {t(
                "No partial report is published. Create a fresh report using current inputs; your previous report history stays separate.",
              )}
            </p>
          )}
          {["queued", "running"].includes(active.status) && (
            <p className="muted">
              {t(
                "Your inputs are saved. You can leave and return while the independent worker computes the report.",
              )}
            </p>
          )}
          {active.status === "succeeded" && (
            <>
              <p className="muted">
                {t(
                  "{count} source roles · Rule-based analysis · {date}. Conditions and evidence describe the saved inputs for this report.",
                  { count: active.candidateCount, date: active.createdAt.slice(0, 10) },
                )}
              </p>
              <p className="muted">
                {t("Saved relevant experience: {value}.", {
                  value:
                    active.constraints?.experienceYears === null || active.constraints === null
                      ? t("Not supplied")
                      : t("{years} years (self-reported)", {
                          years: active.constraints.experienceYears,
                        }),
                })}
              </p>
              {!active.data.length && (
                <p className="panel">
                  {t(
                    "No published roles matched the selected direction. Try a specific target or review the catalog later.",
                  )}
                </p>
              )}
              <div className="matching-results">
                {active.data.map((result) => (
                  <MatchingResultCard
                    key={result.jobId}
                    result={result}
                    historical={active.stale}
                    labels={labels}
                  />
                ))}
              </div>
              {active.nextCursor && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void client
                      .find(active.id, active.nextCursor!)
                      .then((next) =>
                        setActive((current) =>
                          current?.id === next.id ? acceptMatchRead(current, next, true) : current,
                        ),
                      )
                      .catch(failed)
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("Load more matching results")}
                </button>
              )}
            </>
          )}
        </section>
      )}
      {history && (
        <section className="section-block">
          <h2>{t("Your report history")}</h2>
          {!history.data.length && <p className="muted">{t("No private matching reports yet.")}</p>}
          <div className="assessment-history">
            {history.data.map((run) => (
              <article className="panel" key={run.id}>
                <h3>{run.targetJobId ? t("Target role report") : t("Direction report")}</h3>
                <p>
                  {t(statusLabels[run.status])} · {run.createdAt.slice(0, 10)}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void open(run.id)}
                >
                  {t("Open matching report")}
                </button>
              </article>
            ))}
          </div>
          {history.nextCursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void client
                  .list(history.nextCursor!)
                  .then((next) => setHistory({ ...next, data: [...history.data, ...next.data] }))
                  .catch(failed)
                  .finally(() => setBusy(false));
              }}
            >
              {t("Load more report history")}
            </button>
          )}
        </section>
      )}
    </>
  );
}
