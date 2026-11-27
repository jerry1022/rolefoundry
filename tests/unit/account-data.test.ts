import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { unzip } from "../support/account-archive";
import { ZipAccountArchive } from "../../src/modules/account-data/adapters/archive";
import { AccountExportHandler } from "../../src/modules/account-data/handler";
import type { ExportPayload } from "../../src/modules/account-data/model";
import type { TaskLease } from "../../src/modules/tasks/model";
vi.mock("server-only", () => ({}));
const id = () => crypto.randomUUID(),
  hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function payload(): ExportPayload {
  const owner = id(),
    doc = id(),
    bytes = Buffer.from("owned original");
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: {
      id: owner,
      email: "owned@test.invalid",
      createdAt: new Date().toISOString(),
      lastSignInAt: null,
      role: "member",
    },
    data: { preferences: [{ name: "Private name" }] },
    files: [
      {
        key: `${owner}/${doc}/source/${id()}`,
        path: `files/${doc}/source.pdf`,
        sha256: hash(bytes),
        byteCount: bytes.length,
      },
    ],
  };
}
it("round-trips exact original bytes and exports a location-free manifest", async () => {
  const p = payload(),
    archive = new ZipAccountArchive();
  const output = await archive.build(
    p,
    async () => Buffer.from("owned original"),
    new AbortController().signal,
  );
  const files = await unzip(output.bytes),
    manifest = JSON.parse(files["account.json"].toString());
  expect(files[p.files[0].path].toString()).toBe("owned original");
  expect(manifest.data).toEqual(p.data);
  expect(manifest.files[0]).not.toHaveProperty("key");
  expect(archive.verify(output.bytes, output.sha256)).toBe(true);
  output.bytes[0] ^= 1;
  expect(archive.verify(output.bytes, output.sha256)).toBe(false);
});
it("rejects mismatched bytes, foreign owner keys and duplicate archive paths", async () => {
  const archive = new ZipAccountArchive(),
    p = payload();
  await expect(
    archive.build(p, async () => Buffer.from("changed"), new AbortController().signal),
  ).rejects.toMatchObject({ category: "validation" });
  await expect(
    archive.build(
      { ...p, files: [{ ...p.files[0], key: `${id()}/foreign` }] },
      async () => Buffer.from("owned original"),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ category: "validation" });
  await expect(
    archive.build(
      { ...p, files: [p.files[0], p.files[0]] },
      async () => Buffer.from("owned original"),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ category: "validation" });
});
it("aborts before publication when cancellation happens during archive construction", async () => {
  const controller = new AbortController(),
    publish = vi.fn(),
    prepare = vi.fn(),
    lease: TaskLease = {
      taskId: id(),
      messageId: "1",
      kind: "account.export",
      token: id(),
      leaseSeconds: 30,
    };
  const archive = new ZipAccountArchive();
  const handler = new AccountExportHandler(
    { load: async () => payload(), prepare, publish },
    {
      source: async () => {
        controller.abort();
        return Buffer.from("owned original");
      },
      get: vi.fn(),
      put: vi.fn(),
      remove: vi.fn(),
    },
    archive,
  );
  await expect(handler.execute(lease, controller.signal)).rejects.toThrow();
  expect(prepare).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
