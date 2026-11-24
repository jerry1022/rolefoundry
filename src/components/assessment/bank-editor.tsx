"use client";
import { useEffect, useState } from "react";
import type { AssessmentAdminClient } from "@/modules/assessment/ports";
import type { SkillClient } from "@/modules/skills/ports";
import type { SkillDictionary } from "@/modules/skills/model";
import { questionInputSchema, type QuestionBank } from "@/modules/assessment/model";
import { tracks, type Track } from "@/modules/skills/catalog";
import { ApplicationError } from "@/modules/platform/errors";
import { useI18n } from "@/lib/i18n";
import { QuestionTranslationForm } from "./question-translation";
type Mutation = (work: () => Promise<unknown>) => Promise<void>;
function RubricForm({
  client,
  busy,
  onMutation,
}: {
  client: AssessmentAdminClient;
  busy: boolean;
  onMutation: Mutation;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState(""),
    [version, setVersion] = useState(1),
    [description, setDescription] = useState("");
  return (
    <section className="panel">
      <h3>{t("Create an immutable rubric version")}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onMutation(() => client.rubric({ key, version, description }));
        }}
      >
        <fieldset className="profile-form-fields" disabled={busy}>
          <label>
            {t("Rubric key")}
            <input
              aria-label={t("Rubric key")}
              className="text-input"
              required
              maxLength={100}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label>
            {t("Rubric version")}
            <input
              aria-label={t("Rubric version")}
              className="text-input"
              type="number"
              required
              min={1}
              value={version}
              onChange={(event) => setVersion(event.target.valueAsNumber)}
            />
          </label>
          <label>
            {t("Rubric description")}
            <textarea
              aria-label={t("Rubric description")}
              className="text-input"
              required
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <button className="button primary">{t("Create rubric version")}</button>
        </fieldset>
      </form>
    </section>
  );
}
function QuestionForm({
  client,
  bank,
  skills,
  busy,
  onMutation,
}: {
  client: AssessmentAdminClient;
  bank: QuestionBank;
  skills: SkillDictionary;
  busy: boolean;
  onMutation: Mutation;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState(""),
    [version, setVersion] = useState(1),
    [track, setTrack] = useState<Track>(tracks[0]),
    [skillId, setSkill] = useState(
      skills.skills.find((skill) => skill.status === "active")?.id || "",
    ),
    [rubricId, setRubric] = useState(bank.rubrics[0]?.id || ""),
    [prompt, setPrompt] = useState(""),
    [options, setOptions] = useState(""),
    [correctIndex, setCorrect] = useState(0),
    [explanation, setExplanation] = useState(""),
    [error, setError] = useState("");
  const choices = options.split("\n").filter((line) => line.trim());
  return (
    <section className="panel">
      <h3>{t("Create a question version")}</h3>
      <p className="muted">
        {t(
          "Correct answers and explanations stay private until completion. New content must be reviewed before it can be selected.",
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = questionInputSchema.safeParse({
            key,
            version,
            track,
            skillId,
            rubricId,
            prompt,
            options: choices,
            correctIndex,
            explanation,
          });
          if (!parsed.success) {
            setError(t("Check the fields, choose a rubric and provide 2–10 answer options."));
            return;
          }
          setError("");
          void onMutation(() => client.question(parsed.data));
        }}
      >
        <fieldset className="profile-form-fields" disabled={busy || !bank.rubrics.length}>
          <label>
            {t("Question key")}
            <input
              aria-label={t("Question key")}
              className="text-input"
              required
              maxLength={100}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label>
            {t("Question version")}
            <input
              aria-label={t("Question version")}
              className="text-input"
              type="number"
              min={1}
              required
              value={version}
              onChange={(event) => setVersion(event.target.valueAsNumber)}
            />
          </label>
          <label>
            {t("Track")}
            <select
              aria-label={t("Question track")}
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
          <label>
            {t("Skill")}
            <select
              aria-label={t("Question skill")}
              className="text-input"
              value={skillId}
              onChange={(event) => setSkill(event.target.value)}
            >
              {skills.skills
                .filter((skill) => skill.status === "active")
                .map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.nameEn}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("Rubric")}
            <select
              aria-label={t("Question rubric")}
              className="text-input"
              value={rubricId}
              onChange={(event) => setRubric(event.target.value)}
            >
              {bank.rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {t("{key} · version {version}", { key: rubric.key, version: rubric.version })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Prompt")}
            <textarea
              aria-label={t("Question prompt")}
              className="text-input"
              required
              maxLength={3000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <label>
            {t("Options (one per line)")}
            <textarea
              aria-label={t("Question options")}
              className="text-input"
              required
              maxLength={10000}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
            />
          </label>
          <label>
            {t("Correct answer")}
            <select
              aria-label={t("Correct answer")}
              className="text-input"
              value={correctIndex}
              onChange={(event) => setCorrect(Number(event.target.value))}
            >
              {choices.map((choice, index) => (
                <option key={index} value={index}>
                  {index + 1}. {choice}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Feedback explanation")}
            <textarea
              aria-label={t("Question explanation")}
              className="text-input"
              required
              maxLength={3000}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
          </label>
          {error && <p role="alert">{t(error)}</p>}
          <button className="button primary">{t("Create draft question")}</button>
        </fieldset>
      </form>
      {!bank.rubrics.length && (
        <p className="muted">{t("Create a rubric before authoring questions.")}</p>
      )}
    </section>
  );
}
export function AssessmentBank({
  client,
  skills,
}: {
  client: AssessmentAdminClient;
  skills: SkillClient;
}) {
  const { t } = useI18n();
  const [bank, setBank] = useState<QuestionBank | null>(null),
    [dictionary, setDictionary] = useState<SkillDictionary | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState("");
  function failed(error: unknown) {
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
      setBank(null);
      setDictionary(null);
      setReason("");
      setMessage("");
    }
    setError(
      error instanceof ApplicationError
        ? error.message
        : t("Unable to load the private question bank."),
    );
  }
  useEffect(() => {
    let active = true;
    void Promise.all([client.bank(), skills.get()])
      .then(([bank, dictionary]) => {
        if (active) {
          setBank(bank);
          setDictionary(dictionary);
        }
      })
      .catch((error) => {
        if (active) failed(error);
      });
    return () => {
      active = false;
    };
  }, [client, skills]);
  async function mutate(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setBank(await client.bank());
      setMessage(t("Question bank change saved. Existing attempts keep their original versions."));
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-block">
      <h2>{t("Question bank administration")}</h2>
      <p className="muted">
        {t(
          "Reviewed scenarios support a learning preview. Review does not claim professional calibration or certification. Correct-answer data in this panel is restricted to administrators.",
        )}
      </p>
      {error && (
        <p className="notice" role="alert">
          {t(error)}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {bank && dictionary && (
        <>
          <div className="assessment-admin-grid">
            <RubricForm client={client} busy={busy} onMutation={mutate} />
            <QuestionForm
              key={bank.rubrics.length}
              client={client}
              bank={bank}
              skills={dictionary}
              busy={busy}
              onMutation={mutate}
            />
          </div>
          <section className="panel section-block">
            <h3>{t("Review versions for selection")}</h3>
            <label>
              {t("Review reason")}
              <input
                aria-label={t("Question review reason")}
                className="text-input"
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="assessment-question-list">
              {bank.questions.map((question) => (
                <article className="assessment-question" key={question.id}>
                  <h4>{question.prompt}</h4>
                  <p className="muted">
                    {t(question.track)} ·{" "}
                    {t("{key} version {version}", { key: question.key, version: question.version })}{" "}
                    · {question.reviewed ? t("Reviewed for selection") : t("Draft or retired")}
                  </p>
                  <p>
                    {t("Correct answer: {answer}", {
                      answer: question.options[question.correctIndex],
                    })}
                  </p>
                  <p>{question.explanation}</p>
                  <button
                    className="button secondary"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void mutate(() =>
                        question.reviewed
                          ? client.retire(question.id, reason)
                          : client.review(question.id, reason),
                      )
                    }
                  >
                    {question.reviewed
                      ? t("Retire question version")
                      : t("Review question version")}
                  </button>
                  <QuestionTranslationForm
                    key={question.translations?.["zh-TW"]?.reviewedAt ?? "new"}
                    question={question}
                    client={client}
                    busy={busy}
                    onMutation={mutate}
                  />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
