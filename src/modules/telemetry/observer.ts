import { httpMethods, httpObservationSchema, type ApiFamily } from "./model";
import type { ObservationRuntime, TelemetryStore } from "./ports";
/** Captures fixed categories only; request bodies, URLs, cookies and error objects never enter a port. */
export class HttpObserver {
  constructor(
    private readonly store: Pick<TelemetryStore, "recordHttp">,
    private readonly runtime: ObservationRuntime,
    private readonly timeoutMs = 1000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 2000)
      throw Error("Invalid observation deadline");
  }
  async observe(family: ApiFamily, method: string, work: () => Promise<Response>) {
    let started: number, requestId: string;
    try {
      started = this.runtime.now();
      requestId = this.runtime.requestId();
    } catch {
      return work();
    }
    let status = 500;
    try {
      const response = await work();
      status = response.status >= 100 && response.status <= 599 ? response.status : 500;
      const candidate = response.headers.get("x-request-id");
      if (
        candidate &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
      )
        requestId = candidate;
      return response;
    } finally {
      try {
        const observation = httpObservationSchema.parse({
          family,
          method: (httpMethods as readonly string[]).includes(method) ? method : "OTHER",
          status,
          durationMs: Math.min(300000, Math.max(0, Math.round(this.runtime.now() - started))),
        });
        this.runtime.schedule(async () => {
          try {
            this.runtime.log({
              event: "api.request",
              version: 1,
              module: observation.family,
              method: observation.method,
              status: observation.status,
              latencyMs: observation.durationMs,
              requestId,
            });
          } catch {
            /* Log transport cannot change the operation. */
          }
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              this.store.recordHttp(observation, controller.signal),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  controller.abort();
                  reject(Error("Observation deadline"));
                }, this.timeoutMs);
              }),
            ]);
          } catch {
            try {
              this.runtime.log({ event: "telemetry.unavailable", code: "RF_UNAVAILABLE" });
            } catch {
              /* Failure-isolated diagnostics. */
            }
          } finally {
            if (timer) clearTimeout(timer);
          }
        });
      } catch {
        /* Scheduling/validation failure must preserve the original response or exception. */
      }
    }
  }
}
