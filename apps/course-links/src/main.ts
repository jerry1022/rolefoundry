import { createClient } from "@supabase/supabase-js";
import { CourseLinkChecker } from "../../../src/modules/course-links/service";
import { linkPolicySchema } from "../../../src/modules/course-links/model";
import { SafeCourseLinkProbe } from "../../../src/modules/course-links/adapters/head";
import { SupabaseCourseLinkStore } from "../../../src/modules/course-links/adapters/supabase";
let policies;
try {
  const raw = process.env.ROLEFOUNDRY_COURSE_LINK_SOURCES || "[]";
  if (Buffer.byteLength(raw) > 32768) throw Error();
  policies = linkPolicySchema.array().max(20).parse(JSON.parse(raw));
  if (new Set(policies.map((p) => p.sourceId)).size !== policies.length) throw Error();
} catch {
  throw Error("Course link policy is invalid; no configuration is printed.");
}
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error("Course link storage configuration is missing.");
let target;
try {
  target = new URL(url);
} catch {
  throw Error("Course link storage URL is invalid.");
}
if (
  target.username ||
  target.password ||
  target.search ||
  target.hash ||
  (target.protocol !== "https:" &&
    !(target.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)))
)
  throw Error("Course link storage requires HTTPS except loopback.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  checker = new CourseLinkChecker(
    new SupabaseCourseLinkStore(client),
    new SafeCourseLinkProbe(),
    policies,
  ),
  controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
console.log(
  JSON.stringify({
    event: "course_links.started",
    enabledSources: policies.length,
    concurrency: 1,
  }),
);
const once = process.argv.includes("--once");
do {
  try {
    const completed = await checker.tick(controller.signal);
    if (completed) console.log(JSON.stringify({ event: "course_links.observed", completed }));
  } catch {
    if (!controller.signal.aborted)
      console.error(JSON.stringify({ event: "course_links.unavailable", code: "RF_UNAVAILABLE" }));
    if (once) process.exitCode = 1;
  }
  if (once || controller.signal.aborted) break;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, 5000);
    controller.signal.addEventListener("abort", done, { once: true });
    if (controller.signal.aborted) done();
  });
} while (!controller.signal.aborted);
