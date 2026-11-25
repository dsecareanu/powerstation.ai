# Session D report — Shared UI package

Date: 2026-11-25. Branch: `ws/d-ui`. Status: PR 1 (items 1–5, branch `ws/d-ui`, PR #3) merged into `main`. PR 2 (items 6–10 + household table + review fixes, branch `ws/d-game`, PR #5, base `main`) open.

## What exists now (first PR)

- `packages/ui` (`@powerstation/ui` 0.1.0). Exports TypeScript source, like `@powerstation/schema`. Guide: `packages/ui/README.md`.
- `src/tokens.css`: CSS variables `--ps-*`. Base colors, 4 data-state colors, 16 fuel colors, type scale, spacing, radius, focus ring, motion. Light and dark (`prefers-color-scheme`, or `data-theme` on `<html>`).
- `src/styles.css`: tokens + component styles. `.ps-state--<state>` and `.ps-swatch` give each data state a pattern as well as a color.
- Components: `DataStateBadge`, `DataDelayedBanner`, `AttributionPanel`.
- Helpers: `getFreshness()`, `formatPower`, `formatEnergy`, `describePowerInHomes`, `describeEnergyInHomes`, `fuelColorVar`, `stateColorVar`, `readToken`.
- 15 tests (`pnpm --filter @powerstation/ui test`): units, freshness against the status fixture, WCAG contrast of the tokens in both themes, component rendering.
- Demo page: `pnpm --filter @powerstation/ui demo`. Checked at 375 px in light and dark.

## What PR 2 adds

- `ScoreBar` + `useScore()` + `getLevel()` + `LEVELS`. Points live in `localStorage` (key `powerstation:score`), through `readStorage`/`writeStorage`, which never throw.
- `Missions` (check marks, "N of M done", cheer message in a `role="status"` region when all are done).
- `StepRail` (numbered, `aria-current="step"`, optional buttons with `onSelect`).
- `Mystery` (native `<details>`, `onToggle`).
- `AnimatedNumber` (ease-out count, no animation under reduced motion, final value for screen readers).
- **One household table** (decision by Daniel, relayed by the orchestrator, 2026-11-25): Eurostat electricity use per household for 32 countries, 2024, with the EU27 value as fallback. Replaces the Odyssee-Mure 3.6 MWh figure. Exports: `householdsFor`, `HOUSEHOLD_MWH_PER_YEAR`, `HOUSEHOLD_EU`, `HOUSEHOLD_SOURCE`, types `HouseholdFigure`, `HouseholdLookup`, `HomesTextOptions`. `homesForPower`, `homesForEnergyPerYear`, `describePowerInHomes`, `describeEnergyInHomes` take an optional country.
- Review fixes: banner no longer says "We update the page when new data arrives"; `formatPower(999.6)` = "1 GW" (rounding moves up a unit); `formatCount` shows "less than 1", never "0 homes", for values between 0 and 1; the "all uses" claim is gone with the old source.
- 13 more tests (28 in total).

## Follow-up PR (`ws/d-fixes`)

- Copy fix: less than one home now reads "less than one home in Germany uses on average" and "less than what one EU home uses in a year" (was "about as much as less than 1 home ..."). Demo page shows all of them. Checked at 375 px, light and dark, with keyboard focus.

## Decisions

- **Household figures:** Eurostat, data year 2024, retrieved from the Eurostat API on 2026-11-25. kWh per household = `nrg_bal_c` (nrg_bal=FC_OTH_HH_E, siec=E7000, unit=GWH) × 1e6 ÷ `lfst_hhnhtych` (phhcomp, n_child, agechild = TOTAL, unit=THS_HH) ÷ 1e3, rounded to whole kWh, stored as MWh. 32 countries have both figures. EU27_2020 = 3,525 kWh (fallback). Eurostat "EL" is stored as "GR". Countries with energy data but no household count (AL, GE, IS, MD, ME, XK) and countries with neither (CH, UK) use the EU value. All 32 values match session B's table exactly.
- **Fallback wording:** a known country gives "homes in <country name>" (or "homes in this country" without a name); the fallback gives "EU homes". `householdsFor(code).isFallback` exposes it. Never 0.
- **License:** Eurostat content is CC BY 4.0 ([copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice)): name the source, say the data was changed (our ratio), and say Eurostat is not responsible. `HOUSEHOLD_SOURCE.attribution` does all three. [Unverified] The notice limits some data from non-EU sources; check it for the non-EU countries (BA, MK, NO, RS, TR) during session A's terms check.
- **Homes comparisons round to 2 significant figures** ("2.4 million", "240,000") to avoid false precision.
- **Freshness uses the stalest checked file.** Each file the page uses must have measured data newer than 2 hours. Files with `newest_measured_at: null` (forecasts, zones) are skipped. No measured data at all = delayed. Pass `paths` so a page checks only the files it loads.
- **Data-state patterns:** measured = solid, planned = dashed, modelled = diagonal hatch, missing = dotted outline with a slash. The map should use the same idea for lines (solid / dashed / dotted / gap).
- **Default labels:** Measured, Planned, Modelled, No data. Pass `label="Planned trade"` for scheduled flows. `method` on a modelled badge shows the method after the label.
- **System fonts only.** No web font download. Display weight 800.
- **Preact peer range `>=10.27.0 <12`** (Daniel approved 2026-11-25). Dev uses Preact 10.29.8. B and C can use 10 or 11.
- **Levels** (Daniel approved 2026-11-25): Grid apprentice 0, Grid watcher 100, Grid balancer 300, Grid dispatcher 600, Grid operator 1,000 points. Apps can pass their own `levels`.
- **Points per action:** sessions B and C decide (Daniel, 2026-11-25). The package has no points table.
- **PR 2 was stacked** on `ws/d-ui` while #3 was open. #3 merged on 2026-11-25 (main `b0160b4`); the orchestrator changed #5's base to `main`, and `ws/d-game` merged `origin/main`.
- **No fetching in the package.** The banner takes the parsed `status.json`. The brief allowed a fetch helper; it is not needed.

## Measurements

- Size added to an app (Preact excluded): after PR 1, 4.1 KB gzip. After PR 2 with the household table: 7.2 KB of the 30 KB budget.
- Contrast: text and accent ≥ 4.5:1, data-state colors ≥ 3:1 (most ≥ 4.4:1) on background and surface, both themes. The test fails if a token change breaks this.
- [Inference] Fuel colors are not contrast-checked. With 16 types, some pairs look alike for color-blind users and solar yellow is weak on the light background. Always show a legend or label with fuel colors.

## What sessions B and C must know

- Add `"@powerstation/ui": "workspace:*"` and `preact`. Import `@powerstation/ui/styles.css` once. Use Preact JSX in `tsconfig` (`"jsx": "react-jsx"`, `"jsxImportSource": "preact"`).
- The fixtures have a fixed "now" (2026-11-25T12:00:00Z). Pass `now` to `DataDelayedBanner` in development, or the banner always shows.
- Session B: import the household table from `@powerstation/ui` (`householdsFor`, `describePowerInHomes(mw, { countryCode, countryName })`) and drop the copy in `apps/calculator`. Show `HOUSEHOLD_SOURCE.attribution` wherever a homes comparison appears.
- Session A: add the Eurostat entry to `DATA_SOURCES.md` (text in PR #5's description).
- MapLibre cannot read CSS variables: use `readToken(stateColorVar("measured"))`, and read again when the theme changes.
- Request new shared components in your PR description.

## Open questions for Daniel

None.
