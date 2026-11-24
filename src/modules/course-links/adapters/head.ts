import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPublicAddress, type PublicAddress } from "../../platform/public-network";
import type { CourseLinkProbe } from "../ports";
import type { LinkResult, LinkTarget } from "../model";
export interface HeadResponse {
  status: number;
  location?: string;
  retryAfter?: string;
}
export interface HeadNetwork {
  resolve(host: string, signal: AbortSignal): Promise<PublicAddress[]>;
  head(url: URL, address: PublicAddress, signal: AbortSignal): Promise<HeadResponse>;
  now(): number;
}
export function allowedCourseLink(raw: string, hosts: readonly string[]) {
  if (!/^https:\/\//i.test(raw) || /[\\\s\u0000-\u001f\u007f]/u.test(raw) || raw.length > 2048)
    throw Error("Blocked course link");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.search ||
    !hosts.includes(url.hostname) ||
    isIP(url.hostname) ||
    url.hostname.startsWith("[") ||
    url.hostname.endsWith(".") ||
    !url.hostname.includes(".") ||
    /\.(?:local|localhost|internal|lan|home|onion)$/.test(url.hostname)
  )
    throw Error("Blocked course link");
  return url;
}
async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () => reject(Error("Course link stopped"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
/** HEAD only: no cookie/auth header, no body read, no unpinned second DNS lookup. */
export function pinnedHttpsHead(
  url: URL,
  address: PublicAddress,
  signal: AbortSignal,
): Promise<HeadResponse> {
  allowedCourseLink(url.href, [url.hostname]);
  if (!isPublicAddress(address)) return Promise.reject(Error("Blocked course address"));
  return new Promise((resolve, reject) => {
    const pinned: LookupFunction = (_host, options, callback) => {
      if (options.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    };
    const req = request(
      url,
      {
        method: "HEAD",
        agent: false,
        family: address.family,
        lookup: pinned,
        servername: url.hostname,
        rejectUnauthorized: true,
        maxHeaderSize: 8192,
        signal,
        headers: { "User-Agent": "RoleFoundry-CourseLinkCheck/1", "Accept-Encoding": "identity" },
      },
      (response) => {
        const scalar = (key: string) =>
          typeof response.headers[key] === "string" ? (response.headers[key] as string) : undefined;
        const result = {
          status: response.statusCode ?? 0,
          location: scalar("location"),
          retryAfter: scalar("retry-after"),
        };
        response.destroy();
        resolve(result);
      },
    );
    req.on("error", () => reject(Error("Course HEAD unavailable")));
    req.setTimeout(5000, () => req.destroy(Error("Course HEAD deadline")));
    req.end();
  });
}
export const nodeHeadNetwork: HeadNetwork = {
  resolve: async (host) =>
    (await lookup(host, { all: true, verbatim: true })).map((value) => ({
      address: value.address,
      family: value.family as 4 | 6,
    })),
  head: pinnedHttpsHead,
  now: () => Date.now(),
};
function providerWait(value: string | undefined, now: number) {
  if (!value) return { notBefore: null, manualPause: false };
  const date = /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  // Unrepresentable advertised waits require operator review; never silently retry early.
  if (!Number.isFinite(date) || date > 253402300799000)
    return { notBefore: null, manualPause: true };
  return { notBefore: new Date(Math.max(now, date)).toISOString(), manualPause: false };
}
export class SafeCourseLinkProbe implements CourseLinkProbe {
  constructor(
    private readonly network: HeadNetwork = nodeHeadNetwork,
    private readonly deadlineMs = 10000,
  ) {
    if (!Number.isInteger(deadlineMs) || deadlineMs < 10 || deadlineMs > 10000)
      throw Error("Invalid course probe deadline");
  }
  async check(
    target: Pick<LinkTarget, "url" | "allowedHosts">,
    outer: AbortSignal,
  ): Promise<LinkResult> {
    const controller = new AbortController(),
      signal = AbortSignal.any([outer, controller.signal]);
    const timer = setTimeout(() => controller.abort(), this.deadlineMs);
    const result = (
      reason: LinkResult["reason"],
      httpStatus: number | null = null,
      wait = { notBefore: null as string | null, manualPause: false },
    ): LinkResult => ({ reason, httpStatus, ...wait });
    try {
      let url: URL;
      try {
        url = allowedCourseLink(target.url, target.allowedHosts);
      } catch {
        return result("blocked");
      }
      const visited = new Set<string>();
      for (let redirects = 0; ; redirects++) {
        signal.throwIfAborted();
        if (visited.has(url.href)) return result("redirect");
        visited.add(url.href);
        const addresses = await bounded(this.network.resolve(url.hostname, signal), signal);
        if (
          !addresses.length ||
          addresses.length > 64 ||
          addresses.some((address) => !isPublicAddress(address))
        )
          return result("blocked");
        const response = await bounded(this.network.head(url, addresses[0], signal), signal);
        signal.throwIfAborted();
        const status = response.status;
        if (!Number.isInteger(status) || status < 100 || status > 599)
          return result("invalid-response");
        if ([301, 302, 303, 307, 308].includes(status)) {
          if (redirects >= 3 || !response.location) return result("redirect", status);
          try {
            url = allowedCourseLink(new URL(response.location, url).href, target.allowedHosts);
          } catch {
            return result("blocked", status);
          }
          continue;
        }
        if (status >= 200 && status < 300) return result("ok", status);
        if (status === 404 || status === 410) return result("not-found", status);
        if (status === 405 || status === 501) return result("unsupported", status);
        if (status === 401 || status === 403) return result("access-denied", status);
        if (status === 429 || status >= 500)
          return result(
            status === 429 ? "rate-limit" : "server-error",
            status,
            providerWait(response.retryAfter, this.network.now()),
          );
        return result("http-error", status);
      }
    } catch {
      return result(signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
  }
}
