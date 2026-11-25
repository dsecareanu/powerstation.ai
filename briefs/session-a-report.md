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

**Decision for Daniel (blocks publishing of 4 datasets):**

1. Publish only the open-data items in v1, and leave generation, actual load, wind/solar forecasts and planned trade out. This removes the fuel mix from step 1 and carbon intensity from step 2.
2. Ask ENTSO-E (or the TSOs) for written confirmation that we may republish those 4 items, free and with attribution. Build now, publish those files only after the answer.
3. Use national open sources where they exist for the same data. [Unverified] Some TSOs publish under open licenses. This adds one parser per country.
4. Get a legal opinion that hourly aggregates of these items do not harm the owners' rights, then publish with attribution.

My recommendation: option 2 now, with option 1 as the fallback. It keeps all options open. Building and testing need no publishing, so the work can continue. I will not write any of the 4 items to the public prefix until Daniel decides.

**Attribution text proposal** (to confirm): "Source: ENTSO-E Transparency Platform (transparency.entsoe.eu). Hourly averages and netted border flows computed by powerstation.ai. Licensed CC BY 4.0 where ENTSO-E lists the data as open data." No ENTSO-E logo, and no wording that suggests endorsement (Terms of Use 3.1).

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

## What other sessions must know

- **Session B (calculator):** rebase on this PR. Handle `match: "none"` (no factor: show it, do not count it as 0). Capacity is directional: use the entry whose `from_zone` is the exporting zone.
- **Session B:** [Unverified] Borders inside the Core flow-based region (for example DE-LU–FR, DE-LU–NL, AT–HU) may have no day-ahead NTC since flow-based market coupling started. Real capacity files may have many directions left out. Design the "close to capacity" view to work without capacity.
- **Sessions B and C:** generation, actual load, wind/solar forecasts and planned trade may not be published in v1 (see task 1). Keep the UI working when those files are absent.

## What Daniel must do

1. Decide on task 1 (options 1–4 above).
2. Register on the ENTSO-E Transparency Platform and request API access. Give me the token for local backfill (I keep it in `.env`, which git ignores). Add it as an n8n credential.
3. Create the R2 bucket, public access on a custom domain (proposal: `data.powerstation.ai`) and CORS for the site domain.
4. Create an R2 API token and add it as an n8n S3 credential.
5. Merge the schema 1.1.0 PR (after session D's first PR, as in `briefs/README.md`).

## Next (offline, no publishing)

- Task 3: check EIC codes and centroids against ENTSO-E reference data; list all bidding zones that publish flows.
- Task 4: backfill script with throttling (≤ 6 requests per second), netting and hourly aggregation; tests on saved sample XML. No upload until the R2 bucket exists and Daniel decides on task 1.
- Task 5: draft n8n workflow JSON locally in `/n8n`. I will not create or change workflows on the instance without asking.
