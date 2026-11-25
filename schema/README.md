# Data contract (`@powerstation/schema`)

This folder defines the data files the site reads. It is the contract between the pipeline and the apps.

- `json/*.schema.json`: JSON Schema, draft 2020-12. The source of truth.
- `src/generated.ts`: TypeScript types generated from the schemas. Do not edit by hand.
- `src/index.ts`: types, `SCHEMA_VERSION`, `DATA_PATHS`, `FUEL_TYPES`, `DATA_DELAYED_AFTER_HOURS`.
- `src/validate.ts`: `validateDataFile()` and `checkZoneReferences()`. Works in Node and in the browser.

## Files

Paths are relative to the public R2 base URL. Every file has `dataset`, which selects its schema.

| Path                              | `dataset`     | Content                                                                       |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| `v1/meta/status.json`             | `status`      | Last update per file and per source. Drives "data delayed".                   |
| `v1/meta/zones.json`              | `zones`       | Bidding zones, countries and the mapping between them; centroids; neighbours. |
| `v1/flows/rolling-7d.json`        | `flows`       | Hourly border flows: 7 days back to 24 h ahead.                               |
| `v1/flows/rolling-30d.json`       | `flows`       | Same, 30 days back. Load only on the 30-day toggle.                           |
| `v1/generation/rolling-7d.json`   | `generation`  | Hourly actual generation by fuel and actual load per zone, 7 days back.       |
| `v1/generation/rolling-30d.json`  | `generation`  | Same, 30 days back.                                                           |
| `v1/forecasts/next-24h.json`      | `forecasts`   | Day-ahead load, wind and solar forecasts per zone.                            |
| `v1/datacenters/datacenters.json` | `datacenters` | Data center points. Each record has its own source and license.               |

## Rules

**Every file** has `schema_version`, `dataset`, `generated_at`, `mock`, `source`, `license`, `attribution` (and optional `source_url`).

**Time series** are columnar:

```json
{
  "start": "2026-11-18T12:00:00Z",
  "resolution": "PT1H",
  "unit": "MW",
  "values": [812, null, 790],
  "states": ["measured", "missing", "measured"]
}
```

- Value `i` covers `[start + i h, start + (i+1) h)`. Times are UTC. Convert to local time only in the UI.
- `values` and `states` have the same length.
- `null` has state `missing`, and `missing` has value `null`.
- Any `modelled` value needs a `method` on the series.
- Power is MW, as the hourly average. v1 publishes `PT1H` only; the pipeline aggregates 15- and 30-minute source data.

**Allowed states per series:**

| Series                                             | States                      |
| -------------------------------------------------- | --------------------------- |
| Flows, `kind: physical`                            | measured, modelled, missing |
| Flows, `kind: scheduled` (show as "planned trade") | planned, missing            |
| Generation and load                                | measured, modelled, missing |
| Forecasts                                          | planned, missing            |

**Flows:** each border appears once per kind, in one direction. Positive = net flow from `from_zone` to `to_zone`; negative = the other way. The physical series ends at the newest measured hour; the scheduled series continues 24 h ahead. Both borders' zones must be neighbours in `zones.json`.

**Zones:** data is stored per ENTSO-E bidding zone (`DE-LU`, `IT-North`, `NO1`). The UI shows countries. `zones[].countries` and `countries[].zones` give the mapping both ways. `neighbours` lists only zones in the file and must be symmetric.

**Leaving things out:** a fuel type or forecast type that a zone does not have is left out of the object. That is not a gap. A gap in a series that exists uses `missing`.

**Mock data:** fixture files have `"mock": true`. `pnpm validate --deploy <folder>` fails on them. The deploy step must run it.

## Changing the schema

Only one session at a time changes the schema.

1. Edit `json/*.schema.json`.
2. Bump `SchemaVersion` in `json/common.schema.json` and `SCHEMA_VERSION` in `src/index.ts`.
3. Run `pnpm schema:types`, `pnpm fixtures`, `pnpm validate:fixtures`, `pnpm test`.
4. Tell Daniel. Other sessions rebase.
