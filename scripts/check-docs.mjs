import { readdir, readFile, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith(".md")) results.push(path);
  }
  return results;
}
const rootFiles = (await readdir(".")).filter((name) => name.endsWith(".md"));
const files = [...rootFiles, ...(await markdownFiles("docs")), ...(await markdownFiles(".github"))];
const errors = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  if (/[\u4e00-\u9fff]/u.test(content))
    errors.push(`${file}: project documentation must be in English`);
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const path = link.split("#")[0];
    if (!path) continue;
    try {
      await access(resolve(dirname(file), path));
    } catch {
      errors.push(`${file}: missing local link ${path}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log(`Checked ${files.length} English Markdown files; all local links resolve.`);
