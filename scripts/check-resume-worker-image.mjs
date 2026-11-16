import { spawnSync } from "node:child_process";
const image = process.argv[2] || "rolefoundry-worker:ci";
if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(image)) throw Error("Invalid image name.");
const args = [
  "run",
  "--rm",
  "-i",
  "--network",
  "none",
  "--read-only",
  "--memory",
  "384m",
  "--cpus",
  "1",
  "--pids-limit",
  "32",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--entrypoint",
  "node",
  image,
  "--max-old-space-size=192",
  "--permission",
  "--allow-addons",
  "--allow-fs-read=/app/node_modules",
  "--allow-fs-read=/app/apps/worker/src/resume",
  "--allow-fs-read=/app/src/modules/resume/limits.json",
  "--allow-fs-read=/app/assets/fonts",
  "--allow-fs-read=/app/package.json",
  "/app/apps/worker/src/resume/process.mjs",
];
function execute(request) {
  const result = spawnSync("docker", args, {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 15 * 1024 * 1024,
  });
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw Error("Document container returned no valid response.");
  }
  if (result.status !== 0 || !response.ok) throw Error("Document container processing failed.");
  return response;
}
const rendered = execute({
  operation: "render",
  sections: [
    {
      heading: "Resume / 履歷",
      statements: ["[In progress] Building a retrieval prototype.", "繁體中文與英文實際匯出測試。"],
    },
  ],
});
if (!rendered.bytes) throw Error("No PDF was produced.");
const parsed = execute({ operation: "parse", mediaType: "application/pdf", bytes: rendered.bytes });
const text = (parsed.pages || []).map((page) => page.text).join("");
if (
  !text.includes("Building a retrieval prototype.") ||
  !text.replace(/\s/g, "").includes("繁體中文與英文實際匯出測試。")
)
  throw Error("Container export lost expected content.");
console.log("Actual Linux document round-trip passed without network or writable filesystem.");
