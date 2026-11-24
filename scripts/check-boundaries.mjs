import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((item) =>
        item.isDirectory()
          ? files(path.join(directory, item.name))
          : [path.join(directory, item.name)],
      ),
    )
  ).flat();
}
const violations = [];
for (const file of [
  ...(await files("src/modules/identity")),
  ...(await files("src/modules/invalidation")),
  ...(await files("src/modules/profile")),
  ...(await files("src/modules/skills")),
  ...(await files("src/modules/jobs")),
  ...(await files("src/modules/assessment")),
  ...(await files("src/modules/tasks")),
  ...(await files("src/modules/matching")),
  ...(await files("src/modules/learning")),
  ...(await files("src/modules/resume")),
  ...(await files("src/modules/applications")),
  ...(await files("src/modules/ingestion")),
  ...(await files("src/modules/operations")),
  ...(await files("src/modules/account-data")),
  ...(await files("src/modules/account-deletion")),
  ...(await files("src/components/identity")),
  ...(await files("src/components/profile")),
  ...(await files("src/components/jobs")),
  ...(await files("src/components/skills")),
  ...(await files("src/components/assessment")),
  ...(await files("src/components/matching")),
  ...(await files("src/components/learning")),
  ...(await files("src/components/resume")),
  ...(await files("src/components/applications")),
  ...(await files("src/components/ingestion")),
  ...(await files("src/components/operations")),
  ...(await files("src/components/admin")),
  ...(await files("src/components/account-data")),
  ...(await files("src/components/account-deletion")),
]) {
  if (!/\.tsx?$/.test(file)) continue;
  const source = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const domain =
    /^src\/modules\/identity\/(admin|admin-service)\.ts$/.test(file) ||
    /^src\/modules\/invalidation\/(model|ports|dispatcher)\.ts$/.test(file) ||
    /src\/modules\/((?:profile|jobs|skills|assessment|tasks|matching|learning|resume|applications|ingestion|operations|account-data|account-deletion)\/(model|ports|service|specializations|catalog|worker|rules|handler|report-state|planner|plan-state|document-state|cleanup|record-state|input|csv|normalizer|review-service|feed-service|feed-handler|presence|replay))\.ts$/.test(
      file,
    );
  const component =
    /^src\/components\/(profile|jobs|skills|assessment|matching|learning|resume|applications|ingestion|operations|identity|admin|account-data|account-deletion)\//.test(
      file,
    );
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier?.text;
    if (!specifier) continue;
    const infra =
      /(^next(?:\/|$)|@supabase|server-only|\/adapters\/|\/server$|\/http$|\/lib\/domain$)/.test(
        specifier,
      );
    if (domain && infra) violations.push(`${file}: domain imports infrastructure ${specifier}`);
    if (component && /(@supabase|server-only|\/server$|\/adapters\/supabase)/.test(specifier))
      violations.push(`${file}: UI imports server infrastructure ${specifier}`);
  }
}
if (violations.length) throw new Error(violations.join("\n"));
console.log(
  "Profile/job/skill/assessment/task/matching/learning/resume/applications/ingestion/operations/account-data/account-deletion/invalidation domain and UI dependency boundaries are valid.",
);
