import type { LocalFixtures } from "./local-fixtures";
import type { TaskKind, TaskLease } from "../../src/modules/tasks/model";

/** Leases exactly the given task, releasing anything else this read happened to claim. */
export async function leaseTask(
  stack: LocalFixtures,
  taskId: string,
  kind: TaskKind,
): Promise<TaskLease> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await stack.privileged.rpc("task_read", {
      p_worker: crypto.randomUUID(),
      p_kinds: [kind],
      p_seconds: 30,
      p_quantity: 8,
    });
    if (result.error) throw Error(result.error.message);
    const leases = result.data as { taskId: string; token: string; messageId: string | number }[];
    for (const other of leases.filter((value) => value.taskId !== taskId))
      await stack.privileged.rpc("task_release", { p_task: other.taskId, p_token: other.token });
    const selected = leases.find((value) => value.taskId === taskId);
    if (selected)
      return {
        taskId: selected.taskId,
        token: selected.token,
        messageId: String(selected.messageId),
        kind,
        leaseSeconds: 30,
      };
  }
  throw Error(`Owned ${kind} task was not visible`);
}
