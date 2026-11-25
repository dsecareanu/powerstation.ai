# Session A report — Data pipeline

Date: 2026-11-25. Branch: `ws/a-pipeline`. Schema version: `1.1.0`. Status: in progress (tasks 1 and 2 done).

## Setup note

The session started in the main checkout on `main`, not in a worktree. Other sessions ran in the same folder. To keep them unaffected, I made a separate worktree: `../PowerstationAI-worktrees/ws-a-pipeline` on branch `ws/a-pipeline`, from `origin/main` (`1a6b2f6`).

## Task 1 — ENTSO-E terms (gate)

Full text with quotes and links: `DATA_SOURCES.md` → "ENTSO-E terms (checked 2026-11-25)".

**Result: the terms allow part of v1, and block part of it until Daniel decides.**

- **Free to republish (CC-BY-4.0):** physical flows, day-ahead capacity (NTC), day-ahead load forecast. Conditions: credit the source and say that we changed the data (we net directions and aggregate to hourly).
- **Not on the open-data list:** actual generation per fuel, actual load, wind and solar forecasts, scheduled exchanges ("planned trade"). The Terms of Use say: name the source, and ask the data owner (the TSO) first if republishing risks harm to their copyright.
- **Excluded from the list everywhere:** Moldova, Turkey, and the IFA and Nemo Link interconnectors to Great Britain.
- **API limit:** 400 requests per minute per token; about 10 minutes ban if exceeded. Backfill must throttle to about 6 per second.

[Inference] Many public sites republish ENTSO-E generation and load. That does not show that they have TSO agreement. I did not check this, and it is not a legal opinion.

**Options given to Daniel:**

1. Publish only the open-data items in v1, and leave generation, actual load, wind/solar forecasts and planned trade out. This removes the fuel mix from step 1 and carbon intensity from step 2.
2. Ask ENTSO-E (or the TSOs) for written confirmation that we may republish those 4 items, free and with attribution. Build now, publish those files only after the answer.
3. Use national open sources where they exist for the same data. [Unverified] Some TSOs publish under open licenses. This adds one parser per country.
4. Get a legal opinion that hourly aggregates of these items do not harm the owners' rights, then publish with attribution.

**Decision (Daniel, 2026-11-25): option 2.** Ask ENTSO-E for written permission. Build everything now. Publish the 4 restricted items only after a written yes. Option 1 is the fallback.

My recommendation: option 2 now, with option 1 as the fallback. It keeps all options open. Building and testing need no publishing, so the work can continue. I will not write any of the 4 items to the public prefix until Daniel decides.

**Attribution text proposal** (to confirm): "Source: ENTSO-E Transparency Platform (transparency.entsoe.eu). Hourly averages and netted border flows computed by powerstation.ai. Licensed CC BY 4.0 where ENTSO-E lists the data as open data." No ENTSO-E logo, and no wording that suggests endorsement (Terms of Use 3.1).

**Standing rule (Daniel, via the orchestrator, 2026-11-25):** until ENTSO-E answers the permission request, publish none of the 4 non-open datasets (generation per fuel, actual load, wind/solar forecasts, planned trade). Publish means: no upload to R2, no committed real-data files, no public URL. Code for them may be built and tested with fixtures or local, uncommitted runs only. The backfill has a gate for this (`--include-restricted` off by default; upload of restricted data also needs `ENTSOE_RESTRICTED_PUBLISH_OK=yes`).

**Eurostat check (requested by session D):** the Eurostat copyright notice allows non-commercial reuse without restriction. The commercial-use limit covers data for countries outside the EU, EFTA and official candidate countries. BA, MK, RS and TR are candidates and NO is EFTA. [Inference] powerstation.ai is free and non-commercial, so the household table is fine.

## Task 2 — Schema 1.1.0

New files:

| Path | `dataset` | Content |
| --- | --- | --- |
| `v1/capacity/rolling-30d.json` | `capacity` | Day-ahead NTC per border and direction, hourly, 30 days back to 24 h ahead. States `planned` / `missing`. |
| `v1/meta/emission-factors.json` | `emission_factors` | Life-cycle gCO2eq/kWh for each of the 16 fuel types, each with source, table and row. |

Decisions:

- **Capacity is per direction, not netted.** NTC differs by direction. A border has up to two entries. A direction with no published capacity is left out. Values must be 0 or more (validator check).
- **No 7-day capacity file.** [Estimate] The 30-day fixture is 36 KB gzipped for 27 directions. With ~40 real zones it may be ~150 KB. Load it only for the calculator. Add a 7-day file if real sizes need it.
- **Emission factor `match`:** `direct` (the cited row is this fuel), `proxy` (similar technology, `note` required), `none` (no factor; value and citation are `null`, `note` required). The validator checks these rules and that `source_id` exists in `sources`.
- **Fixture values** come from IPCC AR5 WGIII Annex III, Table A.III.2, life-cycle median column. I read them from the PDF on 2026-11-25. The file is still `mock: true`.
- `status.json` and the envelope `dataset` enum accept the two new datasets. `DATA_PATHS` has `capacity30d` and `emissionFactors`.
- New fixtures were generated after all others, so the old fixtures changed only in `schema_version`.
- 12 new validator tests (24 in total).

Open decision for the real emission-factor file: IPCC Table A.III.2 has no row for lignite, oil, waste, pumped storage, "other renewable" or "other". The fixture uses: lignite = proxy "Coal — PC" (820); gas = proxy "Gas — Combined Cycle" (490); solar = proxy "Solar PV — utility" (48); oil, waste, other_renewable, other, hydro_pumped_storage = `none`. Lignite is a large share in DE, PL and CZ. A second cited source for lignite and oil would make carbon intensity better. Daniel or session B to decide.

**Decision (Daniel, 2026-11-25):** lignite uses the hard-coal row ("Coal — PC", 820) as a proxy, as in the fixture. Oil stays `none`.

## What other sessions must know

- **Session B (calculator):** rebase on this PR. Handle `match: "none"` (no factor: show it, do not count it as 0). Capacity is directional: use the entry whose `from_zone` is the exporting zone.
- **Session B:** [Unverified] Borders inside the Core flow-based region (for example DE-LU–FR, DE-LU–NL, AT–HU) may have no day-ahead NTC since flow-based market coupling started. Real capacity files may have many directions left out. Design the "close to capacity" view to work without capacity.
- **Sessions B and C:** generation, actual load, wind/solar forecasts and planned trade may not be published in v1 (see task 1). Keep the UI working when those files are absent.

## What Daniel must do

1. Decide on task 1 (options 1–4 above).
2. Register on the ENTSO-E Transparency Platform and request API access. Give me the token for local runs (I keep it in `pipeline/.env`, which git ignores). Add it as a secret in the GitHub environment `data-publish`.
3. Create the R2 bucket, public access on a custom domain (proposal: `data.powerstation.ai`) and CORS for the site domain.
4. Create an R2 API token and add it as secrets in the GitHub environment `data-publish` (see `pipeline/README.md`, Setup).
5. ~~Merge the schema 1.1.0 PR~~ Done: PR #2 merged.
6. Decide whether Epoch AI "AI supercomputers" is the right data-center source (see task 5).
7. Decide on session C's request: an optional `centroid` on `countries[]` in zones.json (schema change, not built).

## Status of tasks 3, 4 and 5 (branch `ws/a-zones`)

- **Task 3, zones:** `pipeline/reference/zones.ts` (49 candidate zones; EIC codes from the ENTSO-E area list, updated 2026-09-21). `pipeline/reference/centroids.json` and `zone-shapes.json` (Natural Earth v5.1.2; shapes only for countries with several zones). `pipeline/src/zones.ts` builds zones.json. Neighbours come from `scripts/discover-borders.ts` (real data, not memory). It needs the ENTSO-E token, so `pipeline/reference/borders.json` does not exist yet.
- **Task 4, backfill:** `scripts/backfill.ts`, ENTSO-E client (≤ 6 requests/s, ≤ 350/min, 429 wait), XML parser (curve types A01 and A03, gaps), hourly averages (an hour needs all sub-steps), netting, fuel mapping, R2 upload. Tests use synthetic XML only.
- **Task 5, scheduled jobs (replaces n8n, Daniel 2026-11-25):**
  - `.github/workflows/data-hourly.yml`: minute 17 every hour and manual runs. It fetches the last 48 h plus 24 h ahead, merges them into the rolling files on R2, validates with `--deploy` and uploads. `status.json` goes last. A first run with no files on R2 fetches 30 days.
  - `.github/workflows/data-monthly.yml`: day 3 of each month at 04:41 UTC and manual runs. It builds `datacenters.json` from Epoch AI "AI supercomputers" (CC BY 4.0). Epoch's "AI data centers" CSV has no coordinates and only about 7 European sites, so it is not used. [Inference] The 53 European sites (local check, not committed) are AI supercomputers of 0.2–23 MW, not 1 GW campuses. Session B must not present them as large data centers.
  - Both jobs keep each other's entries in `status.json` (`mergeStatus`).
  - Restricted gate: the workflows never set `ENTSOE_RESTRICTED_PUBLISH_OK`. `upload.ts` checks the content and refuses scheduled flows, generation files, wind/solar forecasts and mock files.
  - Setup steps for Daniel: `pipeline/README.md` → "Setup (Daniel)". It covers the GitHub facts checked on the live docs: schedules run only on the default branch, delays at the start of the hour, the 60-day stop in public repos and how to re-enable, and who gets failure emails.
- **Not verified (no secrets yet):** real ENTSO-E responses, R2 upload and download, a GitHub run with the `data-publish` environment.
