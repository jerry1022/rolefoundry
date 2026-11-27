"use client";
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
  text("title", "Role title"),
  text("company", "Company"),
  select("track", "Assessment track", tracks),
  select(
    "specialization",
    "Career direction",
    careerPaths.map((path) => path.id),
  ),
  text("location", "Location", true),
  select("workplace", "Workplace", workplaces, true),
  select("level", "Seniority", jobLevels, true),
  text("summary", "Editorial summary"),
  object(
    "salary",
    "Disclosed salary",
    [
      number("min", "Minimum", true),
      number("max", "Maximum", true),
      text("currency", "Currency (ISO code)"),
      select("interval", "Pay period", ["hour", "month", "year"]),
    ],
    true,
  ),
  array("responsibilities", "Responsibilities", text("", "Responsibility")),
  array(
    "requirements",
    "Requirements",
    object("", "Requirement", [
      text("text", "Requirement text"),
      select("priority", "Priority", ["mandatory", "preferred"]),
      array("skills", "Canonical skill IDs", text("", "Skill ID")),
    ]),
  ),
  object("conditions", "Employment conditions", [
    text("workAuthorization", "Work authorization", true),
    text("education", "Education", true),
    number("experienceYears", "Required years of experience", true),
  ]),
  text("expiresAt", "Expiry (ISO timestamp with timezone)", true),
];
const courses: Field[] = [
  text("title", "Course title"),
  text("summary", "Editorial summary"),
  array("skills", "Canonical skill IDs", text("", "Skill ID")),
  array("prerequisiteSkills", "Prerequisite skill IDs", text("", "Skill ID")),
  array("prerequisiteCourseIds", "Prerequisite course IDs", text("", "Course ID")),
  text("language", "Language", true),
  select("difficulty", "Difficulty", ["Beginner", "Intermediate", "Advanced", "Unknown"]),
  text("format", "Course format"),
  number("officialMinutes", "Official study minutes", true),
  number("editorialMinutes", "Editorial study minutes", true),
  text("durationNote", "Duration basis and uncertainty"),
  object("practice", "Independent practice", [
    text("prompt", "Practice prompt"),
    text("completionCriteria", "Completion criteria"),
    number("minutes", "Practice minutes"),
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
  if (field.type === "object") {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    return (
      <fieldset className="panel">
        <legend>{field.label}</legend>
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
            Include {field.label.toLowerCase()}
          </label>
        )}
        {(!field.nullable || record) &&
          field.fields!.map((child) => (
            <FieldEditor
              key={child.key}
              field={child}
              value={record?.[child.key]}
              path={`${path} / ${child.label}`}
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
        <legend>{field.label}</legend>
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
              aria-label={`Remove ${path} ${index + 1}`}
              onClick={() => onChange(rows.filter((_, position) => position !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={rows.length >= 20}
          onClick={() => onChange([...rows, blank(field.item!)])}
        >
          Add {field.label.toLowerCase()}
        </button>
      </fieldset>
    );
  }
  if (field.type === "select")
    return (
      <label>
        {field.label}
        <select
          className="text-input"
          aria-label={path}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || (field.nullable ? null : ""))}
        >
          <option value="">{field.nullable ? "Unknown / undisclosed" : "Choose a value"}</option>
          {field.choices!.map((choice) => (
            <option key={choice} value={choice}>
              {careerPaths.find((path) => path.id === choice)?.title || choice}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.type === "number")
    return (
      <label>
        {field.label}
        <input
          className="text-input"
          aria-label={path}
          type="number"
          min={0}
          step="any"
          value={typeof value === "number" ? value : ""}
          placeholder={field.nullable ? "Unknown / undisclosed" : "Enter a number"}
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
        placeholder={field.nullable ? "Unknown / undisclosed" : "Enter reviewed metadata"}
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
  return (
    <div className="profile-form-fields">
      {(kind === "jobs" ? jobs : courses).map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={draft[field.key]}
          path={field.label}
          onChange={(value) => onChange({ ...draft, [field.key]: value })}
        />
      ))}
    </div>
  );
}
