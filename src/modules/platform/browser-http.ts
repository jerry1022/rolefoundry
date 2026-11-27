import { ApplicationError } from "./errors";
/** Shared browser transport; session cookies stay HttpOnly and provider SDKs stay server-side. */
export function createBrowserTransport(fetcher: typeof fetch = fetch) {
  return async (
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ) => {
    const response = await fetcher(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/v1/${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
      ...(options.body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new ApplicationError(
        result.error?.code || "RF_UNAVAILABLE",
        response.status,
        result.error?.message || "The service is temporarily unavailable.",
      );
    return result;
  };
}
