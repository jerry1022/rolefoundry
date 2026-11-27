import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TaskWorker } from "../../../src/modules/tasks/worker";
import { SupabaseTaskQueue } from "../../../src/modules/tasks/adapters/supabase";
import { SupabaseAssessmentGrader } from "../../../src/modules/assessment/adapters/supabase";
const config = z
  .object({
    url: z.url(),
    key: z.string().min(1),
    seconds: z.coerce.number().int().min(5).max(300),
    concurrency: z.coerce.number().int().min(1).max(8),
  })
  .safeParse({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    seconds: process.env.WORKER_LEASE_SECONDS || 30,
    concurrency: process.env.WORKER_CONCURRENCY || 2,
  });
if (!config.success)
  throw new Error("Worker configuration is missing or invalid; no credentials are printed.");
const target = new URL(config.data.url);
if (
  target.protocol !== "https:" &&
  !(target.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
)
  throw new Error("Worker URL must use HTTPS except for loopback.");
const client = createClient(config.data.url, config.data.key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(10_000),
        ]),
      }),
  },
});
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
const worker = new TaskWorker(
  new SupabaseTaskQueue(client),
  { "assessment.grade": new SupabaseAssessmentGrader(client) },
  {
    workerId: crypto.randomUUID(),
    leaseSeconds: config.data.seconds,
    concurrency: config.data.concurrency,
    log: (event) => console.log(JSON.stringify(event)),
  },
);
const once = process.argv.includes("--once"),
  drain = process.argv.includes("--drain");
let batches = 0;
while (!controller.signal.aborted) {
  try {
    const count = await worker.tick(controller.signal);
    batches++;
    if (once || (drain && (count === 0 || batches >= 100))) break;
    if (!count)
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 1000);
        controller.signal.addEventListener("abort", done, { once: true });
      });
  } catch {
    console.error(JSON.stringify({ event: "worker.unavailable", code: "RF_UNAVAILABLE" }));
    if (once || drain) {
      process.exitCode = 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
console.log(JSON.stringify({ event: "worker.stopped" }));
