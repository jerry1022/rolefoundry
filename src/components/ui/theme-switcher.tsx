"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { msg, useI18n } from "@/lib/i18n";
import { applyTheme, themeStorageKey, themes, type ThemePreference } from "@/lib/theme";

const options: Record<ThemePreference, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: msg("Match system theme") },
  light: { icon: Sun, label: msg("Light theme") },
  dark: { icon: Moon, label: msg("Dark theme") },
};

/** Icon-only three-way switch; the preference is stored per browser. */
export function ThemeSwitcher() {
  const { t } = useI18n();
  const [preference, setPreference] = useState<ThemePreference>("system");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(themeStorageKey);
      if (stored === "light" || stored === "dark") setPreference(stored);
    } catch {
      // Storage unavailable: follow the system setting.
    }
  }, []);
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    // Follow live OS changes only while the preference is "system".
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);
  const choose = (next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // Applies for this session only.
    }
  };
  return (
    <div className="theme-switcher" role="group" aria-label={t("Color theme")}>
      {themes.map((value) => {
        const { icon: Icon, label } = options[value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={preference === value}
            className={preference === value ? "selected" : ""}
            title={t(label)}
            onClick={() => choose(value)}
          >
            <Icon size={14} aria-hidden="true" />
            <span className="sr-only">{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
