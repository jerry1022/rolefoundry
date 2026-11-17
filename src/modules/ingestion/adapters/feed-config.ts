import "server-only";
import { StaticFeedRegistry } from "./safe-feed";
/** Exact URLs stay deployment-owned and are never accepted from a browser request. */
export function deploymentFeedRegistry(raw = process.env.ROLEFOUNDRY_APPROVED_FEEDS) {
  try {
    if (raw && Buffer.byteLength(raw) > 65536) throw Error();
    return new StaticFeedRegistry(raw ? JSON.parse(raw) : []);
  } catch {
    throw new Error("Approved feed configuration is invalid; no URLs or credentials are printed.");
  }
}
