# Session 0 brief — Data contract and repo setup

Run this session **alone, before all other sessions**. Sessions A–D depend on its output.

Read first: `CLAUDE.md`, then `powerstation-ai-plan.md` sections 3, 4, 6 and 7.

## Goal

Create the repo skeleton and the data contract (JSON Schema + types + mock data), so sessions A–D can work in parallel without conflicts.

## Already decided

- Repo: https://github.com/dsecareanu/powerstation.ai, default branch `main`. It contains only `LICENSE` (AGPL-3.0). Keep that file.
- Connect the local folder (`~/RevTechAgency/PowerstationAI`) to this repo. The folder already holds `CLAUDE.md`, `powerstation-ai-plan.md` and `briefs/`. Commit them as the first commit on top of the existing `LICENSE`.

- Stack: the defaults in `CLAUDE.md` are confirmed (TypeScript, Vite, MapLibre GL, pnpm).
- Zones: store data by ENTSO-E **bidding zone** (e.g. DE-LU, IT-North, NO1–NO5). Show **countries** in the UI. Include a bidding-zone → country mapping table in `zones.json`.

No questions are open. Start with the deliverables below.

## Deliverables

### 1. Repo skeleton
- Folder structure from `CLAUDE.md`.
- pnpm workspace config, TypeScript config, lint and format config.
- Keep the existing root `LICENSE` (AGPL-3.0). Add `/n8n/LICENSE` with the MIT license text. `README.md` (short: what, why, data sources, how to run), `DATA_SOURCES.md`, `IDEAS.md` (empty).
- CI (GitHub Actions): install, type-check, validate all fixtures against the schema.
- Copy `CLAUDE.md` and `powerstation-ai-plan.md` into the repo root. Put this brief in `/briefs`.

### 2. Data contract in `/schema`
JSON Schema (draft 2020-12) plus generated TypeScript types. Include `schema_version` in every file.

Files and their content (proposal; adjust if you find a better design, and explain why):

| R2 path | Content |
|---|---|
| `v1/meta/status.json` | Last successful update per source, per file. Used for "data delayed". |
| `v1/meta/zones.json` | Zone id, name, country, type (bidding zone/country), centroid lat/lon, neighbours. |
| `v1/flows/rolling-7d.json` | Hourly cross-border flows, last 7 days + next 24 h. |
| `v1/flows/rolling-30d.json` | Same, 30 days back. Loaded only on the 30-day toggle. |
| `v1/generation/rolling-30d.json` | Hourly generation by fuel type and load, per zone. |
| `v1/forecasts/next-24h.json` | Wind/solar generation forecasts and load forecast, per zone. |
| `v1/datacenters/datacenters.json` | Data center points: id, name, operator, lat/lon, zone, power (MW), status, source, license, as-of date. |

Rules for time series:
- Use a compact, columnar format: `start` (UTC ISO 8601), `resolution` (e.g. `PT1H`), then parallel arrays: `values[]` and `states[]`.
- `states[]` uses the enum `measured | planned | modelled | missing`. `null` values must have state `missing`.
- Flows: `from_zone`, `to_zone`, value in MW (hourly average). Positive = from → to. Keep the measured flow and the planned exchange as separate series for the same border.
- Every file: `source`, `license`, `attribution`, `generated_at`, `schema_version`.
- [Unverified] Some ENTSO-E data may come in 15-minute resolution. Support a `resolution` field. Aggregate to hourly in the pipeline, not in the browser.

### 3. Mock data in `/fixtures`
- A generator script in `/pipeline` creates the fixtures, so they can be regenerated.
- Cover at least 8 European zones with real neighbour relations (proposal: DE-LU, FR, NL, BE, PL, CZ, AT, RO, HU, ES, PT).
- 30 days back + 24 h ahead, hourly. Include a day-night solar shape, an evening demand peak, and some `missing` gaps.
- 5–10 mock data centers.
- Every fixture file has `"mock": true`. The deploy step must refuse files with `"mock": true`.

### 4. Validation
- A script that validates any data file against the schema. Used by CI, by session A on real data, and by the apps in development.

## Out of scope
- No UI, no map, no calculator logic.
- No calls to ENTSO-E or any real API.
- No n8n workflows.

## Acceptance criteria
- `pnpm install && pnpm typecheck && pnpm validate:fixtures` passes on a clean clone.
- Every fixture validates against the schema.
- Types import cleanly from `/schema` in an empty test file in `/apps/map` and `/apps/calculator`.
- `README.md` lets a new contributor run the project in under 10 minutes.
- A short `briefs/session-0-report.md` lists decisions taken, open questions and anything that sessions A–D must know.

## Report back to Daniel
- Any change to the proposed file list, with the reason.
- Labels: `[Inference]`, `[Estimate]`, `[Unverified]` where they apply.
