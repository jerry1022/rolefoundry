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
  ...(await files("src/modules/telemetry")),
  ...(await files("src/modules/course-links")),
  ...(await files("src/modules/gateway")),
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
    /^src\/modules\/tasks\/resources\.ts$/.test(file) ||
    /^src\/modules\/telemetry\/(model|ports|observer|metrics|service)\.ts$/.test(file) ||
    /^src\/modules\/course-links\/(model|ports|service|admin)\.ts$/.test(file) ||
    /^src\/modules\/gateway\/(model|ports|policy|prompt|service|recipes|embeddings|evaluation|admin|analysis)\.ts$/.test(
      file,
    ) ||
    /^src\/modules\/invalidation\/(model|ports|dispatcher)\.ts$/.test(file) ||
    /src\/modules\/((?:profile|jobs|skills|assessment|tasks|matching|learning|resume|applications|ingestion|operations|account-data|account-deletion)\/(model|ports|service|specializations|catalog|worker|rules|handler|report-state|planner|plan-state|document-state|cleanup|record-state|input|csv|normalizer|review-service|feed-service|feed-handler|presence|replay|short-answer|short-answer-examples))\.ts$/.test(
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
// Fixed metric labels and complete route coverage must evolve together.
const familySource = ts.createSourceFile(
  "model.ts",
  await readFile("src/modules/telemetry/model.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
let registeredFamilies = [];
for (const statement of familySource.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(familySource) !== "apiFamilies") continue;
    const array = declaration.initializer?.expression;
    if (array && ts.isArrayLiteralExpression(array))
      registeredFamilies = array.elements.map((element) => element.text);
  }
}
const routeFamilies = new Set();
for (const file of await files("src/app/api")) {
  if (!file.endsWith("/route.ts")) continue;
  const family = file
    .replace("src/app/api/v1/", "")
    .replace(/\/(\[\[?[^/]+\]?\])\/route\.ts$/, "")
    .replaceAll("/", ".");
  routeFamilies.add(family);
  if (!registeredFamilies.includes(family) || !/^[a-z][a-z0-9.-]{0,48}$/.test(family))
    violations.push(`${file}: unregistered metric family`);
  const route = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  const declarations = new Map(),
    entries = new Map();
  const exported = (statement) =>
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of route.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
      if (exported(statement) && methods.has(statement.name.text))
        entries.set(statement.name.text, statement.name);
    }
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        declarations.set(declaration.name.text, declaration.initializer);
        if (exported(statement) && methods.has(declaration.name.text))
          entries.set(declaration.name.text, declaration.name);
      }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const item of statement.exportClause.elements)
        if (methods.has(item.name.text))
          entries.set(item.name.text, item.propertyName ?? item.name);
  }
  if (!entries.size) violations.push(`${file}: missing observed route entry`);
  for (const [method, entry] of entries) {
    let handler = entry;
    const visited = new Set();
    while (handler && ts.isIdentifier(handler) && !visited.has(handler.text)) {
      visited.add(handler.text);
      handler = declarations.get(handler.text);
    }
    const body = handler?.body;
    const expression =
      body && ts.isBlock(body)
        ? body.statements.length === 1 &&
          ts.isReturnStatement(body.statements[0]) &&
          body.statements[0].expression
        : body;
    if (
      !expression ||
      !ts.isCallExpression(expression) ||
      expression.expression.getText(route) !== "observeApi" ||
      expression.arguments[0]?.text !== family
    )
      violations.push(`${file}: ${method} route entry bypasses bounded observation`);
  }
}
if (registeredFamilies.length !== routeFamilies.size)
  violations.push("Telemetry families do not match the API route inventory");
if (violations.length) throw new Error(violations.join("\n"));
console.log("Domain/UI dependency boundaries and bounded API telemetry coverage are valid.");
