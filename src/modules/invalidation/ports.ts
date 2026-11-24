import type { InvalidationLease, InvalidationResult } from "./model";
export interface InvalidationStore {
  claim(signal: AbortSignal): Promise<InvalidationLease[]>;
  apply(lease: InvalidationLease, signal: AbortSignal): Promise<InvalidationResult>;
  retry(lease: InvalidationLease, signal: AbortSignal): Promise<void>;
}
