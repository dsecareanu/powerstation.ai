# Session B report — Data center calculator

Date: 2026-11-25. Branch: `ws/b-calculator`. Schema version used: `1.1.0` (after merging `main` at `805c6ac`).

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
- Tests: 56 in the calculator (`node --test` + tsx, same as `schema`). They cover capacity per direction, pressure without capacity, emission factors with `match: "none"` left out, proxy notes, the EU household fallback, fixture validity, missing and modelled hours, the data center with `power_mw: null`, import and border signs, the 90% pressure flag, carbon averaging, the merit-order fallback, URL round trip and the household table.
- [Estimate] Bundle: ~22.2 KB JS + 3.3 KB CSS gzipped (`vite build`), including `@powerstation/ui`. Budget is 200 KB.
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

## Update after #3, #2 and #5 merged (2026-11-25)

`main` (`805c6ac`) is merged into `ws/b-calculator` (merge, no force push). The lockfile conflict was solved with main's version, then `pnpm install`.

- **Shared UI:** `src/ui-standins/` is deleted. The page uses `DataStateBadge`, `DataDelayedBanner`, `AttributionPanel`, `AnimatedNumber`, `getFreshness`, `formatPower` and the tokens from `@powerstation/ui`. No `TODO(A)` or `TODO(D)` is left in `apps/calculator`.
- **Households:** `src/constants/households.ts` is deleted. The page uses `householdsFor` and `describePowerInHomes` from `@powerstation/ui`. With the EU fallback, the package text says "EU homes … use on average" and a hint says "No household figure for X: this uses the average EU household." `HOUSEHOLD_SOURCE.attribution` shows under each homes line and in the attribution panel.
- **Capacity (`v1/capacity/rolling-30d.json`):** import capacity per hour = sum of the directions into the zone. If any physical border of the zone has no capacity for the import direction (for example flow-based borders), the page does not calculate pressure and lists those borders. Hours with a missing flow or capacity value, or a capacity sum of 0, are left out and counted. Capacity is labelled "planned capacity". In the fixtures, PT is the only zone without pressure (no ES → PT capacity). When the peak pressure is 0 or less, the page says the zone still exports in every hour.
- **Emission factors (`v1/meta/emission-factors.json`):** hourly intensity uses only fuels with a factor (`direct` or `proxy`). Fuels with `match: "none"` are left out of both sums, never counted as 0. The page names them and gives their share of generation (DE-LU fixtures: other, waste, pumped storage, 3.4%). Proxy fuels show their note. Unit: life-cycle gCO2eq/kWh.
- **Robustness:** if the capacity or emission-factors file does not load, those blocks say "not available" and the rest works. If the generation file does not load, the page shows a message and does not crash.
- Checked at 375 px in headless Chrome (DE-LU, PL, PT, DE-LU vs FR): no sideways scroll, only a favicon 404 in the console.

## Daniel's decisions after the PR (2026-11-25)

- **One household figure, in `@powerstation/ui`.** Session D builds it in PR #5 with the method above and the EU aggregate as fallback. `apps/calculator/src/constants/households.ts` is now deleted (see above). When the EU fallback is used, the page says "average EU homes", not "homes in <country>".
- **Merge order:** #3 (D) → #2 (A, schema 1.1.0) → #5 (D, household table) → #4 (this PR).
- **After #2 merges:** rebase, then read capacity and emission factors from the 1.1.0 files. Capacity is per direction. Emission factors with `match: "none"` show as "no factor", never as 0. Capacity can be missing on flow-based borders, so the page must work without it.
- **After #5 merges:** rebase again, use the shared household functions and the `@powerstation/ui` components instead of `src/ui-standins/`.
- **Lockfile conflicts:** take `main`'s `pnpm-lock.yaml`, run `pnpm install`, commit. Never edit it by hand.
- `.playwright-mcp/` is added to the root `.gitignore` in this PR (Daniel's request).

## Requests to other sessions

- **Session A:** done in schema 1.1.0 (capacity per direction, emission factors). Still useful: a license field for each emission-factor source.
- **Session D:** done in #3 and #5. Still useful: an info banner (the calculator keeps a local `.banner` for errors and the demo-data notice).

## Ideas (for `IDEAS.md`, not edited here)

- Share image for a result (needs a server or a build-time renderer).
- EU-27 average as a fallback for countries with no household figure, clearly labelled.

## Open questions for Daniel

1. The emission-factor source (IPCC) has no license field in the file. The attribution panel shows "See the publisher's terms". What should the real file say?
2. Homes wording with the EU fallback: the package says "EU homes … use on average", not "average EU homes". Is that close enough, or should session D change the package text?
3. Deploy target and `VITE_DATA_BASE_URL` for the standalone page (Cloudflare Pages project name, R2 public URL).
4. Session A's open point: lignite uses a hard-coal proxy, and oil has no factor. Lignite is a large share in DE, PL and CZ. A second cited source would improve carbon intensity.
