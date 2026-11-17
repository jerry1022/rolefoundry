import { jobDraftSchema, workplaces, jobLevels } from "../jobs/model";
import { courseDraftSchema } from "../learning/model";
import { normalizeSkillTerm, type SkillDictionary } from "../skills/model";
import {
  ImportFailure,
  importOutputSchema,
  importContextSchema,
  sanitizedImportSchema,
  ingestionLimits,
  type ImportContext,
  type ImportIssue,
  type ImportRow,
  type ImportSource,
  type NormalizedRow,
  type SanitizedImport,
  type ImportOutput,
} from "./model";
import { boundedObject, sanitizeImport } from "./input";
export interface ImportKeyFactory {
  key(source: ImportSource, externalId: string): string;
}
const own = (object: Record<string, unknown>, key: string) => Object.hasOwn(object, key);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : value;
const numeric = (value: unknown) =>
  typeof value === "string" && /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(value.trim())
    ? Number(value.replace(/,/g, ""))
    : value;
function enumValue(value: unknown, options: readonly string[]) {
  if (typeof value !== "string") return value;
  return (
    options.find((option) => option.toLowerCase() === value.trim().toLowerCase()) ?? clean(value)
  );
}
export function durationMinutes(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match =
    /^([0-9]+(?:\.[0-9]+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|seconds)?$/i.exec(
      value.trim(),
    );
  if (!match) return clean(value);
  const factor = /^h/i.test(match[2] ?? "") ? 60 : /^s/i.test(match[2] ?? "") ? 1 / 60 : 1,
    result = Number(match[1]) * factor;
  return Number.isInteger(result) ? result : clean(value);
}
function salary(value: unknown): unknown {
  if (value === null) return null;
  if (
    typeof value === "string" &&
    /^(?:undisclosed|not disclosed|面議|未提供)$/i.test(value.trim())
  )
    return null;
  if (!object(value)) return value;
  const interval =
    typeof value.interval === "string" ? value.interval.trim().toLowerCase() : value.interval;
  return {
    ...value,
    min: own(value, "min") ? numeric(value.min) : null,
    max: own(value, "max") ? numeric(value.max) : null,
    currency:
      typeof value.currency === "string" ? value.currency.trim().toUpperCase() : value.currency,
    interval:
      typeof interval === "string"
        ? ((
            {
              annual: "year",
              annually: "year",
              yearly: "year",
              monthly: "month",
              hourly: "hour",
            } as Record<string, string>
          )[interval] ?? interval)
        : interval,
  };
}
function skillResolver(dictionary: SkillDictionary) {
  const byId = new Map(dictionary.skills.map((skill) => [skill.id, skill])),
    terms = new Map<string, Set<string>>();
  function canonical(id: string) {
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current?.status === "merged") {
      if (seen.has(current.id) || !current.redirectTo) return null;
      seen.add(current.id);
      current = byId.get(current.redirectTo);
    }
    return current?.status === "active" ? current.id : null;
  }
  function add(term: string, id: string) {
    const key = normalizeSkillTerm(term),
      resolved = canonical(id);
    if (!resolved) return;
    const values = terms.get(key) ?? new Set<string>();
    values.add(resolved);
    terms.set(key, values);
  }
  for (const skill of dictionary.skills) {
    add(skill.nameEn, skill.id);
    add(skill.nameZhTw, skill.id);
  }
  for (const alias of dictionary.aliases) add(alias.alias, alias.skillId);
  return (term: string) =>
    byId.has(term)
      ? { ids: canonical(term) ? [canonical(term)!] : [], exact: true }
      : { ids: [...(terms.get(normalizeSkillTerm(term)) ?? [])].sort(), exact: false };
}
function normalizeRow(
  row: ImportRow,
  context: ImportContext,
  keys: ImportKeyFactory,
): NormalizedRow {
  const { source } = context,
    binding = context.existing.find((item) => item.externalId === row.externalId),
    existing = binding?.target;
  if (existing && existing.kind !== source.kind) throw new ImportFailure("invalid-context");
  const base: Record<string, unknown> = existing
    ? structuredClone(existing.draft)
    : source.kind === "jobs"
      ? {
          canonicalKey: keys.key(source, row.externalId),
          location: null,
          workplace: null,
          level: null,
          salary: null,
          responsibilities: [],
          conditions: { workAuthorization: null, education: null, experienceYears: null },
          expiresAt: null,
        }
      : {
          key: keys.key(source, row.externalId),
          providerId: source.provider?.id,
          sourceId: source.id,
          url: row.url,
          prerequisiteSkills: [],
          prerequisiteCourseIds: [],
          language: null,
          difficulty: "Unknown",
          officialMinutes: null,
          editorialMinutes: null,
        };
  const candidate: Record<string, unknown> = { ...base },
    issues: ImportIssue[] = [],
    unmapped = new Set<string>(),
    resolve = skillResolver(context.dictionary);
  function mapSkills(value: unknown, field: string): unknown {
    if (!Array.isArray(value)) return value;
    const mapped: string[] = [];
    for (const term of value) {
      if (typeof term !== "string" || !term.trim() || term.length > 200) {
        issues.push({ code: "invalid-field", field, blocking: true });
        continue;
      }
      const result = resolve(term.trim());
      if (result.ids.length === 1) mapped.push(result.ids[0]);
      else {
        unmapped.add(term.trim());
        issues.push({
          code: result.ids.length ? "ambiguous-skill" : "unmapped-skill",
          field,
          blocking: true,
        });
      }
    }
    return [...new Set(mapped)];
  }
  function normal(field: string, value: unknown): unknown {
    if (field === "salary")
      return salary(object(value) && object(base.salary) ? { ...base.salary, ...value } : value);
    if (["officialMinutes", "editorialMinutes"].includes(field)) return durationMinutes(value);
    if (["skills", "prerequisiteSkills"].includes(field)) return mapSkills(value, field);
    if (field === "requirements" && Array.isArray(value))
      return value.map((requirement, index) =>
        object(requirement)
          ? {
              ...requirement,
              text: clean(requirement.text),
              priority: enumValue(requirement.priority, ["mandatory", "preferred"]),
              skills: mapSkills(requirement.skills, `requirements.${index}.skills`),
            }
          : requirement,
      );
    if (field === "responsibilities" && Array.isArray(value)) return value.map(clean);
    if (field === "conditions") {
      const previous = object(base.conditions)
        ? base.conditions
        : { workAuthorization: null, education: null, experienceYears: null };
      if (value === null)
        return { workAuthorization: null, education: null, experienceYears: null };
      if (object(value))
        return Object.fromEntries(
          Object.entries({ ...previous, ...value }).map(([key, item]) => [
            key,
            key === "experienceYears" ? numeric(item) : clean(item),
          ]),
        );
    }
    if (field === "practice" && object(value)) {
      const previous = object(base.practice) ? base.practice : {};
      return Object.fromEntries(
        Object.entries({ ...previous, ...value }).map(([key, item]) => [
          key,
          key === "minutes" ? durationMinutes(item) : clean(item),
        ]),
      );
    }
    if (field === "workplace") return enumValue(value, workplaces);
    if (field === "level") return enumValue(value, jobLevels);
    if (field === "difficulty")
      return enumValue(value, ["Beginner", "Intermediate", "Advanced", "Unknown"]);
    return clean(value);
  }
  for (const [field, value] of Object.entries(row.fields)) candidate[field] = normal(field, value);
  if (source.kind === "courses") candidate.url = row.url;
  // Missing nested values remain missing in the JSON preview, rather than turning
  // one invalid record into a batch-level serialization failure.
  const jsonCandidate = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  for (const key of Object.keys(candidate)) delete candidate[key];
  Object.assign(candidate, jsonCandidate);
  const changes: NormalizedRow["changes"] = [];
  if (source.kind === "jobs" && binding && binding.url !== row.url)
    changes.push({ field: "sourceUrl", operation: "set", before: binding.url, after: row.url });
  for (const field of [...Object.keys(row.fields), ...(source.kind === "courses" ? ["url"] : [])]) {
    if (JSON.stringify(base[field]) !== JSON.stringify(candidate[field]))
      changes.push({
        field,
        operation: row.fields[field] === null ? "clear" : "set",
        before: own(base, field) ? base[field] : null,
        after: candidate[field],
      });
  }
  if (row.state === "active") {
    const parsed = (source.kind === "jobs" ? jobDraftSchema : courseDraftSchema).safeParse(
      candidate,
    );
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        issues.push({
          code: Object.hasOwn(candidate, String(issue.path[0]))
            ? "invalid-field"
            : "required-field",
          field: issue.path.map(String).join(".").slice(0, 200),
          blocking: true,
        });
  }
  const matches =
    context.matches.find((item) => item.externalId === row.externalId)?.candidates ?? [];
  if (!existing && matches.length)
    issues.push({ code: "cross-source-match", field: "identity", blocking: true });
  if (row.state === "closed")
    issues.push({ code: "explicit-closure", field: "state", blocking: false });
  if (existing && row.state === "active" && !changes.length && !issues.length)
    issues.push({ code: "unchanged", field: "record", blocking: false });
  return {
    position: row.position,
    externalId: row.externalId,
    url: row.url,
    state: row.state,
    targetId: existing?.id ?? null,
    targetVersionId: existing?.versionId ?? null,
    targetRevision: existing?.revision ?? null,
    sourceFields: structuredClone(row.fields),
    candidate,
    changes,
    issues: issues.slice(0, 100),
    unmappedSkills: [...unmapped].slice(0, 200),
    candidateIds: matches.map((match) => match.id),
    disposition:
      row.state === "closed"
        ? "closure"
        : existing && !changes.length && !issues.some((issue) => issue.blocking)
          ? "unchanged"
          : "pending-review",
  };
}
export function planImport(
  input: SanitizedImport,
  context: ImportContext,
  keys: ImportKeyFactory,
): ImportOutput {
  boundedObject(input);
  boundedObject(context, ingestionLimits.contextBytes);
  if (
    !sanitizedImportSchema.safeParse(input).success ||
    !importContextSchema.safeParse(context).success
  )
    throw new ImportFailure("invalid-context");
  if (context.source.status !== "active") throw new ImportFailure("revoked-source");
  if (
    new Set(context.existing.map((item) => item.externalId)).size !== context.existing.length ||
    new Set(context.matches.map((item) => item.externalId)).size !== context.matches.length
  )
    throw new ImportFailure("invalid-context");
  const positions = [...input.rows, ...input.rejected].map((row) => row.position);
  if (
    new Set(positions).size !== input.total ||
    positions.some((position) => position > input.total)
  )
    throw new ImportFailure("invalid-context");
  if (input.rows.length) {
    const checked = sanitizeImport(
      JSON.stringify({
        records: input.rows.map(({ externalId, url, state, fields }) => ({
          externalId,
          url,
          state,
          fields,
        })),
      }),
      "json",
      context.source,
    );
    if (
      checked.rejected.length ||
      checked.rows.some(
        (row, index) =>
          row.url !== input.rows[index].url || row.externalId !== input.rows[index].externalId,
      )
    )
      throw new ImportFailure("invalid-context");
  }
  const rows = input.rows.map((row) => normalizeRow(row, context, keys));
  const output = importOutputSchema.parse({
    recipe: "import-normalize-v1",
    sourceFingerprint: context.source.fingerprint,
    dictionaryVersion: context.dictionary.version,
    total: input.total,
    rows,
    rejected: input.rejected,
  });
  boundedObject(output, ingestionLimits.outputBytes);
  return output;
}
