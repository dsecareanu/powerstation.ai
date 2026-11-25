# @powerstation/ui

Shared UI for powerstation.ai: design tokens, data-state styles and Preact components. Owned by session D.

## Use it in an app

1. Add the dependencies to the app's `package.json`:

   ```json
   "dependencies": {
     "@powerstation/ui": "workspace:*",
     "@powerstation/schema": "workspace:*",
     "preact": "^10.29.8"
   }
   ```

2. Import the styles once (they include the tokens):

   ```ts
   import "@powerstation/ui/styles.css";
   ```

   Tokens only (no component styles): `import "@powerstation/ui/tokens.css";`

3. Use the components:

   ```tsx
   import { AttributionPanel, DataDelayedBanner, DataStateBadge } from "@powerstation/ui";

   <DataDelayedBanner status={status} paths={[DATA_PATHS.flows7d]} />
   <DataStateBadge state="planned" label="Planned trade" />
   <DataStateBadge state="modelled" method="Linear fill between measured hours" />
   <AttributionPanel files={[status, flows, generation]} />
   ```

The package exports TypeScript source (no build step), like `@powerstation/schema`. The app's Vite and `tsconfig` must use Preact JSX (`"jsx": "react-jsx"`, `"jsxImportSource": "preact"`).

## What is in it

| Export                                                                         | What it does                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tokens.css`                                                                   | CSS variables `--ps-*`: colors, data-state colors, fuel colors, type scale, spacing, radius, focus ring, motion. Light and dark theme.                                                                                                           |
| `styles.css`                                                                   | Tokens + component styles. `.ps-state--<state>` and `.ps-swatch` give the data-state pattern on any element.                                                                                                                                     |
| `DataStateBadge`                                                               | Swatch with a pattern + text label. Color is never the only signal.                                                                                                                                                                              |
| `DataDelayedBanner`                                                            | Shows "Data delayed" when measured data in `status.json` is older than `DATA_DELAYED_AFTER_HOURS`. Renders nothing when fresh. `paths` limits the check to the files the page uses. `now` fakes the clock (useful with the fixed-date fixtures). |
| `getFreshness()`                                                               | The same check as a function.                                                                                                                                                                                                                    |
| `AttributionPanel`                                                             | Expandable list of source, license (linked to SPDX) and attribution of the loaded files. Shows a "Demo data" note if any file has `mock: true`.                                                                                                  |
| `formatPower`, `formatEnergy`, `describePowerInHomes`, `describeEnergyInHomes` | MW/GW and MWh/GWh/TWh, plus "about as much as N homes in <country> use on average". Pass `{ countryCode, countryName }`.                                                                                                                         |
| `householdsFor`, `HOUSEHOLD_MWH_PER_YEAR`, `HOUSEHOLD_EU`, `HOUSEHOLD_SOURCE`  | Electricity use per household per country (Eurostat, 2024), EU value as fallback. `householdsFor(code).isFallback` tells the UI to say "EU homes". Show `HOUSEHOLD_SOURCE.attribution` wherever a homes comparison appears.                      |
| `fuelColorVar`, `stateColorVar`, `readToken`                                   | CSS variable names, and their current values for MapLibre (which cannot read `var()`).                                                                                                                                                           |
| `ScoreBar`, `useScore`, `getLevel`, `LEVELS`                                   | Points, level name and progress bar. `useScore()` keeps points in `localStorage` (key `powerstation:score`) and still works when storage is blocked.                                                                                             |
| `Missions`                                                                     | Missions list with check marks, "N of M done" and a cheer message when all are done.                                                                                                                                                             |
| `StepRail`                                                                     | Numbered steps; current step highlighted (`aria-current="step"`). With `onSelect`, steps are buttons.                                                                                                                                            |
| `Mystery`                                                                      | Expandable question and answer (native `<details>`). `onToggle` can award points.                                                                                                                                                                |
| `AnimatedNumber`                                                               | Counts to a new value. No animation under `prefers-reduced-motion`. Screen readers get the final value only.                                                                                                                                     |
| `readStorage`, `writeStorage`                                                  | `localStorage` access that never throws.                                                                                                                                                                                                         |

## Data-state patterns

| State    | Swatch                 | Suggested line style on a map or chart |
| -------- | ---------------------- | -------------------------------------- |
| measured | solid fill             | solid line                             |
| planned  | dashed outline         | dashed line                            |
| modelled | diagonal hatch         | dotted line or hatched area            |
| missing  | dotted outline + slash | gap                                    |

## Theme

Dark follows `prefers-color-scheme`. To force a theme, set `data-theme="light"` or `data-theme="dark"` on `<html>`. `prefers-reduced-motion` sets the motion tokens to 0 ms and turns off transitions on `ps-` elements.

## Commands

- `pnpm --filter @powerstation/ui demo`: demo page with every component (uses the fixtures).
- `pnpm --filter @powerstation/ui test`: unit tests, including a WCAG contrast check of the tokens.
- `pnpm --filter @powerstation/ui size`: gzipped size the package adds to an app (Preact excluded).
