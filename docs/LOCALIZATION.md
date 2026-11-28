# Localization

The workspace shell and every demo screen are available in English, Traditional Chinese (Taiwan) and Japanese. The top-bar **English / Chinese / Japanese** switch stores the choice per browser (`rolefoundry.locale.v1`), separately from workspace data, and keeps `<html lang>` in sync so screen readers and CJK font fallbacks follow it. Static pages render English first and apply a stored preference after hydration.

## How it works

- Japanese UI messages live in `src/lib/messages/ja/`, with the same English keys and placeholders as zh-TW. Japanese demo content and career guides live in `fixtures-ja.ts` and `career-paths-ja.ts`.
- `src/lib/i18n.tsx` provides `LocaleProvider`, `useI18n()` → `{ locale, setLocale, t, fmt }` and the `msg()` marker.
- Keys are the English source strings. `t("{n}% overlap", { n })` interpolates named placeholders; a missing translation falls back to English, so an untranslated string never breaks a screen.
- `fmt` wraps `Intl`: `number`, `date`, `percent`, `list` (conjunctions follow the locale) and `monthlyRange` (`NT$90k–140k / month` in English; compact ten-thousand units and a localized per-month suffix in Traditional Chinese).
- Filter and form values stay in English internally; only their labels are translated, so stored workspace data and URLs stay locale-independent.
- Plurals use separate message keys (`{n} sample role` / `{n} sample roles`) rather than string concatenation.

## Adding or changing text

1. Wrap UI text in `t("…")` inside components. For messages defined outside a component (navigation, option lists), wrap the literal in `msg("…")` and render it with `t(value)`.
2. Add the Japanese entry in `src/lib/messages/ja/` and the Traditional Chinese entry to the matching area file in `src/lib/messages/zh-TW/` (`shell`, `catalog`, `dashboard`, `profile`, `learning`, `resume`, `applications`, `admin`, `architecture`, `vocabulary` for short shared data labels, or `common` for generic UI words used by several areas). A newly localized screen gets its own file, registered in `index.ts`.
3. Run `npm run i18n:check`. CI runs it too, and fails on missing, unused or duplicated keys. Unit tests also require every placeholder to appear in its translation.

Keep `t()` arguments literal. The checker extracts literals, so `t(cond ? "A" : "B")` hides keys; write `cond ? t("A") : t("B")`.

## Scope

Localized: the shell, overview, role discovery and job details, career-path browser chrome and titles, skill profile, scenario check chrome, learning path, resume studio, tracker, demo inspector and architecture page, plus skill, track, stage, location, level and course-format labels.

Connected (signed-in) screens are localized too: account, consent and allowances, data export and deletion, profile and evidence, skill dictionary, job catalog and bookmarks, assessments and the question bank, matching, learning plans and course administration, resume studio and application tracking, plus administration (identity, AI recipients, course links, ingestion review/feeds, operations diagnostics/recovery and deletion recovery). Operations notices are translated in the UI by their stable domain code, so domain models stay free of UI i18n.

Skill names follow the viewer's locale on connected screens: profile evidence, job requirements, assessment items and results, matching, the learning catalog, the resume fact editor and confirmed versions. They use the reviewed `nameZhTw` from the skill dictionary (see [localized skill labels](SKILL_DICTIONARY_SETUP.md#localized-skill-labels)). Administration and authoring screens keep the English name next to the stable skill ID so that reviewers see the canonical record.

The public demo's fictional roles, RoleFoundry's course summaries and exercises, and the scenario questions also have Traditional Chinese text in `src/lib/fixtures-zh-tw.ts` (the editorial career-path guides in `src/lib/career-paths-zh-tw.ts`), keyed by fixture ID. `src/lib/fixtures-locale.ts` swaps it in for zh-TW viewers with `lang="zh-Hant"`, falls back to English for any missing or misaligned entry, and leaves IDs, skills and answer keys unchanged. Demo search matches either language. Official course titles stay in English because they name the linked course page. `tests/unit/fixtures-locale.test.ts` fails when a new fixture has no aligned zh-TW text. This demo text is synthetic content written alongside the English fixtures, not a reviewed translation of real listings.

Server messages are translated too. Every literal `ApplicationError` message in `src/modules` and every mapped database failure is a key in `src/lib/messages/zh-TW/errors.ts`. `npm run i18n:check` scans the modules, so a new server message cannot ship without zh-TW text, and alerts render errors with `t(error)`. The API itself keeps returning English messages and stable `RF_*` codes.

Rule-generated sentences stored in records keep their English source, so a persisted report, plan or proposal reads the same everywhere. Matching condition and gap reasons, learning-plan issues, notes and generated practice text, and resume proposal reasons, questions and limits are translated at render time by `translateStoredText` (`src/components/ui/stored-text.ts`). Each module lists its fixed sentences as `msg()` markers and matches templated sentences, such as "At least {years} years", by pattern. A unit test per module (`planner-text`, `matching-text`, `resume-text`) reads the rule source and fails when a new sentence has no translation.

Still English, by design:
- Authored or server content: job text without a [reviewed translation](CATALOG_SETUP.md#reviewed-translations), course text without a [reviewed translation](LEARNING_SETUP.md#reviewed-course-translations), question text without a [reviewed translation](ASSESSMENT_SETUP.md#reviewed-question-translations) and consent policy descriptions (legal consent text needs its own reviewed, versioned translation). Localizing editorial content should add reviewed per-locale fields to the content records (as the skill dictionary already does with `nameZhTw`), not more UI keys.
- Enum codes shown verbatim (for example task, report and review states), ISO dates (`YYYY-MM-DD`), explicitly UTC timestamps, and typed confirmation phrases such as `DELETE`.

English output is byte-identical to the pre-localization UI, so English plural quirks such as "1 years" were kept. Fixing them is an English copy change, separate from localization.

## Loading

English source strings are the keys, so English needs no catalogue. The zh-TW and Japanese catalogues are separate chunks loaded on demand by `loadMessages`. The locale provider switches to a translated locale only after its catalogue has loaded, a stale load cannot override a newer choice, and a failed load keeps the current language. English visitors never download it. Code that calls `translate("zh-TW", …)` outside the provider, such as unit tests, must `await loadMessages("zh-TW")` first.

## Japanese content boundaries

All UI messages, including connected screen labels and server error translations, have Japanese entries checked against the same source keys and placeholders. Demo jobs, all 30 course notes, 12 scenarios and ten career guides have Japanese editorial text. Official course titles remain unchanged. Published backend content still uses its existing reviewed English/zh-TW versions; Japanese viewers receive the English source when no reviewed Japanese content exists. Legal consent text also retains its original version and language. Selecting Japanese does not machine-translate real listings or change consent policy.
