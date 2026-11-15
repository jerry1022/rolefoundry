import type { TaskKind, TaskLease, FailureCategory, WorkTask } from "./model";
export interface TaskRepository {
  find(id: string): Promise<WorkTask>;
}
export interface TaskQueue {
  read(
    workerId: string,
    kinds: TaskKind[],
    leaseSeconds: number,
    quantity: number,
  ): Promise<TaskLease[]>;
  heartbeat(lease: TaskLease): Promise<boolean>;
  acknowledge(lease: TaskLease): Promise<void>;
  fail(lease: TaskLease, category: FailureCategory): Promise<{ status: string }>;
  release(lease: TaskLease): Promise<boolean>;
}
export interface TaskHandler {
  execute(lease: TaskLease, signal: AbortSignal): Promise<void>;
}
export interface TaskLog {
  event: string;
  taskId?: string;
  code?: string;
}
