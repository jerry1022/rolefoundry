import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { courses, jobs } from "../src/lib/fixtures";
import { skillLabels, stages, tracks } from "../src/lib/domain";
import { careerPaths } from "../src/lib/career-paths";
import { zhTW, zhTWSections } from "../src/lib/messages/zh-TW/index";
import { ja, jaSections } from "../src/lib/messages/ja/index";

/**
 * Keeps zh-TW in sync with the source. Keys are English strings found in
 * `t("…")`/`msg("…")` literals plus short data labels rendered with `t(value)`.
 * Fails on missing translations, unused translations and duplicate keys across sections.
 */
const literal = /\b(?:t|msg)\(\s*"((?:[^"\\]|\\.)*)"/g;
const roots = ["src/components", "src/app", "src/lib"];

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

const used = new Map<string, string>();
for (const root of roots)
  for (const file of await walk(root)) {
    if (file.includes("/messages/")) continue;
    for (const match of (await readFile(file, "utf8")).matchAll(literal))
      if (!used.has(match[1])) used.set(JSON.parse(`"${match[1]}"`), file);
  }

// Server messages reach the UI as `ApplicationError.message` and are shown with `t(error)`, so
// every literal message thrown by a module (and each mapped database failure) needs a key too.
const serverMessage = [
  /ApplicationError\(\s*"RF_[A-Z_]+",\s*\d+,\s*"((?:[^"\\]|\\.)*)"/g,
  /\[\s*\d{3},\s*"((?:[^"\\]|\\.)*)",?\s*\]/g,
];
for (const file of await walk("src/modules"))
  for (const pattern of serverMessage)
    for (const match of (await readFile(file, "utf8")).matchAll(pattern)) {
      const key = JSON.parse(`"${match[1]}"`);
      if (!used.has(key)) used.set(key, `${file} (server message)`);
    }

// Data labels that the demo renders through `t(value)`.
const dataLabels = [
  ...Object.values(skillLabels),
  ...tracks,
  ...stages,
  ...careerPaths.map((path) => path.title),
  ...jobs.flatMap((job) => [job.location, job.mode, job.level, job.added]),
  ...courses.flatMap((course) => [course.level, course.format]),
];
for (const label of dataLabels) if (!used.has(label)) used.set(label, "data fixtures");

const owners = new Map<string, string>();
const problems: string[] = [];
for (const [section, messages] of Object.entries(zhTWSections))
  for (const key of Object.keys(messages)) {
    if (owners.has(key))
      problems.push(`duplicate key in ${section} and ${owners.get(key)}: ${key}`);
    owners.set(key, section);
  }
// Object literals silently keep the last duplicate, so also scan each section file's text.
const keyLine = /^\s+(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*)):\s*["\n]/gm;
for (const file of [
  ...(await walk("src/lib/messages/zh-TW")),
  ...(await walk("src/lib/messages/ja")),
]) {
  const seen = new Set<string>();
  for (const match of (await readFile(file, "utf8")).matchAll(keyLine)) {
    const key = match[1] !== undefined ? JSON.parse(`"${match[1]}"`) : match[2];
    if (seen.has(key)) problems.push(`duplicate key within ${file}: ${key}`);
    seen.add(key);
  }
}
for (const [key, from] of used)
  if (!(key in zhTW)) problems.push(`missing zh-TW: ${JSON.stringify(key)} (${from})`);
for (const [key, section] of owners)
  if (!used.has(key)) problems.push(`unused zh-TW: ${JSON.stringify(key)} (${section})`);

// Every supported catalogue must cover the same UI contract, with exact placeholders.
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(",");
const japaneseKeys = Object.values(jaSections).flatMap((section) => Object.keys(section));
if (new Set(japaneseKeys).size !== japaneseKeys.length) problems.push("duplicate Japanese keys");
for (const [key, from] of used) {
  if (!ja[key]?.trim()) problems.push(`missing ja: ${JSON.stringify(key)} (${from})`);
  else if (placeholders(key) !== placeholders(ja[key]))
    problems.push(`ja placeholders differ: ${JSON.stringify(key)}`);
}
for (const key of Object.keys(ja))
  if (!used.has(key)) problems.push(`unused ja: ${JSON.stringify(key)}`);

for (const problem of problems) console.error(problem);
if (problems.length) process.exit(1);
console.log(`All ${used.size} UI and data labels have zh-TW and ja translations.`);
