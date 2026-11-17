import { createHash } from "node:crypto";
import type { ImportKeyFactory } from "../normalizer";
/** Stable across batch IDs, bounded for both producer key contracts. */
export class Sha256ImportKey implements ImportKeyFactory {
  key(source: Parameters<ImportKeyFactory["key"]>[0], externalId: string) {
    return `import-${createHash("sha256")
      .update(JSON.stringify([source.kind, source.id, externalId]))
      .digest("hex")}`;
  }
}

export class Sha256ImportDigest {
  sha256(text: string) {
    return createHash("sha256").update(text).digest("hex");
  }
}
