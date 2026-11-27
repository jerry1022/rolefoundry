import type { HttpObservation, TelemetrySnapshot } from "./model";
export interface TelemetryStore {
  recordHttp(observation: HttpObservation, signal: AbortSignal): Promise<void>;
  snapshot(signal: AbortSignal): Promise<TelemetrySnapshot>;
}
export interface ObservationRuntime {
  now(): number;
  requestId(): string;
  schedule(work: () => Promise<void>): void;
  log(event: Record<string, string | number>): void;
}
