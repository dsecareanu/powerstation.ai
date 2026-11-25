# Session A brief — Data pipeline

Branch: `ws/a-pipeline`. Owns: `/pipeline`, `/n8n`, `/schema`.
Read first: `CLAUDE.md`, `briefs/README.md`, `briefs/session-0-report.md`, `schema/README.md`.

## Goal

Produce real European data files in Cloudflare R2 that follow the schema, refreshed every hour by n8n on n8n.appbuilder.ai.

## Context from the plan

- Source: ENTSO-E Transparency Platform REST API. Free token. Europe only in v1.
- Refresh: every hour for measured data; daily for day-ahead data.
- Visitors never call ENTSO-E. The site reads only the JSON files in R2.
- n8n runs on n8n.appbuilder.ai. The exported workflows are a public template (MIT, in `/n8n`) and a subtle promo for appbuilder.ai, so keep them clean and documented.
- Data-state rule: every value is `measured`, `planned`, `modelled` or `missing`. "Planned" is never "forecast flow".

## Tasks, in order

### 1. Gate: ENTSO-E terms (report before you build anything that publishes)
- Read the ENTSO-E Transparency Platform terms and conditions.
- Answer: may we republish derived data publicly? What attribution is required? Any limits on API calls?
- Write the answer in your report and in `DATA_SOURCES.md`. If the terms block publishing, stop and tell Daniel.

### 2. Schema 1.1.0 (first PR, keep it small)
Session B needs two additions. Follow `schema/README.md` → "Changing the schema".
- **Interconnector capacity:** day-ahead forecasted transfer capacity (NTC) per border and direction, hourly, next 24 h and past 30 days. State: `planned`. Proposal: `v1/capacity/rolling-30d.json`. Add a 7-day file only if size needs it.
- **Emission factors:** `v1/meta/emission-factors.json`, gCO₂/kWh per fuel type in `FUEL_TYPES`, with a cited source per value. Use a recognised life-cycle source (for example IPCC). [Unverified] Do not use values from memory. Cite the document and table.
- Update the fixture generator and fixtures. Bump `SCHEMA_VERSION` to 1.1.0.

### 3. Zone reference data
- Replace the approximate EIC codes and centroids in `zones.json` with checked values. [Unverified] Session 0 wrote them from memory.
- Cover all ENTSO-E bidding zones that publish flows. Keep neighbours symmetric.

### 4. Backfill script (`/pipeline/scripts/backfill.ts`)
- Pulls 30 days of history for all files. Token from an environment variable, never committed.
- Nets the two ENTSO-E directions of each border into one series (positive = `from_zone` → `to_zone`).
- Aggregates 15- and 30-minute data to hourly averages.
- Validates every file with `pnpm validate --deploy` before upload.
- Uploads to R2 through the S3 API.
- Run large backfills here, not in n8n.

### 5. n8n workflows (export JSON to `/n8n`)
1. **Hourly:** physical flows, actual generation per type, actual load. Merge new hours into the rolling files, trim old hours, update `status.json`.
2. **Daily (after day-ahead publication):** scheduled exchanges, capacity, load/wind/solar forecasts. [Unverified] Confirm publication times.
3. **Monthly:** Epoch AI data centers (CC BY), filtered to Europe. Keep each record's source and license.
4. **Failure alert:** notify Daniel when any workflow fails.

Rules:
- [Unverified] Confirm the ENTSO-E document and process type codes for each dataset in the official API guide. Do not guess them.
- **Validate before publish.** Write to a staging prefix, validate, then copy to the public prefix. If the n8n instance cannot run the validator (external modules may be blocked), propose an alternative to Daniel (for example a Cloudflare Worker that validates and promotes). Ask before you build it.
- Never write a file with `"mock": true` to the public prefix.

## What Daniel must do (list these at the start of your session and wait)

1. Register on the ENTSO-E Transparency Platform and request API access. Give you the token (for local backfill) and add it as an n8n credential.
2. Create the R2 bucket, public access on a custom domain (proposal: `data.powerstation.ai`), and CORS for the site domain.
3. Create an R2 API token and add it as an n8n S3 credential.

## Out of scope
- No UI work. No US, no rest of world, no modelling beyond marking gaps `missing`.
- No Electricity Maps parsers.

## Acceptance criteria
- ENTSO-E terms answer recorded.
- Schema 1.1.0 merged, with fixtures and validator tests.
- All files for v1 live in R2 with `"mock": false`, valid against the schema.
- Hourly workflow ran 24 times without error; `status.json` updates each hour.
- Workflow JSON in `/n8n` with a README (setup steps, credentials needed, no secrets).
- Report: `briefs/session-a-report.md`.
