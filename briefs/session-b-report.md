# Session B report — Data center calculator

Date: 2026-11-25. Branch: `ws/b-calculator`. Schema version used: `1.0.0`.

## What exists now

- `apps/calculator`: Preact + Vite page "What happens to the grid if a data center goes here?".
- Inputs: country, then zone when a country has more than one (DE-LU shows under DE and LU); size 100 MW / 500 MW / 1 GW / custom (1–10,000 MW); period 7 or 30 days; optional comparison zone.
- Outputs per zone, all labelled `modelled` with a one-line method:
  1. Share of average and peak load, plus "about as much electricity as N homes".
  2. Hours that need imports, with and without the data center. Interconnector pressure (needs capacity data).
  3. Carbon intensity of the domestic mix, hour by hour (needs emission factors).
  4. Likely extra source, by a fixed merit-order rule.
  5. Data centers already in the zone (known power, unknown power).
- "How we calculate this" section, scope note (cannot judge a specific site), data dates, hours without data, hours with modelled input.
- Data-delayed banner (`status.json`, 2-hour rule), demo-data notice when `mock: true`, attribution panel for every loaded file, each data center record and the household source.
- URL holds all inputs: `?zone=FR&country=FR&size=500&period=7d&compare=PL` (`compareCountry` only when needed). "Copy result" button with text summary, data dates and link.
- Data loading: `VITE_DATA_BASE_URL`. In `vite dev` a dev-only `/data/` route serves `fixtures/v1`; fixtures are never in `dist/`. `VITE_FAKE_NOW` fakes the clock in dev.
- Tests: 40 (`node --test` + tsx, same as `schema`). They cover fixture validity, missing and modelled hours, the data center with `power_mw: null`, import and border signs, the 90% pressure flag, carbon averaging, the merit-order fallback, URL round trip and the household table.
- [Estimate] Bundle: ~15.5 KB JS + 1.4 KB CSS gzipped (`vite build`). Budget is 200 KB.
- Checked at 375 px in a real browser: no sideways scroll, results correct, no console errors except a missing favicon.

## Decisions (confirmed by Daniel, 2026-11-25)

- **Import need/h** = load + data center − domestic generation. Positive = imports needed.
- **Interconnector pressure (worst case)/h** = (net physical imports + data center MW) ÷ total import capacity. Flag > 90%. The brief's formula added today's net imports twice; this replaces it.
- **Carbon intensity:** attributional, domestic mix only. Imports not included, said on the page.
- **Likely extra source:** first fuel in gas → hard coal → lignite → oil → hydro reservoir that runs that hour and has headroom (period max − current output) ≥ data center size; else imports.
- **Homes:** per-country Eurostat figure, 2024. kWh per household = `nrg_bal_c` (households, electricity, GWh) ÷ `lfst_hhnhtych` (private households). Retrieved 2026-11-25 via the Eurostat API. Greece is `EL` in Eurostat, stored as `GR`. No figure (e.g. CH) → the homes comparison is hidden with a reason. [Unverified] Values not spot-checked against a second source. Examples: DE 3,176, FR 4,694, PL 2,089, RO 1,838 kWh.
- **Game layer** (missions, score bar): a later PR, after session D merges.
- **Picker:** country first, then zone.

Smaller choices made in the build:

- An hour is "without data" if load or any fuel present for the zone is missing. It is left out of all results and counted.
- A missing border value leaves that hour out of pressure only, and is counted separately.
- "Max output over the period" for the merit-order rule uses valid hours only.
- Runtime does not import the ajv validator (bundle size). It checks `dataset` and `schema_version` 1.x. Tests use the full validator.

## Stand-ins until other sessions merge

- `TODO(A)`: `src/calc/types.ts` (`ImportCapacity`, `EmissionFactors` types) and `src/data/loader.ts` (`loadImportCapacities`, `loadEmissionFactors` return `undefined`). The page shows "not available yet" for pressure and carbon. No real numbers are in the code.
- `TODO(D)`: `src/ui-standins/` (`Banner`, `StateBadge`, `AttributionPanel`, `tokens.css`).

## Requests to other sessions

- **Session A (schema 1.1.0):** the calculator needs (1) total import capacity per zone in MW (one number per zone, or per border so the app can sum borders into the zone), with source and date; (2) emission factors in gCO2/kWh per `FuelType`, with source. Factors must cover every fuel that can be > 0, or those hours are left out.
- **Session D (`@powerstation/ui`):** banner (info / warning), state badge (measured / planned / modelled / missing, text + pattern, not colour only), attribution panel (list of `{source, license, attribution, source_url?}`), design tokens, animated counter that respects reduced motion, score bar (for the later game layer).

## Ideas (for `IDEAS.md`, not edited here)

- Share image for a result (needs a server or a build-time renderer).
- EU-27 average as a fallback for countries with no household figure, clearly labelled.

## Open questions for Daniel

1. Capacity source for session A: ENTSO-E NTC or the forecasted transfer capacities? This changes what "close to capacity" means.
2. Deploy target and `VITE_DATA_BASE_URL` for the standalone page (Cloudflare Pages project name, R2 public URL).
