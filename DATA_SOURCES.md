# Data sources

Register of every data source: what it gives, its license, the attribution text and the date it was pulled. Keep it up to date when a source is added or pulled again.

| Source                                                                        | Used for                                                         | License                                                                   | Attribution text                                                   | Date pulled         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| powerstation.ai mock data generator (`pipeline/scripts/generate-fixtures.ts`) | `fixtures/` only. Not real data, never deployed.                 | AGPL-3.0-only                                                             | "Mock data for development and tests. This is not real grid data." | Generated on demand |
| ENTSO-E Transparency Platform                                                 | Flows, scheduled exchanges, generation, load, forecasts (Europe) | [Unverified] Terms not checked yet. Must be checked before public launch. | To be set by session A                                             | Not pulled yet      |
| Data center source (e.g. Epoch AI, OSM)                                       | `v1/datacenters/datacenters.json`                                | Per source: Epoch AI CC BY; OSM ODbL [Unverified]                         | To be set                                                          | Not pulled yet      |

Files that powerstation.ai writes (status, zones, flows, generation, forecasts, data centers, fixtures) use the repo license, AGPL-3.0. Each file still names its upstream source in `source` and `attribution`.

Do not use: WRI Global Power Plant Database (unmaintained), PeeringDB, Electricity Maps API, or any paid dataset.
