# Session D report — Shared UI package

Date: 2026-11-25. Branch: `ws/d-ui`. Status: PR 1 (items 1–5, branch `ws/d-ui`, PR #3) passed CI. PR 2 (items 6–10, branch `ws/d-game`, stacked on `ws/d-ui`) open.

## What exists now (first PR)

- `packages/ui` (`@powerstation/ui` 0.1.0). Exports TypeScript source, like `@powerstation/schema`. Guide: `packages/ui/README.md`.
- `src/tokens.css`: CSS variables `--ps-*`. Base colors, 4 data-state colors, 16 fuel colors, type scale, spacing, radius, focus ring, motion. Light and dark (`prefers-color-scheme`, or `data-theme` on `<html>`).
- `src/styles.css`: tokens + component styles. `.ps-state--<state>` and `.ps-swatch` give each data state a pattern as well as a color.
- Components: `DataStateBadge`, `DataDelayedBanner`, `AttributionPanel`.
- Helpers: `getFreshness()`, `formatPower`, `formatEnergy`, `describePowerInHomes`, `describeEnergyInHomes`, `HOUSEHOLD_ELECTRICITY`, `fuelColorVar`, `stateColorVar`, `readToken`.
- 15 tests (`pnpm --filter @powerstation/ui test`): units, freshness against the status fixture, WCAG contrast of the tokens in both themes, component rendering.
- Demo page: `pnpm --filter @powerstation/ui demo`. Checked at 375 px in light and dark.

## What PR 2 adds

- `ScoreBar` + `useScore()` + `getLevel()` + `LEVELS`. Points live in `localStorage` (key `powerstation:score`), through `readStorage`/`writeStorage`, which never throw.
- `Missions` (check marks, "N of M done", cheer message in a `role="status"` region when all are done).
- `StepRail` (numbered, `aria-current="step"`, optional buttons with `onSelect`).
- `Mystery` (native `<details>`, `onToggle`).
- `AnimatedNumber` (ease-out count, no animation under reduced motion, final value for screen readers).
- 8 more tests (23 in total). Demo page shows all of them. Checked at 375 px, light and dark, with keyboard focus.

## Decisions

- **Household figure:** 3.6 MWh per dwelling per year, EU average, all electricity uses. Source: [Odyssee-Mure, "Electricity consumption per dwelling"](https://www.odyssee-mure.eu/publications/efficiency-by-sector/households/electricity-consumption-dwelling.html), page "last update November 2025", accessed 2026-11-25. That gives about 0.41 kW average power per home, so 1 GW ≈ 2.4 million homes. The page does not state the reference year. Per country the figure goes from 1.8 MWh (Romania) to 8.5 MWh (Sweden).
- **Homes comparisons round to 2 significant figures** ("2.4 million", "240,000") to avoid false precision.
- **Freshness uses the stalest checked file.** Each file the page uses must have measured data newer than 2 hours. Files with `newest_measured_at: null` (forecasts, zones) are skipped. No measured data at all = delayed. Pass `paths` so a page checks only the files it loads.
- **Data-state patterns:** measured = solid, planned = dashed, modelled = diagonal hatch, missing = dotted outline with a slash. The map should use the same idea for lines (solid / dashed / dotted / gap).
- **Default labels:** Measured, Planned, Modelled, No data. Pass `label="Planned trade"` for scheduled flows. `method` on a modelled badge shows the method after the label.
- **System fonts only.** No web font download. Display weight 800.
- **Preact peer range `>=10.27.0 <12`** (Daniel approved 2026-11-25). Dev uses Preact 10.29.8. B and C can use 10 or 11.
- **EU-average household figure for every zone in v1** (Daniel approved 2026-11-25). Per-country figures later.
- **Levels (proposal):** Grid apprentice 0, Grid watcher 100, Grid balancer 300, Grid dispatcher 600, Grid operator 1,000 points. [Estimate] The thresholds are a first guess; tune them when B and C decide how many points each action gives. Apps can pass their own `levels`.
- **PR 2 is stacked:** `ws/d-game` branches from `ws/d-ui`, because PR #3 was still open. Its PR targets `ws/d-ui`; retarget it to `main` after #3 merges.
- **No fetching in the package.** The banner takes the parsed `status.json`. The brief allowed a fetch helper; it is not needed.

## Measurements

- Size added to an app (Preact excluded): after PR 1, 4.1 KB gzip. After PR 2: JS 4.1 KB, CSS 2.4 KB, total 6.5 KB of the 30 KB budget.
- Contrast: text and accent ≥ 4.5:1, data-state colors ≥ 3:1 (most ≥ 4.4:1) on background and surface, both themes. The test fails if a token change breaks this.
- [Inference] Fuel colors are not contrast-checked. With 16 types, some pairs look alike for color-blind users and solar yellow is weak on the light background. Always show a legend or label with fuel colors.

## What sessions B and C must know

- Add `"@powerstation/ui": "workspace:*"` and `preact`. Import `@powerstation/ui/styles.css` once. Use Preact JSX in `tsconfig` (`"jsx": "react-jsx"`, `"jsxImportSource": "preact"`).
- The fixtures have a fixed "now" (2026-11-25T12:00:00Z). Pass `now` to `DataDelayedBanner` in development, or the banner always shows.
- Show `HOUSEHOLD_ELECTRICITY.source` wherever a homes comparison appears (for example in the method notes).
- MapLibre cannot read CSS variables: use `readToken(stateColorVar("measured"))`, and read again when the theme changes.
- Request new shared components in your PR description.

## Open questions for Daniel

1. Level names and thresholds: OK as a proposal, or do you want other names?
2. Points per action (for example a mission, a mystery opened): B and C decide, or one shared table in this package?
