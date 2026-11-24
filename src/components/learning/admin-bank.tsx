"use client";
import { useEffect, useState } from "react";
import type { z } from "zod";
import type { LearningAdminClient } from "@/modules/learning/ports";
import type { SkillClient } from "@/modules/skills/ports";
import {
  courseDraftSchema,
  courseFields,
  type CourseDraft,
  courseBankSchema,
} from "@/modules/learning/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
const difficulties = [msg("Unknown"), msg("Beginner"), msg("Intermediate"), msg("Advanced")];
type Bank = z.infer<typeof courseBankSchema>;
type BankCourse = Bank["courses"][number];
type Mutation = (work: () => Promise<unknown>) => Promise<void>;
function SourceForm({
  bank,
  busy,
  onMutation,
  client,
}: {
  bank: Bank;
  busy: boolean;
  onMutation: Mutation;
  client: LearningAdminClient;
}) {
  const { t } = useI18n();
  const [hosts, setHosts] = useState<string[]>(bank.providers[0]?.allowedHosts.slice(0, 1) || []);
  const [provider, setProvider] = useState(bank.providers[0]?.id || ""),
    [name, setName] = useState(""),
    [publisher, setPublisher] = useState(""),
    [basis, setBasis] = useState(""),
    [rights, setRights] = useState(""),
    [demo, setDemo] = useState(true);
  const selectedProvider = bank.providers.find((item) => item.id === provider);
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void onMutation(() =>
          client.source({
            providerId: provider,
            name,
            publisher,
            authorizationBasis: basis,
            rightsSummary: rights,
            allowedHosts: hosts,
            permittedFields: [...courseFields],
            isDemo: demo,
          }),
        );
      }}
    >
      <h3>{t("Review a metadata source policy")}</h3>
      <p className="muted">
        {t(
          "Store approved metadata and links, not lessons. Provider host rules are configured independently of course authors.",
        )}
      </p>
      <fieldset disabled={busy} className="profile-form-fields">
        <label>
          {t("Provider")}
          <select
            className="text-input"
            aria-label={t("Course source provider")}
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setHosts(
                bank.providers
                  .find((item) => item.id === event.target.value)
                  ?.allowedHosts.slice(0, 1) || [],
              );
            }}
          >
            {bank.providers.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {[
          [msg("Source name"), name, setName],
          [msg("Publisher"), publisher, setPublisher],
          [msg("Authorization basis (private)"), basis, setBasis],
          [msg("Public rights summary"), rights, setRights],
        ].map(([label, value, setter]) => (
          <label key={label as string}>
            {t(label as string)}
            <textarea
              className="text-input"
              aria-label={t(label as string)}
              required
              value={value as string}
              maxLength={
                label === "Authorization basis (private)"
                  ? 2000
                  : label === "Public rights summary"
                    ? 500
                    : 160
              }
              onChange={(event) => (setter as (value: string) => void)(event.target.value)}
            />
          </label>
        ))}
        <label>
          {t("Hosts covered by this policy")}
          <select
            aria-label={t("Course source allowed hosts")}
            className="text-input learning-multiselect"
            multiple
            size={3}
            required
            value={hosts}
            onChange={(event) =>
              setHosts(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
          >
            {selectedProvider?.allowedHosts.map((host) => (
              <option key={host} value={host}>
                {host}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {t(
            "Allowed official hosts: {hosts}. Permission covers the twelve catalog metadata fields. Allowed course paths: {paths}.",
            {
              hosts: selectedProvider?.allowedHosts.join(", ") ?? "",
              paths: selectedProvider?.pathPrefixes.join(", ") ?? "",
            },
          )}
        </p>
        <label>
          <input
            type="checkbox"
            checked={demo}
            onChange={(event) => setDemo(event.target.checked)}
          />{" "}
          {t("This is demonstration metadata")}
        </label>
        <label>
          <input type="checkbox" required />{" "}
          {t("I reviewed the stated permission and metadata scope")}
        </label>
        <button className="button primary">{t("Create course source policy")}</button>
      </fieldset>
    </form>
  );
}
function blank(bank: Bank): CourseDraft {
  return {
    key: "",
    providerId: bank.providers[0]?.id || "deeplearning-ai",
    sourceId:
      bank.sources.find(
        (source) =>
          source.status === "active" &&
          source.providerId === (bank.providers[0]?.id || "deeplearning-ai"),
      )?.id || "",
    title: "",
    url: "",
    summary: "",
    skills: [],
    prerequisiteSkills: [],
    prerequisiteCourseIds: [],
    language: null,
    difficulty: "Unknown",
    format: "Course",
    officialMinutes: null,
    editorialMinutes: null,
    durationNote: "Review the provider duration; label independent estimates explicitly.",
    practice: { prompt: "", completionCriteria: "", minutes: 15 },
  };
}
function draftFrom(record: BankCourse, redirects: { [id: string]: string }): CourseDraft {
  const { id, version, revision, stage, retired, publishedVersion, ...draft } = record;
  return {
    ...draft,
    skills: [...new Set(draft.skills.map((id) => redirects[id] || id))],
    prerequisiteSkills: [...new Set(draft.prerequisiteSkills.map((id) => redirects[id] || id))],
  };
}
function DraftForm({
  bank,
  record,
  labels,
  redirects,
  client,
  busy,
  onMutation,
}: {
  bank: Bank;
  record: BankCourse | undefined;
  labels: { id: string; name: string }[];
  redirects: { [id: string]: string };
  client: LearningAdminClient;
  busy: boolean;
  onMutation: Mutation;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CourseDraft>(
      record ? draftFrom(record, redirects) : blank(bank),
    ),
    [error, setError] = useState("");
  useEffect(() => {
    if (!draft.sourceId) {
      const source = bank.sources.find(
        (source) => source.status === "active" && source.providerId === draft.providerId,
      );
      if (source) setDraft((current) => ({ ...current, sourceId: source.id }));
    }
  }, [bank.sources, draft.sourceId, draft.providerId]);
  const field = (
    key: "key" | "title" | "url" | "summary" | "format" | "durationNote",
    label: string,
    max: number,
  ) => (
    <label key={key}>
      {label}
      <textarea
        aria-label={label}
        className="text-input"
        required
        maxLength={max}
        disabled={key === "key" && !!record}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = courseDraftSchema.safeParse(draft);
        if (!parsed.success) {
          setError(t("Check the source, resource fields, skills and estimates."));
          return;
        }
        setError("");
        void onMutation(() =>
          record
            ? client.revise(record.id, parsed.data, record.revision)
            : client.create(parsed.data),
        );
      }}
    >
      <h3>{record ? t("Create the next immutable course version") : t("Author a course draft")}</h3>
      <p className="muted">
        {t(
          "An existing approved version stays visible while the next draft is reviewed. Estimates and practice prompts must be clearly editorial.",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      <fieldset className="profile-form-fields" disabled={busy || !bank.sources.length}>
        <label>
          {t("Provider")}
          <select
            aria-label={t("Draft course provider")}
            className="text-input"
            disabled={!!record}
            value={draft.providerId}
            onChange={(event) =>
              setDraft({ ...draft, providerId: event.target.value, sourceId: "" })
            }
          >
            {bank.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Approved source policy")}
          <select
            aria-label={t("Draft course source")}
            className="text-input"
            value={draft.sourceId}
            required
            onChange={(event) => setDraft({ ...draft, sourceId: event.target.value })}
          >
            <option value="">{t("Choose a source")}</option>
            {bank.sources
              .filter(
                (source) => source.providerId === draft.providerId && source.status === "active",
              )
              .map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
          </select>
        </label>
        {field("key", t("Course catalog key"), 200)}
        {field("title", t("Course title"), 200)}
        {field("url", t("Official course URL"), 2048)}
        {field("summary", t("Independent course summary"), 2000)}
        <label>
          {t("Difficulty")}
          <select
            className="text-input"
            aria-label={t("Draft course difficulty")}
            value={draft.difficulty}
            onChange={(event) =>
              setDraft({ ...draft, difficulty: event.target.value as CourseDraft["difficulty"] })
            }
          >
            {difficulties.map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Language (leave unknown when not confirmed)")}
          <input
            className="text-input"
            aria-label={t("Course language")}
            maxLength={60}
            value={draft.language || ""}
            onChange={(event) => setDraft({ ...draft, language: event.target.value || null })}
          />
        </label>
        {field("format", t("Course format"), 60)}
        {(["skills", "prerequisiteSkills"] as const).map((key) => (
          <label key={key}>
            {key === "skills" ? t("Skills addressed") : t("Prerequisite skills")}
            <select
              aria-label={
                key === "skills" ? t("Course addressed skills") : t("Course prerequisite skills")
              }
              className="text-input learning-multiselect"
              multiple
              size={4}
              value={draft[key]}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  [key]: Array.from(event.target.selectedOptions).map((option) => option.value),
                })
              }
            >
              {labels.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {t("Prerequisite courses")}
          <select
            aria-label={t("Course prerequisite resources")}
            className="text-input learning-multiselect"
            multiple
            size={4}
            value={draft.prerequisiteCourseIds}
            onChange={(event) =>
              setDraft({
                ...draft,
                prerequisiteCourseIds: Array.from(event.target.selectedOptions).map(
                  (option) => option.value,
                ),
              })
            }
          >
            {bank.courses
              .filter((item) => item.id !== record?.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        {(["officialMinutes", "editorialMinutes"] as const).map((key) => (
          <label key={key}>
            {key === "officialMinutes"
              ? t("Confirmed official minutes (optional)")
              : t("Editorial estimated minutes (optional)")}
            <input
              className="text-input"
              aria-label={
                key === "officialMinutes"
                  ? t("Official course minutes")
                  : t("Editorial course minutes")
              }
              type="number"
              min={1}
              max={50000}
              value={draft[key] ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  [key]: event.target.value === "" ? null : event.target.valueAsNumber,
                })
              }
            />
          </label>
        ))}
        {field("durationNote", t("Duration source or estimate note"), 1000)}
        <label>
          {t("Original practice prompt")}
          <textarea
            className="text-input"
            aria-label={t("Course practice prompt")}
            required
            maxLength={1000}
            value={draft.practice.prompt}
            onChange={(event) =>
              setDraft({ ...draft, practice: { ...draft.practice, prompt: event.target.value } })
            }
          />
        </label>
        <label>
          {t("Practice completion criteria")}
          <textarea
            className="text-input"
            aria-label={t("Course practice completion criteria")}
            required
            maxLength={1000}
            value={draft.practice.completionCriteria}
            onChange={(event) =>
              setDraft({
                ...draft,
                practice: { ...draft.practice, completionCriteria: event.target.value },
              })
            }
          />
        </label>
        <label>
          {t("Practice minutes")}
          <input
            className="text-input"
            aria-label={t("Course practice minutes")}
            type="number"
            min={5}
            max={240}
            required
            value={draft.practice.minutes}
            onChange={(event) =>
              setDraft({
                ...draft,
                practice: { ...draft.practice, minutes: event.target.valueAsNumber },
              })
            }
          />
        </label>
        <button className="button primary">
          {record ? t("Save new course version") : t("Create course draft")}
        </button>
      </fieldset>
    </form>
  );
}
export function CourseAdministration({
  client,
  skills,
  onChanged,
}: {
  client: LearningAdminClient;
  skills: SkillClient;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [redirects, setRedirects] = useState<{ [id: string]: string }>({});
  const [bank, setBank] = useState<Bank | null>(null),
    [labels, setLabels] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : t("Course administration is unavailable."),
    );
  }
  useEffect(() => {
    let present = true;
    void Promise.all([client.bank(), skills.get()])
      .then(([bank, dictionary]) => {
        if (present) {
          setBank(bank);
          const map: { [id: string]: string } = {};
          for (const skill of dictionary.skills) {
            let current = skill;
            const seen = new Set<string>();
            while (current.redirectTo && !seen.has(current.id)) {
              seen.add(current.id);
              const next = dictionary.skills.find((item) => item.id === current.redirectTo);
              if (!next) break;
              current = next;
            }
            map[skill.id] = current.id;
          }
          setRedirects(map);
          setLabels(
            dictionary.skills
              .filter((skill) => skill.status === "active")
              .map((skill) => ({ id: skill.id, name: skill.nameEn })),
          );
        }
      })
      .catch((error) => {
        if (present) failed(error);
      });
    return () => {
      present = false;
    };
  }, [client, skills]);
  async function mutate(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setBank(await client.bank());
      onChanged();
      setMessage(t("Course catalog change saved. Historical plan versions remain separate."));
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  const record = bank?.courses.find((item) => item.id === selected);
  return (
    <section className="section-block">
      <h2>{t("Course catalog administration")}</h2>
      <p className="muted">
        {t(
          "Review metadata, permissions, mappings and practice outcomes before publication. A successful link fetch alone is not a content review.",
        )}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {bank && (
        <>
          <label>
            {t("Edit a course or author a new resource")}
            <select
              aria-label={t("Course draft editor selection")}
              className="text-input"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{t("New course")}</option>
              {bank.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <div className="assessment-admin-grid section-block">
            <SourceForm bank={bank} busy={busy} client={client} onMutation={mutate} />
            <DraftForm
              key={record ? `${record.id}-${record.revision}` : "new"}
              bank={bank}
              record={record}
              labels={labels}
              redirects={redirects}
              client={client}
              busy={busy}
              onMutation={mutate}
            />
          </div>
          <section className="panel section-block">
            <h3>{t("Review and source status")}</h3>
            <label>
              {t("Review reason")}
              <input
                aria-label={t("Course review reason")}
                className="text-input"
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="learning-course-grid">
              {bank.courses.map((course) => (
                <article key={course.id} className="learning-reference">
                  <h4>{course.title}</h4>
                  <p>
                    {t("Draft version {version}", { version: course.version })} · {course.stage} ·{" "}
                    {course.retired
                      ? t("Retired")
                      : course.publishedVersion === null
                        ? t("Approved version none")
                        : t("Approved version {version}", { version: course.publishedVersion })}
                  </p>
                  <div className="learning-actions">
                    {(
                      [
                        "review",
                        "publish",
                        "retire",
                        "confirmed_active",
                        "network_failure",
                      ] as const
                    ).map((action) => (
                      <button
                        key={action}
                        className="button secondary"
                        disabled={
                          busy ||
                          !reason.trim() ||
                          (action === "publish" && course.stage !== "review")
                        }
                        onClick={() =>
                          void mutate(() =>
                            client.transition(course.id, {
                              expectedRevision: course.revision,
                              action,
                              reason,
                            }),
                          )
                        }
                      >
                        {
                          {
                            review: t("Review course draft"),
                            publish: t("Publish reviewed course"),
                            retire: t("Retire course"),
                            confirmed_active: t("Confirm resource active"),
                            network_failure: t("Record uncertain availability"),
                          }[action]
                        }
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {bank.sources.map((source) => (
              <article key={source.id} className="learning-reference">
                <h4>{source.name}</h4>
                <p>
                  {source.status} · {source.rightsSummary}
                </p>
                <details>
                  <summary>{t("Private permission record")}</summary>
                  <p>{source.authorizationBasis}</p>
                </details>
                <button
                  className="button secondary"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void mutate(() =>
                      client.sourceStatus(
                        source.id,
                        source.status === "active" ? "revoked" : "active",
                        reason,
                      ),
                    )
                  }
                >
                  {source.status === "active"
                    ? t("Revoke course source policy")
                    : t("Reactivate reviewed course source")}
                </button>
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
