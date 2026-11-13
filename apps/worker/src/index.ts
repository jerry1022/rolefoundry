import { taskSchema, type Task } from "../../../src/lib/domain";

/** Dry-run executor only. No network, credentials, queue consumption or personal data. */
export function executeDemoTask(input: unknown): Task {
  const task = taskSchema.parse(input);
  if (task.status !== "queued") throw new Error("Only queued tasks can start");
  return { ...task, status: "succeeded", attempts: task.attempts + 1 };
}
const task = executeDemoTask({
  id: "demo-task",
  ownerId: "demo-user",
  kind: "matches.refresh",
  inputVersion: "fixture-v1",
  status: "queued",
  attempts: 0,
});
console.log(
  JSON.stringify(
    {
      mode: "dry-run",
      message: "Worker contract validated. Production queue adapter is not connected.",
      task,
    },
    null,
    2,
  ),
);
