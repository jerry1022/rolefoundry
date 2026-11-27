import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm, symlink, link, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseDeletionLedger,
  readDeletionLedger,
} from "../../scripts/recovery/deletion-ledger.mjs";
const entry = {
  requestId: "10000000-0000-4000-a000-000000000001",
  subjectId: "20000000-0000-4000-a000-000000000002",
  requestedAt: "2026-11-23T00:00:00.123456Z",
  completedAt: null,
};
const ledger = () => ({
  version: 1,
  exportedAt: "2026-11-23T01:00:00.000Z",
  entries: [{ ...entry }],
});
test("retains microsecond timestamps and accepts empty and legacy millisecond ledgers", () => {
  assert.deepEqual(parseDeletionLedger(JSON.stringify(ledger())), ledger());
  const value = ledger();
  value.entries[0].requestedAt = "2026-11-23T00:00:00.123Z";
  assert.deepEqual(parseDeletionLedger(JSON.stringify(value)), value);
  value.entries = [];
  assert.deepEqual(parseDeletionLedger(JSON.stringify(value)), value);
});
test("rejects duplicates, unknown fields, malformed identities, chronology and oversized inputs", () => {
  const variants = [
    null,
    [],
    {},
    { ...ledger(), version: 2 },
    { ...ledger(), entries: [{ ...entry, requestedAt: "2026-02-30T00:00:00Z" }] },
    { ...ledger(), extra: true },
    { ...ledger(), exportedAt: "infinity" },
    { ...ledger(), entries: [entry, entry] },
    { ...ledger(), entries: [{ ...entry, subjectId: "invalid" }] },
    { ...ledger(), entries: [{ ...entry, contact: "must not be accepted" }] },
    { ...ledger(), entries: [{ ...entry, completedAt: "2026-11-22T00:00:00Z" }] },
    { ...ledger(), entries: [{ ...entry, completedAt: "2026-11-24T00:00:00Z" }] },
    { ...ledger(), entries: Array(10001).fill(entry) },
  ];
  for (const value of variants)
    assert.throws(() => parseDeletionLedger(JSON.stringify(value)), /Invalid deletion ledger/);
  assert.throws(
    () => parseDeletionLedger(" ".repeat(8 * 1024 * 1024 + 1)),
    /Invalid deletion ledger/,
  );
  assert.throws(
    () => parseDeletionLedger('{"private":"do not echo"'),
    (error) => !error.message.includes("do not echo"),
  );
});
test("requires private owned regular files and directories; rejects links and public permissions", async () => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "rf-ledger-")));
  await chmod(directory, 0o700);
  const file = path.join(directory, "ledger.json");
  try {
    await writeFile(file, JSON.stringify(ledger()), { mode: 0o600 });
    assert.equal((await readDeletionLedger(file)).fileDigest.length, 64);
    await chmod(file, 0o644);
    await assert.rejects(readDeletionLedger(file));
    await chmod(file, 0o600);
    const symbolic = path.join(directory, "symbolic.json");
    await symlink(file, symbolic);
    await assert.rejects(readDeletionLedger(symbolic));
    const hard = path.join(directory, "hard.json");
    await link(file, hard);
    await assert.rejects(readDeletionLedger(file));
    await rm(hard);
    await chmod(directory, 0o755);
    await assert.rejects(readDeletionLedger(file));
    await chmod(directory, 0o700);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
