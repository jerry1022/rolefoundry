import { z } from "zod";
import {
  ImportFailure,
  ingestionLimits,
  ingestionText,
  type ImportFormat,
  type ImportSource,
  type ImportRow,
  type SanitizedImport,
  type ImportIssue,
} from "./model";
import { parseCsv } from "./csv";
export const jobImportFields = [
  "company",
  "title",
  "track",
  "specialization",
  "location",
  "workplace",
  "level",
  "salary",
  "summary",
  "responsibilities",
  "requirements",
  "conditions",
  "expiresAt",
] as const;
export const courseImportFields = [
  "title",
  "summary",
  "skills",
  "prerequisiteSkills",
  "prerequisiteCourseIds",
  "language",
  "difficulty",
  "format",
  "officialMinutes",
  "editorialMinutes",
  "durationNote",
  "practice",
] as const;
const coursePermissions: Record<string, string> = {
  prerequisiteSkills: "prerequisites",
  prerequisiteCourseIds: "prerequisites",
  officialMinutes: "duration",
  editorialMinutes: "duration",
  durationNote: "duration",
};
const structured = new Set([
  "salary",
  "responsibilities",
  "requirements",
  "conditions",
  "skills",
  "prerequisiteSkills",
  "prerequisiteCourseIds",
  "practice",
]);
export function boundedObject(value: unknown, maximum = ingestionLimits.bytes) {
  let text: string;
  try {
    const encoded = JSON.stringify(value);
    if (typeof encoded !== "string") throw Error();
    text = encoded;
  } catch {
    throw new ImportFailure("invalid-envelope");
  }
  if (new TextEncoder().encode(text).length > maximum) throw new ImportFailure("too-large");
  const pending: [unknown, number][] = [[value, 0]];
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    if (depth > ingestionLimits.depth) throw new ImportFailure("invalid-envelope");
    if (
      typeof item === "string" &&
      (item.includes("\0") ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(item))
    )
      throw new ImportFailure("invalid-envelope");
    if (typeof item === "number" && !Number.isFinite(item))
      throw new ImportFailure("invalid-envelope");
    if (["undefined", "function", "bigint", "symbol"].includes(typeof item))
      throw new ImportFailure("invalid-envelope");
    if (item && typeof item === "object")
      for (const [key, child] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new ImportFailure("invalid-envelope");
        pending.push([child, depth + 1]);
      }
  }
}
export function normalizeSourceUrl(
  input: string,
  source: Pick<ImportSource, "allowedHosts" | "provider">,
): string | null {
  try {
    const text = input.trim();
    if (!/^https:\/\//i.test(text) || /[\\\s\u0000-\u001f\u007f]/u.test(text) || text.length > 2048)
      return null;
    const url = new URL(text);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !source.allowedHosts.includes(url.hostname) ||
      url.hostname.endsWith(".") ||
      !url.hostname.includes(".") ||
      /\.(?:local|localhost|internal|lan|home|onion|localdomain|home\.arpa)$/.test(url.hostname) ||
      url.hostname.startsWith("[") ||
      /^\d+(?:\.\d+)*$/.test(url.hostname)
    )
      return null;
    if (
      source.provider &&
      !source.provider.pathPrefixes.some(
        (prefix) => url.pathname.startsWith(prefix) && url.pathname.length > prefix.length,
      )
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^utm_/i.test(key) || ["gclid", "fbclid"].includes(key.toLowerCase()))
        url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}
function fromCsv(text: string, source: ImportSource): unknown[] {
  const matrix = parseCsv(text),
    headers = matrix.shift()!.map((value) => value.trim()),
    allowed = [
      "externalId",
      "url",
      "state",
      ...(source.kind === "jobs" ? jobImportFields : courseImportFields),
    ];
  if (
    new Set(headers).size !== headers.length ||
    !headers.includes("externalId") ||
    !headers.includes("url") ||
    headers.some((key) => !allowed.includes(key as never))
  )
    throw new ImportFailure("malformed-csv");
  return matrix.map((cells) => {
    if (cells.length !== headers.length) return null;
    const record: Record<string, unknown> = { state: "active", fields: {} },
      fields = record.fields as Record<string, unknown>;
    for (let index = 0; index < headers.length; index++) {
      const key = headers[index],
        cell = cells[index];
      if (["externalId", "url", "state"].includes(key)) {
        if (key !== "state" || cell.trim()) record[key] = cell;
        continue;
      }
      if (cell === "") continue; // Empty is absent; literal null explicitly clears a value.
      try {
        fields[key] =
          cell === "null"
            ? null
            : key === "salary" && /^(?:undisclosed|not disclosed|面議|未提供)$/i.test(cell.trim())
              ? cell
              : structured.has(key)
                ? JSON.parse(cell)
                : cell;
      } catch {
        return { invalidCell: true };
      }
    }
    return record;
  });
}
export function sanitizeImport(
  content: string,
  format: ImportFormat,
  source: ImportSource,
): SanitizedImport {
  if (source.status !== "active") throw new ImportFailure("revoked-source");
  if (new TextEncoder().encode(content).length > ingestionLimits.bytes)
    throw new ImportFailure("too-large");
  if (content.includes("\0")) throw new ImportFailure("invalid-envelope");
  const text = content.replace(/^\uFEFF/, "");
  let raw: unknown[];
  if (format === "csv") raw = fromCsv(text, source);
  else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImportFailure("malformed-json");
    }
    boundedObject(parsed);
    const envelope = z
      .object({ records: z.array(z.unknown()).max(ingestionLimits.rows) })
      .strict()
      .safeParse(parsed);
    if (!envelope.success) throw new ImportFailure("invalid-envelope");
    raw = envelope.data.records;
  }
  if (raw.length > ingestionLimits.rows) throw new ImportFailure("invalid-envelope");
  const rows: ImportRow[] = [],
    rejected: SanitizedImport["rejected"] = [],
    seen = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const position = index + 1,
      record = z
        .object({
          externalId: ingestionText(200),
          url: z.string(),
          state: z.enum(["active", "closed"]).default("active"),
          fields: z.record(z.string(), z.unknown()),
        })
        .strict()
        .safeParse(item);
    if (!record.success) {
      rejected.push({
        position,
        externalId: null,
        issues: [{ code: "invalid-record", field: "record", blocking: true }],
      });
      continue;
    }
    const { externalId, state, fields } = record.data,
      issues: ImportIssue[] = [];
    try {
      boundedObject(fields, ingestionLimits.rowBytes);
    } catch {
      rejected.push({
        position,
        externalId,
        issues: [{ code: "invalid-record", field: "record", blocking: true }],
      });
      continue;
    }
    const url = normalizeSourceUrl(record.data.url, source);
    if (!url) issues.push({ code: "invalid-url", field: "url", blocking: true });
    if (seen.has(externalId))
      issues.push({ code: "duplicate-external-id", field: "externalId", blocking: true });
    else seen.add(externalId);
    if (state === "closed" && !source.allowClosure)
      issues.push({ code: "closure-not-permitted", field: "state", blocking: true });
    const allowed: readonly string[] =
      source.kind === "jobs" ? jobImportFields : courseImportFields;
    for (const key of Object.keys(fields)) {
      const permission = source.kind === "courses" ? (coursePermissions[key] ?? key) : key;
      if (
        !allowed.includes(key) ||
        !(key === "expiresAt" ? source.allowClosure : source.permittedFields.includes(permission))
      )
        issues.push({
          code: "forbidden-field",
          field: allowed.includes(key) ? key : "unknown",
          blocking: true,
        });
    }
    if (issues.length) {
      rejected.push({ position, externalId, issues: issues.slice(0, 30) });
      continue;
    }
    rows.push({ position, externalId, url: url!, state, fields });
  }
  return { rows, rejected, total: raw.length };
}
