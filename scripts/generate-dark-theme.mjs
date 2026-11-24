// Generates src/app/theme-dark.css from globals.css. Run `npm run theme:generate`;
// `npm run theme:check` fails when the committed file is stale.
//
// Every literal color in a light rule gets a dark counterpart: perceptual lightness (OKLCH) is
// remapped per property role while hue is kept, so the brand reads the same in both themes.
// Components that are already dark (sidebar, aurora panels, primary buttons) are left alone.
import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";

const SOURCE = "src/app/globals.css";
const TARGET = "src/app/theme-dark.css";
const ROOT = ':root[data-theme="dark"]';

/** Hand-tuned tokens: the generated rules handle literals, tokens define the palette. */
const tokens = `${ROOT} {
  color-scheme: dark;
  --bg: #0b1512;
  --surface: #121e1a;
  --surface-2: #17251f;
  --ink: #e8f1ec;
  --ink-2: #c9d8cf;
  --muted: #9cb0a5;
  --muted-2: #8fa398;
  --line: #24352e;
  --line-strong: #31473e;
  --mint: #16302a;
  --lime-soft: #1d3320;
  --text-gradient: linear-gradient(100deg, #f1f8f3 0%, #b9ecc9 45%, #8fe0a8 75%, #c8f169 100%);
  --shadow-xs: 0 1px 2px rgb(0 0 0 / 35%);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 30%), 0 8px 22px -12px rgb(0 0 0 / 60%);
  --shadow-md: 0 2px 4px rgb(0 0 0 / 30%), 0 20px 44px -18px rgb(0 0 0 / 70%);
  --green: #9ee6b4;
  --emerald: #4cc38a;
}
/* Token-based components whose light colors would invert badly. */
${ROOT} .round-button {
  background: var(--lime);
  color: var(--green-dark);
}
${ROOT} .eyebrow,
${ROOT} .demo-pill {
  color: var(--lime);
}
${ROOT} .segmented button.selected {
  background: var(--surface-2);
  color: var(--ink);
}`;

/** Already-dark or brand-gradient surfaces keep their light-theme colors. */
const keep =
  /(\.sidebar|\.brand|\.hero-|\.learning-hero|\.primary-node|\.button\.(primary|dark)|\.nav-item|\.nav-count|\.round-button|\.avatar|\.art-|\.floating-label|\.orbit|\.spark|\.tiny-star|\.status-dot|\.locale-switcher button\.selected|\.skip-link|\.mobile-scrim|::selection|\.workspace-tag)/;

const roleOf = (prop) =>
  /^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color|outline-color)$/.test(
    prop,
  )
    ? "text"
    : /^border|^outline/.test(prop)
      ? "border"
      : /shadow/.test(prop)
        ? "shadow"
        : /^(background|background-color|background-image)$/.test(prop)
          ? "background"
          : null;

// --- Color math (sRGB <-> OKLab) ---------------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToRgb([L, C, H]) {
  const A = C * Math.cos(H),
    B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255));
}

// Near-neutral surfaces take a faint brand-green tint instead of flat gray.
const brandHue = 2.6;
const tint = (chroma) => Math.max(chroma, 0.012);
const hue = (chroma, h) => (chroma < 0.01 ? brandHue : h);

// WCAG contrast: generated text must reach 4.6:1 on the lightest dark surface (--surface-2).
const darkSurface = [23, 37, 31];
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Raises OKLCH lightness (keeping hue) until the text color is readable on dark surfaces. */
function readable([L, C, H]) {
  let next = [L, C, H];
  for (let i = 0; i < 40 && contrast(oklchToRgb(next), darkSurface) < 4.6; i++)
    next = [Math.min(0.98, next[0] + 0.015), next[1], next[2]];
  return next;
}

/** Lightness/chroma remapping per role; very light text is assumed to sit on dark already. */
function darken(rgb, alpha, role) {
  const [L, C, H] = rgbToOklch(rgb);
  let next;
  if (role === "shadow") return { rgb: [0, 0, 0], alpha: Math.min(1, alpha * 1.8) };
  if (role === "text")
    next = L > 0.86 ? [L, C, H] : readable([Math.min(0.94, 0.98 - L * 0.62), C * 0.9, H]);
  else if (role === "border") next = [0.31 + (1 - L) * 0.5, tint(C * 0.6), hue(C, H)];
  else next = L < 0.35 ? [L, C, H] : [0.21 + (1 - L) * 0.75, tint(C * 0.65), hue(C, H)];
  return { rgb: oklchToRgb(next), alpha };
}

// --- Parsing literal colors ----------------------------------------------------------------
const named = { white: [255, 255, 255], black: [0, 0, 0] };
const colorPattern =
  /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
function parse(token) {
  const lower = token.toLowerCase();
  if (named[lower]) return { rgb: named[lower], alpha: 1 };
  if (lower.startsWith("#")) {
    let hex = lower.slice(1);
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return { rgb, alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1 };
  }
  const parts = lower
    .replace(/rgba?\(|\)/g, "")
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => p.includes("var"))) return null;
  const alpha =
    parts[3] === undefined
      ? 1
      : parts[3].endsWith("%")
        ? parseFloat(parts[3]) / 100
        : parseFloat(parts[3]);
  return { rgb: parts.slice(0, 3).map(Number), alpha };
}
const format = ({ rgb, alpha }) =>
  alpha >= 0.999
    ? `rgb(${rgb.join(" ")})`
    : `rgb(${rgb.join(" ")} / ${Math.round(alpha * 1000) / 10}%)`;

/**
 * Light-theme tokens that the dark palette does not redefine, mapped per role. `--green-dark` is a
 * dark ink on light surfaces; as text on a dark surface it becomes unreadable (1.3:1), so text
 * uses the remapped `--green`. Lime-backed components that keep it are on the `keep` list.
 */
const tokenRoles = { text: [["var(--green-dark)", "var(--green)"]] };

function transformValue(value, role) {
  let changed = false;
  let next = value;
  for (const [from, to] of tokenRoles[role] ?? [])
    if (next.includes(from)) {
      next = next.replaceAll(from, to);
      changed = true;
    }
  next = next.replace(colorPattern, (token) => {
    const color = parse(token);
    if (!color) return token;
    changed = true;
    return format(darken(color.rgb, color.alpha, role));
  });
  return changed ? next : null;
}

const scope = (selector) =>
  selector
    .split(",")
    .map((part) => part.trim())
    .map((part) => (part.startsWith(":root") ? part.replace(":root", ROOT) : `${ROOT} ${part}`))
    .join(",\n");

const mediaOf = (rule) => {
  const queries = [];
  for (let node = rule.parent; node && node.type === "atrule"; node = node.parent)
    if (node.name === "media") queries.unshift(node.params);
  return queries;
};
const parts = (selector) => selector.split(",").map((part) => part.trim());

export async function generate() {
  const source = postcss.parse(await readFile(SOURCE, "utf8"));
  const rules = [];
  source.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    rules.push(rule);
  });
  // In light mode a later rule with the same selector wins; a dark override must not revive an
  // earlier declaration through its higher specificity, so only the last writer is converted.
  const lastWriter = new Map();
  rules.forEach((rule, index) => {
    const media = mediaOf(rule).join(" and ");
    rule.walkDecls((decl) => {
      for (const part of parts(rule.selector))
        lastWriter.set(`${media}|${part}|${decl.prop}`, index);
    });
  });
  const output = postcss.root();
  rules.forEach((rule, index) => {
    const media = mediaOf(rule);
    const byPart = new Map();
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) return;
      const role = roleOf(decl.prop);
      if (!role) return;
      const value = transformValue(decl.value, role);
      for (const part of parts(rule.selector)) {
        const kept = keep.test(part);
        if (!value && !kept) continue;
        if (lastWriter.get(`${media.join(" and ")}|${part}|${decl.prop}`) !== index) continue;
        // Already-dark components re-assert their light colors so a generic dark rule for a
        // broader selector (e.g. .arch-node vs .primary-node) cannot override them.
        const declared = kept ? decl.value : value;
        if (!byPart.has(part)) byPart.set(part, []);
        byPart
          .get(part)
          .push(postcss.decl({ prop: decl.prop, value: declared, important: decl.important }));
      }
    });
    if (!byPart.size) return;
    let container = output;
    for (const params of media) {
      const at = postcss.atRule({ name: "media", params });
      container.append(at);
      container = at;
    }
    for (const [part, declarations] of byPart) {
      const copy = postcss.rule({ selector: scope(part) });
      copy.append(declarations);
      container.append(copy);
    }
  });
  return `/* Generated by scripts/generate-dark-theme.mjs from globals.css. Do not edit by hand. */\n${tokens}\n${output.toString()}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const css = await generate();
  if (process.argv.includes("--check")) {
    const current = await readFile(TARGET, "utf8").catch(() => "");
    const prettier = await import("prettier");
    const formatted = await prettier.format(css, {
      ...(await prettier.resolveConfig(TARGET)),
      filepath: TARGET,
    });
    if (formatted !== current) {
      console.error("theme-dark.css is stale; run npm run theme:generate.");
      process.exit(1);
    }
    console.log("Dark theme is in sync with globals.css.");
  } else {
    const prettier = await import("prettier");
    await writeFile(
      TARGET,
      await prettier.format(css, { ...(await prettier.resolveConfig(TARGET)), filepath: TARGET }),
    );
    console.log(`Wrote ${TARGET}.`);
  }
}
