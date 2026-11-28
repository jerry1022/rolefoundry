"use client";
import { Languages } from "lucide-react";
import { locales, useI18n, type Locale } from "@/lib/i18n";

const names: Record<Locale, string> = { en: "English", "zh-TW": "繁體中文", ja: "日本語" };
const labels: Record<Locale, string> = { en: "EN", "zh-TW": "中文", ja: "日本語" };

/** Native language names remain recognizable in every locale. */
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
          {labels[value]}
          <span className="sr-only">{names[value]}</span>
        </button>
      ))}
    </div>
  );
}
