# Session 0 report — Data contract and repo setup

Date: 2026-11-25. Branch: `ws/0-data-contract`. Schema version: `1.0.0`.

## What exists now

- pnpm workspace: `schema`, `pipeline`, `packages/*`, `apps/*`. TypeScript, ESLint, Prettier.
- `schema/`: 7 JSON Schema files (draft 2020-12), generated types, `validateDataFile()` and `checkZoneReferences()`, a validator CLI and 12 validator tests. Guide: `schema/README.md`.
- `pipeline/scripts/generate-fixtures.ts`: deterministic mock data generator (fixed seed, fixed "now" = 2026-11-25T12:00:00Z; `--now` changes it).
- `fixtures/v1/...`: 8 mock files, same paths as in R2. 11 zones, 14 borders, 30 days back + 24 h ahead, 8 fictional data centers.
- CI (`.github/workflows/ci.yml`): install, typecheck, lint, format check, generated types up to date, tests, fixture validation, fixtures reproducible.
- `README.md`, `DATA_SOURCES.md`, `IDEAS.md`, `n8n/LICENSE` (MIT). Root `LICENSE` (AGPL-3.0) unchanged.

Acceptance checks (run on a clean clone): `pnpm install && pnpm typecheck && pnpm validate:fixtures` pass. `apps/map` and `apps/calculator` each have `src/schema-types.check.ts`, which imports the types.

## Changes to the brief

- **The plan is not in the repo** (Daniel, 2026-11-25). `powerstation-ai-plan.md` stays in the local project folder and is git-ignored. `CLAUDE.md` says so. Sessions in a worktree cannot read it: put the plan parts they need in their brief.

## Changes to the proposed file list

1. **Added `v1/generation/rolling-7d.json`.** Reason: the default view is 7 days. With the 30-day file only, the map would load 30 days of generation by default. [Estimate] Scaled from the fixtures to ~40 real zones, the 30-day generation file is ~400 KB gzipped on its own, close to the 500 KB budget. The 7-day file is ~110 KB.
2. **`zones.json` has two lists, `zones` and `countries`, not a `type` field.** Reason: data is stored per bidding zone only. A separate country list gives the zone → country mapping in both directions and handles DE-LU (two countries) and IT/NO (several zones per country).

## Decisions taken

- **Every file has `dataset`** (`status`, `zones`, `flows`, ...). It selects the schema, so one validator handles any file.
- **Every file has `mock`** (required, boolean). `pnpm validate --deploy <folder>` fails unless `mock` is `false`.
- **Time series** have `start`, `resolution`, `unit` ("MW"), `values`, `states`, optional `method`. `method` is required when any value is `modelled`.
- **`resolution` allows only `PT1H` in v1.** The brief asked to support the field. The field exists, but the apps get hourly data only, so they need no aggregation code. Adding `PT15M` later is a schema bump.
- **Flows:** `kind: physical` (measured) and `kind: scheduled` (planned trade) are separate series. One direction per border; positive = `from_zone` → `to_zone`. The physical series ends at "now"; the scheduled series runs 24 h ahead and also covers past hours (for planned vs actual).
- **Allowed states per series** are checked: physical flows, generation, load = measured/modelled/missing; scheduled flows and forecasts = planned/missing.
- **Fuel types:** 16 types close to ENTSO-E production types (`FUEL_TYPES` in `schema/src/index.ts`). `hydro_pumped_storage` is net and can be negative.
- **Absent vs missing:** a fuel or forecast type a zone does not have is left out. A gap in a series that exists is `missing`.
- **Data center `power_state`:** uses the same state enum, limited to measured/modelled/missing. Here "measured" means "published by the source".
- **Status:** `newest_measured_at` per file drives "data delayed" (`DATA_DELAYED_AFTER_HOURS = 2` in `schema/src/index.ts`).
- **TypeScript 6.0, not 7.0.** typescript-eslint 8 does not support TypeScript 7 yet. Move to 7 when it does.
- **pnpm 12.23.0** (via `packageManager`). `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (only package versions at least 7 days old) and allows build scripts for esbuild only.
- **Fixture JSON** puts number and state arrays on one line, so diffs stay readable. Prettier skips `fixtures/`.

## What sessions A–D must know

- **Import:** `import { DATA_PATHS, type FlowsFile } from "@powerstation/schema"` and `import { validateDataFile } from "@powerstation/schema/validate"`. Add `"@powerstation/schema": "workspace:*"` to your `package.json`.
- **Package exports point to `.ts` source**, not built JS. Vite and tsx read it directly. Nothing needs a build step.
- **Fixtures have a fixed date** (now = 2026-11-25T12:00:00Z). Against the real clock they look old, so the "data delayed" state shows. For development, either fake the clock in the app or run `pnpm fixtures --now <time>` locally (do not commit that output; CI checks the committed fixtures).
- **Fixture content to test against:** border DE-LU → FR physical has a 4-hour modelled gap 48 h before now and a 3-hour missing gap 30 h before now. Other series have random short gaps. RO load forecast is missing for the last 6 hours. One data center has `power_mw: null`.
- **Session A (pipeline):** run `pnpm validate --deploy <folder>` before every upload. Replace the EIC codes and centroids in zones (they are approximate). Net the two ENTSO-E directions of each border into one series. Aggregate 15-minute data to hourly averages.
- **Sessions B, C:** "planned" in the schema = "planned trade" or "forecast" in the UI. Never say "forecast flow".
- **Schema changes:** follow `schema/README.md` → "Changing the schema". One session at a time.

## Open questions for Daniel

1. ~~License of our own output files~~ Decided: the repo license, AGPL-3.0 (`"license": "AGPL-3.0-only"`). Fixtures use it too. [Unverified] The ENTSO-E terms check can still add attribution or reuse conditions for files built from ENTSO-E data.
2. **Interconnector capacity** (NTC) for the calculator ("how close interconnectors come to capacity"). No file holds it yet. Proposal: add `v1/capacity/...` in a later schema version when session B needs it.
3. **Emission factors per fuel** for the calculator's carbon intensity. Not in the schema. Proposal: a constant with its source in the calculator, or a small `v1/meta/emission-factors.json`.
4. **EIC codes** in the fixtures are from memory. [Unverified] Session A checks them against ENTSO-E.
5. **Fixture sizes** are from random mock data; real data may compress better or worse. [Estimate]

| Fixture file | Raw | Gzip |
|---|---|---|
| `meta/zones.json` | 3.7 KB | 0.8 KB |
| `meta/status.json` | 2.0 KB | 0.4 KB |
| `flows/rolling-7d.json` | 81 KB | 11 KB |
| `flows/rolling-30d.json` | 307 KB | 40 KB |
| `generation/rolling-7d.json` | 265 KB | 31 KB |
| `generation/rolling-30d.json` | 1,077 KB | 117 KB |
| `forecasts/next-24h.json` | 20 KB | 2.4 KB |
| `datacenters/datacenters.json` | 3.4 KB | 0.7 KB |
