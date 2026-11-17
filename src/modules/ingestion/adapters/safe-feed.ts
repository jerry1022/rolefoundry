import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { setTimeout as wait } from "node:timers/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { FeedFailure, ingestionLimits, importKindSchema, importFormatSchema } from "../model";
import type { ApprovedFeed, FeedRegistry, FeedReader } from "../ports";
export interface PublicAddress {
  address: string;
  family: 4 | 6;
}
export interface FeedResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
}
export interface FeedNetwork {
  resolve(host: string, signal: AbortSignal): Promise<PublicAddress[]>;
  get(url: URL, address: PublicAddress, signal: AbortSignal): Promise<FeedResponse>;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
  now(): number;
}
const blocked4 = new BlockList(),
  blocked6 = new BlockList(),
  global6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(address, prefix, "ipv4");
global6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(value: PublicAddress) {
  if (value.address.includes("%") || isIP(value.address) !== value.family) return false;
  return value.family === 4
    ? !blocked4.check(value.address, "ipv4")
    : global6.check(value.address, "ipv6") && !blocked6.check(value.address, "ipv6");
}
export function allowedFeedUrl(raw: string, allowedHosts: readonly string[]): URL {
  try {
    if (!/^https:\/\//i.test(raw) || /[\\\s\u0000-\u001f\u007f]/u.test(raw) || raw.length > 2048)
      throw Error();
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !allowedHosts.includes(url.hostname) ||
      url.hostname.endsWith(".") ||
      isIP(url.hostname) ||
      url.hostname.startsWith("[") ||
      !url.hostname.includes(".") ||
      /\.(?:local|localhost|internal|lan|home|onion)$/.test(url.hostname)
    )
      throw Error();
    return url;
  } catch {
    throw new FeedFailure("blocked");
  }
}
const definitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
    kind: importKindSchema,
    format: importFormatSchema,
    url: z.string().max(2048),
    allowedHosts: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/))
      .min(1)
      .max(10),
  })
  .strict();
/** Construct only from deployment-owned configuration, not any administrator request. */
export class StaticFeedRegistry implements FeedRegistry {
  private readonly feeds: Map<string, ApprovedFeed>;
  constructor(definitions: unknown) {
    const parsed = z.array(definitionSchema).max(50).safeParse(definitions);
    if (!parsed.success) throw new FeedFailure("blocked");
    this.feeds = new Map();
    for (const value of parsed.data) {
      allowedFeedUrl(value.url, value.allowedHosts);
      if (this.feeds.has(value.id)) throw new FeedFailure("blocked");
      this.feeds.set(
        value.id,
        Object.freeze({
          ...value,
          allowedHosts: Object.freeze([...value.allowedHosts]),
          revision: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
        }),
      );
    }
  }
  find(id: string, kind: Parameters<FeedRegistry["find"]>[1]) {
    const feed = this.feeds.get(id);
    return feed?.kind === kind ? feed : null;
  }
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new FeedFailure("timeout"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
/** The validated address is passed to the actual socket lookup; it is not checked then re-resolved. */
export function pinnedHttpsGet(
  url: URL,
  address: PublicAddress,
  signal: AbortSignal,
): Promise<FeedResponse> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !isPublicAddress(address)
  )
    return Promise.reject(new FeedFailure("blocked"));
  return new Promise((resolve, reject) => {
    const pinned: LookupFunction = (_host, options, callback) => {
      if (options.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    };
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        family: address.family,
        lookup: pinned,
        servername: url.hostname,
        rejectUnauthorized: true,
        maxHeaderSize: 16384,
        signal,
        headers: {
          Accept: "application/json, text/csv;q=0.9",
          "Accept-Encoding": "identity",
          "User-Agent": "RoleFoundry-AuthorizedFeed/1",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0,
          headers: FeedResponse["headers"] = {};
        for (const key of ["location", "content-type", "content-encoding", "retry-after"]) {
          const value = response.headers[key];
          headers[key] = typeof value === "string" ? value : undefined;
        }
        if (status !== 200) {
          response.destroy();
          resolve({ status, headers, body: new Uint8Array() });
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > ingestionLimits.bytes) {
            response.destroy(new FeedFailure("too-large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks) }));
        response.on("error", (error) =>
          reject(
            error instanceof FeedFailure
              ? error
              : new FeedFailure(signal.aborted ? "timeout" : "network"),
          ),
        );
      },
    );
    req.on("error", (error) =>
      reject(
        error instanceof FeedFailure
          ? error
          : new FeedFailure(signal.aborted ? "timeout" : "network"),
      ),
    );
    req.setTimeout(5000, () => req.destroy(new FeedFailure("timeout")));
    req.end();
  });
}
export const nodeFeedNetwork: FeedNetwork = {
  resolve: async (host, signal) => {
    const values = await abortable(lookup(host, { all: true, verbatim: true }), signal);
    return values.map((value) => ({ address: value.address, family: value.family as 4 | 6 }));
  },
  get: pinnedHttpsGet,
  sleep: async (milliseconds, signal) => {
    await wait(milliseconds, undefined, { signal });
  },
  now: () => Date.now(),
};
function retryAfter(value: string | undefined, now: number): { seconds?: number; manual: boolean } {
  if (!value) return { manual: false };
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  if (!Number.isFinite(seconds)) return { manual: /^\d+$/.test(value) };
  return { seconds: Math.max(0, seconds), manual: seconds > 86400 };
}
export class SafeFeedReader implements FeedReader {
  constructor(private readonly network: FeedNetwork = nodeFeedNetwork) {}
  async read(feed: ApprovedFeed, outer: AbortSignal): Promise<string> {
    const signal = AbortSignal.any([outer, AbortSignal.timeout(ingestionLimits.fetchDeadlineMs)]),
      started = this.network.now();
    let last: FeedFailure = new FeedFailure("network");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal.aborted) throw new FeedFailure("timeout");
      let url = allowedFeedUrl(feed.url, feed.allowedHosts);
      try {
        const visited = new Set<string>();
        for (let redirects = 0; ; redirects++) {
          if (visited.has(url.href)) throw new FeedFailure("redirect");
          visited.add(url.href);
          const addresses = await abortable(this.network.resolve(url.hostname, signal), signal);
          if (
            !addresses.length ||
            addresses.length > 64 ||
            addresses.some((address) => !isPublicAddress(address))
          )
            throw new FeedFailure("blocked");
          const response = await abortable(this.network.get(url, addresses[0], signal), signal);
          signal.throwIfAborted();
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (redirects >= ingestionLimits.redirects || !response.headers.location)
              throw new FeedFailure("redirect");
            let next: string;
            try {
              next = new URL(response.headers.location, url).href;
            } catch {
              throw new FeedFailure("redirect");
            }
            url = allowedFeedUrl(next, feed.allowedHosts);
            continue;
          }
          if (response.status === 429) {
            const retry = retryAfter(response.headers["retry-after"], this.network.now());
            throw new FeedFailure("rate-limit", retry.seconds, retry.manual);
          }
          if (response.status >= 500 && response.status <= 599) {
            const retry = retryAfter(response.headers["retry-after"], this.network.now());
            throw new FeedFailure("network", retry.seconds, retry.manual);
          }
          if (response.status !== 200) throw new FeedFailure("http-error");
          const type = response.headers["content-type"]?.split(";")[0].trim().toLowerCase(),
            encoding = response.headers["content-encoding"];
          if (
            (feed.format === "json"
              ? !(
                  type === "application/json" ||
                  /^application\/[a-z0-9.+-]+\+json$/.test(type ?? "")
                )
              : !["text/csv", "application/csv"].includes(type ?? "")) ||
            (encoding && encoding.toLowerCase() !== "identity")
          )
            throw new FeedFailure("media-type");
          if (response.body.length > ingestionLimits.bytes) throw new FeedFailure("too-large");
          try {
            return new TextDecoder("utf-8", { fatal: true }).decode(response.body);
          } catch {
            throw new FeedFailure("media-type");
          }
        }
      } catch (error) {
        if (signal.aborted) throw new FeedFailure("timeout");
        last = error instanceof FeedFailure ? error : new FeedFailure("network");
        if (
          last.requiresManualRetry ||
          !["network", "timeout", "rate-limit"].includes(last.code) ||
          attempt === 2
        )
          throw last;
        const delay = Math.max(1000 * 2 ** attempt, (last.retryAfterSeconds ?? 0) * 1000);
        if (delay > 5000 || this.network.now() - started + delay >= ingestionLimits.fetchDeadlineMs)
          throw last;
        try {
          await this.network.sleep(delay, signal);
        } catch {
          throw new FeedFailure("timeout");
        }
      }
    }
    throw last;
  }
}
