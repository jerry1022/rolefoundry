# Localization

The workspace shell and every demo screen are available in English and Traditional Chinese (Taiwan). The top-bar **EN / Chinese** switch stores the choice per browser (`rolefoundry.locale.v1`), separately from workspace data, and keeps `<html lang>` in sync so screen readers and CJK font fallbacks follow it. Static pages render English first and apply a stored preference after hydration.

## How it works

- `src/lib/i18n.tsx` provides `LocaleProvider`, `useI18n()` → `{ locale, setLocale, t, fmt }` and the `msg()` marker.
- Keys are the English source strings. `t("{n}% overlap", { n })` interpolates named placeholders; a missing translation falls back to English, so an untranslated string never breaks a screen.
- `fmt` wraps `Intl`: `number`, `date`, `percent`, `list` (conjunctions follow the locale) and `monthlyRange` (`NT$90k–140k / month` in English; compact ten-thousand units and a localized per-month suffix in Traditional Chinese).
- Filter and form values stay in English internally; only their labels are translated, so stored workspace data and URLs stay locale-independent.
- Plurals use separate message keys (`{n} sample role` / `{n} sample roles`) rather than string concatenation.

## Adding or changing text

1. Wrap UI text in `t("…")` inside components. For messages defined outside a component (navigation, option lists), wrap the literal in `msg("…")` and render it with `t(value)`.
2. Add the Traditional Chinese entry to the matching area file in `src/lib/messages/zh-TW/` (`shell`, `catalog`, `dashboard`, `profile`, `learning`, `resume`, `applications`, `admin`, `architecture`, `vocabulary` for short shared data labels, or `common` for generic UI words used by several areas). A newly localized screen gets its own file, registered in `index.ts`.
3. Run `npm run i18n:check`. CI runs it too, and fails on missing, unused or duplicated keys. Unit tests also require every placeholder to appear in its translation.

Keep `t()` arguments literal. The checker extracts literals, so `t(cond ? "A" : "B")` hides keys; write `cond ? t("A") : t("B")`.

## Scope

Localized: the shell, overview, role discovery and job details, career-path browser chrome and titles, skill profile, scenario check chrome, learning path, resume studio, tracker, demo inspector and architecture page, plus skill, track, stage, location, level and course-format labels.

Connected (signed-in) screens are localized too: account, consent and allowances, data export and deletion, profile and evidence, skill dictionary, job catalog and bookmarks, assessments and the question bank, matching, learning plans and course administration, resume studio and application tracking, plus administration (identity, AI recipients, course links, ingestion review/feeds, operations diagnostics/recovery and deletion recovery). Operations notices are translated in the UI by their stable domain code, so domain models stay free of UI i18n.

Skill names follow the viewer's locale on connected screens: profile evidence, job requirements, assessment items and results, matching, the learning catalog, the resume fact editor and confirmed versions. They use the reviewed `nameZhTw` from the skill dictionary (see [localized skill labels](SKILL_DICTIONARY_SETUP.md#localized-skill-labels)). Administration and authoring screens keep the English name next to the stable skill ID so that reviewers see the canonical record.

Still English, by design:
- Authored or server content: job text without a [reviewed translation](CATALOG_SETUP.md#reviewed-translations), course and question text, career-guide bodies, server error messages and consent policy descriptions. Localizing editorial content should add reviewed per-locale fields to the content records (as the skill dictionary already does with `nameZhTw`), not more UI keys.
- Enum codes shown verbatim (for example task, report and review states), ISO dates (`YYYY-MM-DD`), explicitly UTC timestamps, and typed confirmation phrases such as `DELETE`.

English output is byte-identical to the pre-localization UI, so English plural quirks such as "1 years" were kept. Fixing them is an English copy change, separate from localization.
