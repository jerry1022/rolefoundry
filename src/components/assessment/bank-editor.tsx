"use client";
import { useEffect, useState } from "react";
import type { AssessmentAdminClient } from "@/modules/assessment/ports";
import type { SkillClient } from "@/modules/skills/ports";
import type { SkillDictionary } from "@/modules/skills/model";
import { questionInputSchema, type QuestionBank } from "@/modules/assessment/model";
import { tracks, type Track } from "@/modules/skills/catalog";
import { ApplicationError } from "@/modules/platform/errors";
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
  const [key, setKey] = useState(""),
    [version, setVersion] = useState(1),
    [description, setDescription] = useState("");
  return (
    <section className="panel">
      <h3>Create an immutable rubric version</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onMutation(() => client.rubric({ key, version, description }));
        }}
      >
        <fieldset className="profile-form-fields" disabled={busy}>
          <label>
            Rubric key
            <input
              aria-label="Rubric key"
              className="text-input"
              required
              maxLength={100}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label>
            Rubric version
            <input
              aria-label="Rubric version"
              className="text-input"
              type="number"
              required
              min={1}
              value={version}
              onChange={(event) => setVersion(event.target.valueAsNumber)}
            />
          </label>
          <label>
            Rubric description
            <textarea
              aria-label="Rubric description"
              className="text-input"
              required
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <button className="button primary">Create rubric version</button>
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
      <h3>Create a question version</h3>
      <p className="muted">
        Correct answers and explanations stay private until completion. New content must be reviewed
        before it can be selected.
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
            setError("Check the fields, choose a rubric and provide 2–10 answer options.");
            return;
          }
          setError("");
          void onMutation(() => client.question(parsed.data));
        }}
      >
        <fieldset className="profile-form-fields" disabled={busy || !bank.rubrics.length}>
          <label>
            Question key
            <input
              aria-label="Question key"
              className="text-input"
              required
              maxLength={100}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label>
            Question version
            <input
              aria-label="Question version"
              className="text-input"
              type="number"
              min={1}
              required
              value={version}
              onChange={(event) => setVersion(event.target.valueAsNumber)}
            />
          </label>
          <label>
            Track
            <select
              aria-label="Question track"
              className="text-input"
              value={track}
              onChange={(event) => setTrack(event.target.value as Track)}
            >
              {tracks.map((track) => (
                <option key={track}>{track}</option>
              ))}
            </select>
          </label>
          <label>
            Skill
            <select
              aria-label="Question skill"
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
            Rubric
            <select
              aria-label="Question rubric"
              className="text-input"
              value={rubricId}
              onChange={(event) => setRubric(event.target.value)}
            >
              {bank.rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.key} · version {rubric.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prompt
            <textarea
              aria-label="Question prompt"
              className="text-input"
              required
              maxLength={3000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <label>
            Options (one per line)
            <textarea
              aria-label="Question options"
              className="text-input"
              required
              maxLength={10000}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
            />
          </label>
          <label>
            Correct answer
            <select
              aria-label="Correct answer"
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
            Feedback explanation
            <textarea
              aria-label="Question explanation"
              className="text-input"
              required
              maxLength={3000}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="button primary">Create draft question</button>
        </fieldset>
      </form>
      {!bank.rubrics.length && <p className="muted">Create a rubric before authoring questions.</p>}
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
  const [bank, setBank] = useState<QuestionBank | null>(null),
    [dictionary, setDictionary] = useState<SkillDictionary | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState("");
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : "Unable to load the private question bank.",
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
      setMessage("Question bank change saved. Existing attempts keep their original versions.");
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-block">
      <h2>Question bank administration</h2>
      <p className="muted">
        Reviewed scenarios support a learning preview. Review does not claim professional
        calibration or certification. Correct-answer data in this panel is restricted to
        administrators.
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
            <h3>Review versions for selection</h3>
            <label>
              Review reason
              <input
                aria-label="Question review reason"
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
                    {question.track} · {question.key} version {question.version} ·{" "}
                    {question.reviewed ? "Reviewed for selection" : "Draft or retired"}
                  </p>
                  <p>Correct answer: {question.options[question.correctIndex]}</p>
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
                    {question.reviewed ? "Retire question version" : "Review question version"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
