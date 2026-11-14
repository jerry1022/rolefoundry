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
  ...(await files("src/modules/profile")),
  ...(await files("src/modules/skills")),
  ...(await files("src/modules/jobs")),
  ...(await files("src/components/profile")),
  ...(await files("src/components/jobs")),
]) {
  if (!/\.tsx?$/.test(file)) continue;
  const source = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const domain =
    /src\/modules\/((?:profile|jobs)\/(model|ports|service|specializations)|skills\/catalog)\.ts$/.test(
      file,
    );
  const component = /^src\/components\/(profile|jobs)\//.test(file);
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
console.log("Profile/job/skill domain and UI dependency boundaries are valid.");
