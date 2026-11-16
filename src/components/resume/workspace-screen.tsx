"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ResumeClient } from "@/modules/resume/ports";
import type {
  ResumeDocument,
  ResumeProposal,
  ResumeVersion,
  ConfirmedResume,
  resumeListSchema,
} from "@/modules/resume/model";
import type { CatalogClient } from "@/modules/jobs/ports";
import type { CatalogPage, PublishedJob } from "@/modules/jobs/model";
import type { SkillClient } from "@/modules/skills/ports";
import type { SkillDictionary } from "@/modules/skills/model";
import type { z } from "zod";
import { ApplicationError } from "@/modules/platform/errors";
import { acceptResumeRead } from "@/modules/resume/document-state";
import { PageHeading } from "../ui/page-heading";
import { ResumeHistoryList } from "./history-list";
import { ResumeSourceForm } from "./source-form";
import { ResumeFactEditor } from "./fact-editor";
import { ResumeProposalView } from "./proposal-view";
import { ResumeVersionView } from "./version-view";
const processingMessages: Record<string, string> = {
  "empty-text": "No extractable text was found. Scanned documents can use the paste-text option.",
  "password-protected": "Use an unencrypted text PDF, or paste the statements you want to review.",
  "invalid-file":
    "This file could not be parsed safely. Its original is retained; try a text PDF/DOCX or paste text.",
  "unsupported-file":
    "This document contains unsupported content. Use a plain text PDF/DOCX or the paste option.",
  "too-large": "The file or extracted content exceeds the processing limits. Try a smaller source.",
  "unsupported-glyph":
    "The PDF font cannot represent a character in this version. Review the text before creating another export.",
  "parse-timeout": "Document processing exceeded its time limit. The original source is unchanged.",
  "process-failed": "The document processor was unavailable. The original source is unchanged.",
  "invalid-output": "The result did not pass validation. No partial result was published.",
};
export function ResumeWorkspaceScreen({
  client,
  catalog,
  skills,
  catalogEnabled,
}: {
  client: ResumeClient;
  catalog: CatalogClient;
  skills: SkillClient;
  catalogEnabled: boolean;
}) {
  const [history, setHistory] = useState<z.infer<typeof resumeListSchema> | null>(null),
    [active, setActive] = useState<ResumeDocument | null>(null),
    [version, setVersion] = useState<ResumeVersion | null>(null),
    [proposal, setProposal] = useState<ResumeProposal | null>(null);
  const [dictionary, setDictionary] = useState<SkillDictionary | null>(null),
    [versionDictionary, setVersionDictionary] = useState<SkillDictionary | null>(null),
    [jobs, setJobs] = useState<CatalogPage | null>(null),
    [target, setTarget] = useState<PublishedJob | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [polling, setPolling] = useState(true),
    [confirmDelete, setConfirmDelete] = useState(false);
  const epoch = useRef(0),
    targetEpoch = useRef(0),
    deleted = useRef(new Set<string>()),
    pending = useRef<{ payload: string; key: string } | null>(null);
  function fail(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : "The private resume workspace is temporarily unavailable.",
    );
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
      setLogin(true);
      setActive(null);
      setVersion(null);
      setProposal(null);
      setHistory(null);
      epoch.current++;
    }
  }
  function accept(next: ResumeDocument) {
    if (deleted.current.has(next.id)) return;
    setActive((current) => acceptResumeRead(current, next));
  }
  function locate(documentId?: string, versionId?: string) {
    const url = new URL(window.location.href);
    for (const key of ["document", "version"]) url.searchParams.delete(key);
    if (documentId) url.searchParams.set("document", documentId);
    if (versionId) url.searchParams.set("version", versionId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  function forget(id: string) {
    deleted.current.add(id);
    setActive((current) => (current?.id === id ? null : current));
    setVersion((current) => (current?.documentId === id ? null : current));
    setProposal((current) => (current?.documentId === id ? null : current));
    setHistory((current) =>
      current ? { ...current, data: current.data.filter((item) => item.id !== id) } : current,
    );
  }
  async function reloadHistory() {
    const result = await client.list();
    setHistory({ ...result, data: result.data.filter((item) => !deleted.current.has(item.id)) });
    setLogin(false);
  }
  async function open(id: string) {
    const operation = ++epoch.current;
    setError("");
    setNotice("");
    setConfirmDelete(false);
    try {
      const next = await client.find(id);
      if (operation !== epoch.current || deleted.current.has(id)) return;
      setVersion(null);
      setProposal(null);
      accept(next);
      setPolling(true);
      locate(id);
    } catch (error) {
      if (operation === epoch.current) {
        if (error instanceof ApplicationError && error.status === 404) forget(id);
        fail(error);
      }
      throw error;
    }
  }
  async function openVersion(id: string) {
    const operation = ++epoch.current;
    setError("");
    try {
      const saved = await client.version(id),
        document = await client.find(saved.documentId);
      if (operation !== epoch.current || deleted.current.has(document.id)) return;
      accept(document);
      setVersion(saved);
      setProposal(null);
      setConfirmDelete(false);
      locate(document.id, saved.id);
    } catch (error) {
      if (operation === epoch.current) fail(error);
    }
  }
  async function refresh(id: string) {
    try {
      const next = await client.find(id);
      if (!deleted.current.has(id))
        setActive((current) => (current?.id === id ? acceptResumeRead(current, next) : current));
    } catch (error) {
      if (error instanceof ApplicationError && error.status === 404) forget(id);
      fail(error);
    }
  }
  function key(payload: unknown) {
    const text = JSON.stringify(payload);
    if (pending.current?.payload !== text)
      pending.current = { payload: text, key: crypto.randomUUID() };
    return pending.current.key;
  }
  useEffect(() => {
    let present = true;
    void client
      .list()
      .then((result) => {
        if (present) setHistory(result);
      })
      .catch((error) => {
        if (present) fail(error);
      });
    if (catalogEnabled) {
      void catalog
        .list({ q: "", limit: 20 })
        .then((result) => {
          if (present) setJobs(result);
        })
        .catch((error) => {
          if (present) fail(error);
        });
      void skills
        .get()
        .then((result) => {
          if (present) setDictionary(result);
        })
        .catch(() => {});
    }
    const params = new URL(window.location.href).searchParams,
      versionId = params.get("version"),
      documentId = params.get("document"),
      jobId = params.get("job");
    if (versionId) void openVersion(versionId);
    else if (documentId) void open(documentId).catch(() => {});
    if (jobId && catalogEnabled)
      void catalog
        .find(jobId)
        .then((result) => {
          if (present && targetEpoch.current === 0) setTarget(result);
        })
        .catch((error) => {
          if (present) fail(error);
        });
    return () => {
      present = false;
      epoch.current++;
    };
  }, [client, catalog, skills, catalogEnabled]);
  const working =
    !!active &&
    (["queued", "running"].includes(active.status) ||
      active.proposals.some((item) => ["queued", "running"].includes(item.status)) ||
      active.exports.some((item) => ["queued", "running"].includes(item.status)));
  useEffect(() => {
    if (!active || !working || !polling) return;
    const id = active.id;
    let present = true,
      count = 0,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.find(id);
        if (!present) return;
        setActive((current) => (current?.id === id ? acceptResumeRead(current, next) : current));
        count++;
        if (count < 60) timer = setTimeout(() => void poll(), 1000);
        else setPolling(false);
      } catch (error) {
        if (present) {
          if (error instanceof ApplicationError && error.status === 404) forget(id);
          fail(error);
          setPolling(false);
        }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      present = false;
      clearTimeout(timer);
    };
  }, [active?.id, working, polling, client]);
  useEffect(() => {
    const focus = () => {
      void reloadHistory().catch(fail);
      if (active) void refresh(active.id);
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [active?.id, client]);
  useEffect(() => {
    if (!proposal || !active) return;
    const summary = active.proposals.find((item) => item.id === proposal.id);
    if (!summary || (summary.status === proposal.status && summary.stale === proposal.stale))
      return;
    let present = true;
    void client
      .proposal(proposal.id)
      .then((result) => {
        if (present) setProposal(result);
      })
      .catch((error) => {
        if (present) fail(error);
      });
    return () => {
      present = false;
    };
  }, [active?.proposals, proposal?.id, proposal?.status, proposal?.stale, client]);
  useEffect(() => {
    setVersionDictionary(null);
    if (!version?.dictionaryVersion) return;
    let present = true;
    void skills
      .get(version.dictionaryVersion)
      .then((result) => {
        if (present) setVersionDictionary(result);
      })
      .catch(() => {});
    return () => {
      present = false;
    };
  }, [version?.id, skills]);
  async function confirm(content: ConfirmedResume, revision: number) {
    if (!active) throw Error("No source selected.");
    setBusy(true);
    setError("");
    try {
      const next = await client.confirm(active.id, revision, content);
      accept(next);
      await reloadHistory();
      return next;
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  async function retryParse() {
    if (!active?.taskId) return;
    setBusy(true);
    setError("");
    try {
      await client.retryParse(
        active.id,
        active.taskId,
        key({ documentId: active.id, previousTaskId: active.taskId, operation: "parse-retry" }),
      );
      pending.current = null;
      accept(await client.find(active.id));
      setPolling(true);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function startProposal() {
    if (!active?.currentVersion || !target) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
          documentId: active.id,
          versionId: active.currentVersion.id,
          jobId: target.id,
          revision: active.revision,
        },
        result = await client.revise(
          active.id,
          active.currentVersion.id,
          target.id,
          active.revision,
          key(payload),
        );
      pending.current = null;
      setProposal(await client.proposal(result.id));
      accept(await client.find(active.id));
      setPolling(true);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function acceptProposal(ids: string[]) {
    if (!active || !proposal) return;
    setBusy(true);
    setError("");
    try {
      const next = await client.accept(proposal.id, active.revision, ids);
      accept(next);
      setProposal(await client.proposal(proposal.id));
      await reloadHistory();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function exportVersion(versionId: string) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await client.export(
        active.id,
        versionId,
        key({ documentId: active.id, versionId, operation: "export" }),
      );
      pending.current = null;
      accept(await client.find(active.id));
      setPolling(true);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await client.download(id),
        url = URL.createObjectURL(
          new Blob([new Uint8Array(result.bytes).buffer], { type: "application/pdf" }),
        ),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.remove(active.id, active.revision);
      forget(active.id);
      epoch.current++;
      locate();
      setConfirmDelete(false);
      setNotice(
        result.cleanupPending
          ? "Resume access and derived claims were removed. Private file cleanup is continuing in the background."
          : "Resume and derived claims were removed.",
      );
      await reloadHistory();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PRIVATE SOURCES · CONFIRMED FACTS"
        title="Express your experience with facts you can stand behind."
        description="Review extracted statements, save confirmed versions and choose how they fit a target role. Proposals preserve your facts; exports refer to a fixed version."
      />
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          {login ? (
            <Link className="button secondary" href="/account/">
              Sign in to your private workspace
            </Link>
          ) : (
            <button
              className="button secondary"
              onClick={() => {
                setError("");
                void reloadHistory().catch(fail);
                if (active) void refresh(active.id);
              }}
            >
              Reload private resume data
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!history && !login && !error && <p role="status">Loading private resume history…</p>}
      {history && !login && (
        <>
          <ResumeSourceForm
            client={client}
            busy={busy}
            onBegin={() => {
              setBusy(true);
              setError("");
            }}
            onSaved={async (id) => {
              await open(id);
              await reloadHistory();
            }}
            onFailure={fail}
            onFinish={() => setBusy(false)}
          />
        </>
      )}
      {active && !login && (
        <>
          <section className="panel section-block">
            <h2 className="resume-file-title">{active.filename}</h2>
            <p className="muted">
              {active.status} · {active.confirmedClaimCount} linked, unreviewed resume claims
            </p>
            {active.status === "failed" && active.taskErrorCode === "RF_RETRY_EXHAUSTED" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void retryParse()}
              >
                Retry parsing this source
              </button>
            )}
            {active.processingError && (
              <p className="notice" role="status">
                {processingMessages[active.processingError]}
              </p>
            )}
            {["awaiting-upload", "uploading"].includes(active.status) && (
              <p>
                The source upload is not complete. Choose a new source above or remove this
                unfinished draft.
              </p>
            )}
            <div className="resume-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setPolling(true);
                  void refresh(active.id);
                }}
              >
                Check resume status
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={() => setConfirmDelete((value) => !value)}
              >
                Delete this private resume
              </button>
            </div>
            {working && !polling && (
              <p className="muted">
                Automatic status checks paused. You can check again while the worker continues.
              </p>
            )}
            {confirmDelete && (
              <div className="notice">
                <p>
                  Delete this source, its confirmed versions, proposals, exports and linked resume
                  claims? Reports based on those claims will be invalidated.
                </p>
                <button className="button primary" disabled={busy} onClick={() => void remove()}>
                  Delete source and derived data
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep this source
                </button>
              </div>
            )}
          </section>
          {active.draft && (
            <ResumeFactEditor
              key={active.id}
              document={active}
              busy={busy}
              dictionary={dictionary}
              onConfirm={confirm}
            />
          )}
          {active.currentVersion && (
            <section className="panel section-block">
              <h2>Targeted review and fixed exports</h2>
              <p className="muted">
                Confirmed version {active.currentVersion.version}. New wording from a model is not
                enabled; the current suggestion reorders existing statements only.
              </p>
              {catalogEnabled && (
                <>
                  <label>
                    Target role
                    <select
                      className="text-input"
                      aria-label="Resume target role"
                      disabled={busy}
                      value={target?.id || ""}
                      onChange={(event) => {
                        const id = event.target.value,
                          operation = ++targetEpoch.current;
                        if (!id) {
                          setTarget(null);
                          return;
                        }
                        setBusy(true);
                        void catalog
                          .find(id)
                          .then((job) => {
                            if (targetEpoch.current === operation) setTarget(job);
                          })
                          .catch(fail)
                          .finally(() => {
                            if (targetEpoch.current === operation) setBusy(false);
                          });
                      }}
                    >
                      <option value="">Choose a published role</option>
                      {target && !jobs?.data.some((job) => job.id === target.id) && (
                        <option value={target.id}>{target.title}</option>
                      )}
                      {jobs?.data.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title} · {job.company}
                        </option>
                      ))}
                    </select>
                  </label>
                  {jobs?.nextCursor && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void catalog
                          .list({ q: "", limit: 20, cursor: jobs.nextCursor! })
                          .then((next) => setJobs({ ...next, data: [...jobs.data, ...next.data] }))
                          .catch(fail)
                          .finally(() => setBusy(false));
                      }}
                    >
                      Load more resume target roles
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={busy || !target}
                    onClick={() => void startProposal()}
                  >
                    Suggest a fact-preserving order
                  </button>
                </>
              )}
              <div className="resume-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void exportVersion(active.currentVersion!.id)}
                >
                  Create a fixed PDF export
                </button>
                <Link className="text-link" href="/skills/">
                  Review linked claims in your skill profile
                </Link>
              </div>
              <h3>Confirmed version history</h3>
              <div className="resume-actions">
                {active.versions.map((saved) => (
                  <button
                    className="button secondary"
                    key={saved.id}
                    disabled={busy}
                    onClick={() => void openVersion(saved.id)}
                  >
                    View version {saved.version}
                  </button>
                ))}
              </div>
            </section>
          )}
          {!!active.proposals.length && (
            <section className="section-block">
              <h2>Private proposal history</h2>
              <div className="assessment-history">
                {active.proposals.map((saved) => (
                  <article className="panel" key={saved.id}>
                    <p>
                      {saved.status}
                      {saved.stale ? " · historical inputs" : ""}
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void client.proposal(saved.id).then(setProposal).catch(fail)}
                    >
                      Review proposal
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {proposal && proposal.documentId === active.id && (
            <ResumeProposalView
              key={proposal.id}
              proposal={proposal}
              busy={busy}
              onAccept={acceptProposal}
              onVersion={(id) => void openVersion(id)}
            />
          )}
          {version && version.documentId === active.id && (
            <>
              <ResumeVersionView version={version} dictionary={versionDictionary} />
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void exportVersion(version.id)}
              >
                Export this historical version
              </button>
            </>
          )}
          {!!active.exports.length && (
            <section className="section-block">
              <h2>Private PDF exports</h2>
              <p className="muted">
                Each PDF uses its selected confirmed version. Download authority expires and is
                checked against your session and the source's current access.
              </p>
              <div className="assessment-history">
                {active.exports.map((saved) => (
                  <article className="panel" key={saved.id}>
                    <h3>
                      PDF · version{" "}
                      {active.versions.find((version) => version.id === saved.versionId)?.version ||
                        "saved"}
                    </h3>
                    <p>{saved.status}</p>
                    {saved.processingError && (
                      <p className="notice">{processingMessages[saved.processingError]}</p>
                    )}
                    <button
                      className="button secondary"
                      disabled={busy || saved.status !== "succeeded"}
                      onClick={() => void download(saved.id)}
                    >
                      Download fixed PDF
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {history && !login && (
        <ResumeHistoryList
          history={history}
          busy={busy}
          onOpen={(id) => void open(id).catch(() => {})}
          onMore={() => {
            if (!history.nextCursor) return;
            setBusy(true);
            void client
              .list(history.nextCursor)
              .then((next) =>
                setHistory({
                  ...next,
                  data: [...history.data, ...next.data].filter(
                    (item) => !deleted.current.has(item.id),
                  ),
                }),
              )
              .catch(fail)
              .finally(() => setBusy(false));
          }}
        />
      )}
    </>
  );
}
