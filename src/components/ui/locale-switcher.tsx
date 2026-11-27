"use client";
import { Languages } from "lucide-react";
import { locales, useI18n, type Locale } from "@/lib/i18n";

const names: Record<Locale, string> = { en: "English", "zh-TW": "繁體中文" };

/** Compact two-option switch; the choice is stored per browser, separate from workspace data. */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="locale-switcher" role="group" aria-label={t("Language")}>
      <Languages size={15} aria-hidden="true" />
      {locales.map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={locale === value}
          className={locale === value ? "selected" : ""}
          onClick={() => setLocale(value)}
        >
          {value === "en" ? "EN" : "中文"}
          <span className="sr-only">{names[value]}</span>
        </button>
      ))}
    </div>
  );
}
