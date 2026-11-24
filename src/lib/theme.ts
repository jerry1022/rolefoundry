export const themes = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof themes)[number];
export const themeStorageKey = "rolefoundry.theme.v1";

/** Resolves the stored preference against the OS setting and stamps `<html data-theme>`. */
export function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/**
 * Runs in <head> before first paint so a dark preference never flashes light. Kept tiny and
 * dependency-free; storage failures fall back to the OS preference.
 */
export const themeBootScript = `(function(){try{var p=localStorage.getItem("${themeStorageKey}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})();`;
