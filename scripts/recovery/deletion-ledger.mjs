import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const limit = 8 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
function timestamp(value) {
  if (typeof value !== "string") return false;
  const match = value.match(iso);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month, 0);
  return day <= calendar.getUTCDate();
}
function keys(value, names) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === names.length &&
    names.every((name) => Object.hasOwn(value, name))
  );
}
export function parseDeletionLedger(raw) {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > limit) throw Error();
    const value = JSON.parse(raw);
    if (
      !keys(value, ["version", "exportedAt", "entries"]) ||
      value.version !== 1 ||
      !timestamp(value.exportedAt) ||
      !Array.isArray(value.entries) ||
      value.entries.length > 10000
    )
      throw Error();
    const requests = new Set(),
      subjects = new Set();
    for (const entry of value.entries) {
      if (
        !keys(entry, ["requestId", "subjectId", "requestedAt", "completedAt"]) ||
        typeof entry.requestId !== "string" ||
        !uuid.test(entry.requestId) ||
        typeof entry.subjectId !== "string" ||
        !uuid.test(entry.subjectId) ||
        !timestamp(entry.requestedAt) ||
        Date.parse(entry.requestedAt) > Date.parse(value.exportedAt) ||
        (entry.completedAt !== null &&
          (!timestamp(entry.completedAt) ||
            Date.parse(entry.completedAt) < Date.parse(entry.requestedAt) ||
            Date.parse(entry.completedAt) > Date.parse(value.exportedAt))) ||
        requests.has(entry.requestId) ||
        subjects.has(entry.subjectId)
      )
        throw Error();
      requests.add(entry.requestId);
      subjects.add(entry.subjectId);
    }
    return value;
  } catch {
    throw Error("Invalid deletion ledger; private contents are not printed.");
  }
}
export async function readDeletionLedger(filename) {
  let handle;
  try {
    const absolute = path.resolve(filename),
      directory = path.dirname(absolute);
    const info = await stat(directory);
    if ((await realpath(directory)) !== directory || !info.isDirectory() || info.mode & 0o077)
      throw Error();
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const file = await handle.stat();
    if (
      !file.isFile() ||
      file.nlink !== 1 ||
      file.mode & 0o077 ||
      file.uid !== process.getuid() ||
      file.size > limit
    )
      throw Error();
    const buffer = Buffer.alloc(limit + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!chunk.bytesRead) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > limit) throw Error();
    const ledger = parseDeletionLedger(buffer.subarray(0, bytesRead).toString("utf8"));
    return {
      ledger,
      fileDigest: createHash("sha256").update(buffer.subarray(0, bytesRead)).digest("hex"),
    };
  } catch {
    throw Error("Deletion ledger must be a valid private owned regular file without symlinks.");
  } finally {
    await handle?.close();
  }
}
export async function applyDeletionLedger(sql, runId, ledger) {
  parseDeletionLedger(JSON.stringify(ledger));
  const result = await sql.query(
    "select public.recovery_apply_deletion_ledger($1,$2::jsonb) result",
    [runId, JSON.stringify(ledger)],
  );
  return result.rows[0].result;
}
