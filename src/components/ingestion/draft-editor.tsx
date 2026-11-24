"use client";
import { msg, useI18n } from "@/lib/i18n";
import { jobLevels, workplaces } from "@/modules/jobs/model";
import { tracks } from "@/modules/skills/catalog";
import { careerPaths } from "@/modules/jobs/specializations";
import type { ImportKind } from "@/modules/ingestion/model";
type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "object" | "array";
  choices?: readonly string[];
  fields?: Field[];
  item?: Field;
  nullable?: boolean;
};
const text = (key: string, label: string, nullable = false): Field => ({ key, label, nullable });
const number = (key: string, label: string, nullable = false): Field => ({
  key,
  label,
  type: "number",
  nullable,
});
const select = (
  key: string,
  label: string,
  choices: readonly string[],
  nullable = false,
): Field => ({ key, label, type: "select", choices, nullable });
const array = (key: string, label: string, item: Field): Field => ({
  key,
  label,
  type: "array",
  item,
});
const object = (key: string, label: string, fields: Field[], nullable = false): Field => ({
  key,
  label,
  type: "object",
  fields,
  nullable,
});
const jobs: Field[] = [
  text("title", msg("Role title")),
  text("company", msg("Company")),
  select("track", msg("Assessment track"), tracks),
  select(
    "specialization",
    msg("Career direction"),
    careerPaths.map((path) => path.id),
  ),
  text("location", msg("Location"), true),
  select("workplace", msg("Workplace"), workplaces, true),
  select("level", msg("Seniority"), jobLevels, true),
  text("summary", msg("Editorial summary")),
  object(
    "salary",
    msg("Disclosed salary"),
    [
      number("min", msg("Minimum"), true),
      number("max", msg("Maximum"), true),
      text("currency", msg("Currency (ISO code)")),
      select("interval", msg("Pay period"), ["hour", "month", "year"]),
    ],
    true,
  ),
  array("responsibilities", msg("Responsibilities"), text("", msg("Responsibility"))),
  array(
    "requirements",
    msg("Requirements"),
    object("", msg("Requirement"), [
      text("text", msg("Requirement text")),
      select("priority", msg("Priority"), ["mandatory", "preferred"]),
      array("skills", msg("Canonical skill IDs"), text("", msg("Skill ID"))),
    ]),
  ),
  object("conditions", msg("Employment conditions"), [
    text("workAuthorization", msg("Work authorization"), true),
    text("education", msg("Education"), true),
    number("experienceYears", msg("Required years of experience"), true),
  ]),
  text("expiresAt", msg("Expiry (ISO timestamp with timezone)"), true),
];
const courses: Field[] = [
  text("title", msg("Course title")),
  text("summary", msg("Editorial summary")),
  array("skills", msg("Canonical skill IDs"), text("", msg("Skill ID"))),
  array("prerequisiteSkills", msg("Prerequisite skill IDs"), text("", msg("Skill ID"))),
  array("prerequisiteCourseIds", msg("Prerequisite course IDs"), text("", msg("Course ID"))),
  text("language", msg("Language"), true),
  select("difficulty", msg("Difficulty"), ["Beginner", "Intermediate", "Advanced", "Unknown"]),
  text("format", msg("Course format")),
  number("officialMinutes", msg("Official study minutes"), true),
  number("editorialMinutes", msg("Editorial study minutes"), true),
  text("durationNote", msg("Duration basis and uncertainty")),
  object("practice", msg("Independent practice"), [
    text("prompt", msg("Practice prompt")),
    text("completionCriteria", msg("Completion criteria")),
    number("minutes", msg("Practice minutes")),
  ]),
];
function blank(field: Field): unknown {
  if (field.nullable) return null;
  if (field.type === "object")
    return Object.fromEntries(field.fields!.map((child) => [child.key, blank(child)]));
  if (field.type === "array") return [];
  return "";
}
function FieldEditor({
  field,
  value,
  path,
  onChange,
}: {
  field: Field;
  value: unknown;
  path: string;
  onChange: (value: unknown) => void;
}) {
  const { t } = useI18n();
  const label = t(field.label);
  if (field.type === "object") {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    return (
      <fieldset className="panel">
        <legend>{label}</legend>
        {field.nullable && (
          <label>
            <input
              type="checkbox"
              checked={record !== null}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? Object.fromEntries(field.fields!.map((child) => [child.key, blank(child)]))
                    : null,
                )
              }
            />
            {t("Include {field}", { field: label.toLowerCase() })}
          </label>
        )}
        {(!field.nullable || record) &&
          field.fields!.map((child) => (
            <FieldEditor
              key={child.key}
              field={child}
              value={record?.[child.key]}
              path={`${path} / ${t(child.label)}`}
              onChange={(next) => onChange({ ...record, [child.key]: next })}
            />
          ))}
      </fieldset>
    );
  }
  if (field.type === "array") {
    const rows = Array.isArray(value) ? value : [];
    return (
      <fieldset className="panel">
        <legend>{label}</legend>
        {rows.map((row, index) => (
          <div key={index} className="section-block">
            <FieldEditor
              field={field.item!}
              value={row}
              path={`${path} ${index + 1}`}
              onChange={(next) =>
                onChange(rows.map((current, position) => (position === index ? next : current)))
              }
            />
            <button
              type="button"
              className="button secondary"
              aria-label={t("Remove {item}", { item: `${path} ${index + 1}` })}
              onClick={() => onChange(rows.filter((_, position) => position !== index))}
            >
              {t("Remove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={rows.length >= 20}
          onClick={() => onChange([...rows, blank(field.item!)])}
        >
          {t("Add {field}", { field: label.toLowerCase() })}
        </button>
      </fieldset>
    );
  }
  if (field.type === "select")
    return (
      <label>
        {label}
        <select
          className="text-input"
          aria-label={path}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || (field.nullable ? null : ""))}
        >
          <option value="">
            {field.nullable ? t("Unknown / undisclosed") : t("Choose a value")}
          </option>
          {field.choices!.map((choice) => (
            <option key={choice} value={choice}>
              {t(careerPaths.find((path) => path.id === choice)?.title || choice)}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.type === "number")
    return (
      <label>
        {label}
        <input
          className="text-input"
          aria-label={path}
          type="number"
          min={0}
          step="any"
          value={typeof value === "number" ? value : ""}
          placeholder={field.nullable ? t("Unknown / undisclosed") : t("Enter a number")}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? (field.nullable ? null : "") : event.target.valueAsNumber,
            )
          }
        />
      </label>
    );
  return (
    <label>
      {field.label}
      <textarea
        className="text-input"
        aria-label={path}
        rows={2}
        maxLength={3000}
        value={typeof value === "string" ? value : ""}
        placeholder={field.nullable ? t("Unknown / undisclosed") : t("Enter reviewed metadata")}
        onChange={(event) => onChange(event.target.value || (field.nullable ? null : ""))}
      />
    </label>
  );
}
/** Editorial fields only. Catalog identity and source provenance are locked by the server. */
export function ImportDraftEditor({
  kind,
  draft,
  onChange,
}: {
  kind: ImportKind;
  draft: Record<string, unknown>;
  onChange: (draft: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="profile-form-fields">
      {(kind === "jobs" ? jobs : courses).map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={draft[field.key]}
          path={t(field.label)}
          onChange={(value) => onChange({ ...draft, [field.key]: value })}
        />
      ))}
    </div>
  );
}
