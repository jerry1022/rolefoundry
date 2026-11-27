import type { Actor } from "../identity/core";
import type {
  OperationsSummary,
  OperationsTask,
  OperationsTaskPage,
  OperationsEventPage,
  OperationsWorkers,
  OperationsQuery,
} from "./model";
export interface OperationsAuthorization {
  authorize(actor: Actor, action: string): Promise<void>;
}
export interface OperationsReadStore {
  summary(): Promise<OperationsSummary>;
  tasks(query: OperationsQuery): Promise<OperationsTaskPage>;
  task(id: string): Promise<OperationsTask>;
  events(id: string, cursor?: string): Promise<OperationsEventPage>;
  workers(): Promise<OperationsWorkers>;
}
export type OperationsClient = OperationsReadStore;
