/**
 * Domain rules persist English sentences in reports and plans so a stored record reads the same
 * everywhere. UI modules translate them at render time: fixed sentences are message keys, and
 * templated sentences are matched by pattern so their values can be interpolated.
 */
export interface StoredTemplate {
  pattern: RegExp;
  message: string;
  names: string[];
}
export type Translate = (source: string, vars?: Record<string, string | number>) => string;

/** Translated text for a stored sentence; unknown text (titles, authored content) passes through. */
export function translateStoredText(
  text: string,
  t: Translate,
  templates: readonly StoredTemplate[] = [],
) {
  for (const template of templates) {
    const match = template.pattern.exec(text);
    if (match)
      return t(
        template.message,
        Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]])),
      );
  }
  return t(text);
}
