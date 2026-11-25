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
5. Merge the schema 1.1.0 PR (after session D's first PR, as in `briefs/README.md`).

## Status of tasks 3 and 4 (branch `ws/a-zones`, not pushed as a PR)

- Task 3: `pipeline/reference/zones.ts` (49 candidate zones, EIC codes from the ENTSO-E area list, updated 2026-09-21), `pipeline/reference/centroids.json` (Natural Earth v5.1.2), `pipeline/src/zones.ts` (builds zones.json). Neighbours come from `scripts/discover-borders.ts`, which needs the ENTSO-E token.
- Task 4: the backfill subagent stopped on a usage limit. Its unfinished code is in a WIP commit (`198ae00`): ENTSO-E client, XML parser, hourly aggregation, fuel mapping, file builders. Not yet type-checked or tested. To finish: backfill and discover-borders scripts, tests, README.

## Next (offline, no publishing)

- Task 3: check EIC codes and centroids against ENTSO-E reference data; list all bidding zones that publish flows.
- Task 4: backfill script with throttling (≤ 6 requests per second), netting and hourly aggregation; tests on saved sample XML. No upload until the R2 bucket exists and Daniel decides on task 1.
- Task 5 (replaced, Daniel 2026-11-25): no n8n in v1. The hourly job is a scheduled GitHub Actions workflow (`.github/workflows/data-hourly.yml`) that runs the `/pipeline` code. Fallback, only if Actions is unreliable: the same code in a Cloudflare Worker with a Cron Trigger. The monthly data-center job is `.github/workflows/data-monthly.yml`.
