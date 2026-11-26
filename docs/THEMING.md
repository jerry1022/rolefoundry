# Theming

The workspace ships the **Aurora Forest** light theme and a generated dark theme. The top-bar switch offers system, light and dark. The choice is stored per browser (`rolefoundry.theme.v1`), and "system" follows live OS changes. A small inline script in `<head>` stamps `<html data-theme>` before first paint, so a dark preference never flashes light.

## How the dark theme is built

`src/app/theme-dark.css` is **generated**. Do not edit it by hand.

- `npm run theme:generate` parses `globals.css` with PostCSS. For every literal color in a background, text, border or shadow declaration it emits a `:root[data-theme="dark"]` counterpart. Perceptual lightness is remapped in OKLCH per role while hue is kept, so the brand reads the same in both themes. Near-neutral surfaces get a faint brand-green tint instead of flat gray.
- Only the **last writer** of a property for a selector (within the same media query) is converted. Otherwise a dark override of an early rule could beat a later token-based rule through its higher specificity.
- Already-dark components (sidebar, aurora hero/banners, primary buttons, brand marks) are matched by a `keep` pattern. Their original colors are re-asserted under the dark scope, so a broader dark rule (for example `.arch-node` versus `.primary-node`) cannot override them.
- Design tokens (`--bg`, `--surface`, `--ink`, `--line`, `--text-gradient`, shadows and so on) and a few token-based exceptions are hand-tuned at the top of the generator.

`npm run theme:check` runs in CI and fails if the generated file is stale. After changing `globals.css`, run `npm run theme:generate` and review dark screenshots. When a component looks wrong, prefer tokens (`var(--surface)`, `var(--ink)`) in `globals.css`, then add a `keep` entry or a hand rule in the generator only if needed.

Browser tests cover the system default, persisted choice across reloads, the boot script and mobile layout.

## Contrast

Text must reach at least 4.6:1. The dark generator lightens every derived text color (keeping its OKLCH hue) until it meets that ratio against `--surface-2`, so new rules inherit readable dark text. In the light theme, use the text tokens (`--ink`, `--ink-2`, `--muted`, `--muted-2`, `--emerald`), which meet the ratio on near-white surfaces. The Playwright and integration suites run axe-core (WCAG 2.1 AA) in both themes and fail on any violation.

## Keyboard navigation

Below 760px the sidebar is an off-canvas panel. The menu button exposes `aria-expanded`/`aria-controls`. Opening it moves focus to the first navigation link, and Escape closes it and returns focus to the button. While closed, the panel is `inert`, so Tab and screen readers skip it. A browser test covers this flow.

## Vendor prefixes

Write only standard properties in `globals.css`; the CSS compiler adds vendor prefixes for the supported browsers. Do not hand-write `-webkit-backdrop-filter`: a rule that declares both the standard and the prefixed property loses both in the compiled output. This silently removed the frosted top bar, hero card and floating labels until it was caught, and `tests/unit/styles.test.ts` now rejects it.

## Token roles and contrast checks

Light-theme tokens that the dark palette does not redefine are remapped per role by the generator (`tokenRoles` in `scripts/generate-dark-theme.mjs`). For example, text set to `var(--green-dark)` becomes `var(--green)` in dark mode, because dark ink on a dark surface measured 1.3:1. Components on lime surfaces that keep the dark ink are on the `keep` list.

axe cannot compute contrast over gradient backgrounds, and it reports those nodes as incomplete rather than as violations. The dark-theme browser test therefore checks the checked skill labels' colour directly. The signed-in accessibility suite scans member screens and **every expanded administrator section** in both themes and both languages, because collapsed sections unmount their editors.

## Living surfaces

- **Pointer spotlight.** Cards listed in `glowSurfaces` (`src/components/ui/pointer-glow.tsx`) show a soft radial glow that follows a fine pointer. One passive document listener, throttled to animation frames, sets `--glow-x` and `--glow-y` on the card under the pointer. It does nothing for touch-only devices or when the viewer prefers reduced motion. To add a surface, extend `glowSurfaces` and the matching selectors in `globals.css`.
- **Scroll reveal.** Cards rise into view using CSS scroll-driven animations (`animation-timeline: view()`), with backwards fill only, so hover transforms still apply afterwards. Browsers without scroll timelines show the cards immediately. The reveal is disabled under reduced motion.
- **Drifting aurora.** `body::before` holds three blurred colour fields that move slowly behind every page.
- **Colours.** All of these colours are tokens (`--glow-*`, `--aurora-*`). The dark values are defined in the generator's token block, so the theme generator never darkens them.

## Route transitions

Page content is wrapped in React's `<ViewTransition>` keyed by the route (`src/components/shell.tsx`). Navigating fades the old page out and the new page in with a slight rise. The shell (sidebar and top bar) is excluded from the animation, and the transition is disabled under reduced motion. Browsers without the View Transitions API simply swap the page. Staggered section entrance targets `.route-content > *`.

