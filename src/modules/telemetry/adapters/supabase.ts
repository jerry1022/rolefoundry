import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { httpObservationSchema, telemetrySnapshotSchema, type HttpObservation } from "../model";
import type { TelemetryStore } from "../ports";
export class SupabaseTelemetryStore implements TelemetryStore {
  constructor(private readonly client: SupabaseClient) {}
  async recordHttp(observation: HttpObservation, signal: AbortSignal) {
    const input = httpObservationSchema.parse(observation);
    const { error } = await this.client
      .rpc("telemetry_record_http", {
        p_family: input.family,
        p_method: input.method,
        p_status: input.status,
        p_duration_ms: input.durationMs,
      })
      .abortSignal(signal);
    if (error) throw Error("Telemetry write is unavailable");
  }
  async snapshot(signal: AbortSignal) {
    const { data, error } = await this.client
      .rpc("telemetry_snapshot")
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    if (error) throw Error("Telemetry snapshot is unavailable");
    return telemetrySnapshotSchema.parse(data);
  }
}
