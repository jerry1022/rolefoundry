"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Messages } from "./messages/zh-TW/types";

export const locales = ["en", "zh-TW"] as const;
export type Locale = (typeof locales)[number];
const KEY = "rolefoundry.locale.v1";
type Vars = Record<string, string | number>;

/**
 * Marks a message defined outside a component (navigation, option lists). It returns the
 * English key unchanged; render it with `t(value)`. `npm run i18n:check` collects these.
 */
export const msg = (source: string) => source;

/**
 * Loaded catalogues. English is the source text, so only zh-TW is fetched, on demand: English
 * visitors never download it, and the provider switches locale only after it has loaded.
 */
const catalogues: Partial<Record<Locale, Messages>> = {};
let pending: Promise<Messages> | null = null;

/** Loads (once) the messages for a locale; resolves immediately for English. */
export async function loadMessages(locale: Locale) {
  if (locale === "en" || catalogues[locale]) return;
  pending ??= import("./messages/zh-TW/index").then((module) => module.zhTW);
  try {
    catalogues[locale] = await pending;
  } finally {
    pending = null;
  }
}

/** English source strings are the keys; a missing (or not yet loaded) translation falls back. */
export function translate(locale: Locale, source: string, vars?: Vars) {
  const template = locale === "zh-TW" ? (catalogues["zh-TW"]?.[source] ?? source) : source;
  return vars
    ? template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
        name in vars ? String(vars[name]) : match,
      )
    : template;
}

export function formatters(locale: Locale) {
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  return {
    number: (value: number) => number.format(value),
    date: (value: string | number | Date) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? "" : date.format(parsed);
    },
    percent: (value: number) =>
      new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
        value / 100,
      ),
    list: (values: string[]) => list.format(values),
    /** Monthly TWD range from whole-dollar bounds, e.g. NT$90k–140k or NT$9萬–14萬. */
    monthlyRange: (low: number, high: number) =>
      locale === "zh-TW"
        ? `NT$${compact.format(low)}–${compact.format(high)} / 月`
        : `NT$${Math.round(low / 1000)}k–${Math.round(high / 1000)}k / month`,
  };
}

type Context = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string, vars?: Vars) => string;
  fmt: ReturnType<typeof formatters>;
};
const I18nContext = createContext<Context | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Static export renders English first; the stored preference is applied after hydration.
  const [locale, setState] = useState<Locale>("en");
  // The most recent request wins if a slow catalogue load finishes after a newer choice.
  const requested = useRef<Locale>("en");
  const apply = useCallback(async (next: Locale) => {
    requested.current = next;
    try {
      await loadMessages(next);
    } catch {
      // The catalogue could not load (offline); stay in the current language.
      return;
    }
    if (requested.current === next) setState(next);
  }, []);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "en" || stored === "zh-TW") void apply(stored);
    } catch {
      // Storage may be unavailable; English remains usable.
    }
  }, [apply]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback(
    (next: Locale) => {
      void apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Preference lasts for this session only.
      }
    },
    [apply],
  );
  const value = useMemo<Context>(
    () => ({
      locale,
      setLocale,
      t: (source, vars) => translate(locale, source, vars),
      fmt: formatters(locale),
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallback: Context = {
  locale: "en",
  setLocale: () => {},
  t: (source, vars) => translate("en", source, vars),
  fmt: formatters("en"),
};
/** Components outside the provider (isolated tests, private screens) render English. */
export function useI18n() {
  return useContext(I18nContext) ?? fallback;
}
