# Data sources

Register of every data source: what it gives, its license, the attribution text and the date it was pulled. Keep it up to date when a source is added or pulled again.

| Source                                                                                                                                         | Used for                                                                                                                                              | License                                                                                                                                                              | Attribution text                                                                                                                              | Date pulled                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| powerstation.ai mock data generator (`pipeline/scripts/generate-fixtures.ts`)                                                                  | `fixtures/` only. Not real data, never deployed.                                                                                                      | AGPL-3.0-only                                                                                                                                                        | "Mock data for development and tests. This is not real grid data."                                                                            | Generated on demand                                                 |
| ENTSO-E Transparency Platform                                                                                                                  | Flows, scheduled exchanges, capacity, generation, load, forecasts (Europe)                                                                            | Mixed. CC-BY-4.0 only for items on ENTSO-E's open-data list. Other items: ENTSO-E Terms of Use, which ask for the data owner's agreement. See "ENTSO-E terms" below. | "Source: ENTSO-E Transparency Platform" (exact text to confirm, see below)                                                                    | Not pulled yet                                                      |
| IPCC AR5 WGIII Annex III, Table A.III.2 (2014), https://www.ipcc.ch/site/assets/uploads/2018/02/ipcc_wg3_ar5_annex-iii.pdf                     | Life-cycle emission factors, `v1/meta/emission-factors.json` (median column)                                                                          | [Unverified] No open license stated for reuse of the numbers. We cite the figures; we do not copy the document.                                                      | "Emission factors: IPCC AR5 WGIII Annex III, Table A.III.2 (2014), life-cycle medians."                                                       | 2026-11-25 (values read from the PDF; used in fixtures only so far) |
| Natural Earth, Admin 0 – Countries, 1:50m (v5.1.x; GitHub `nvkelso/natural-earth-vector`, commit `9380cca`), https://www.naturalearthdata.com/ | Country shapes for the map (`apps/map/public/countries.geojson`: clipped to Europe and simplified; built by `pnpm --filter @powerstation/map shapes`) | Public domain. No warranty.                                                                                                                                          | "Made with Natural Earth." (optional). The map's attribution panel shows "Country shapes: Natural Earth 1:50m admin-0 countries, simplified." | 2026-11-25                                                          |
| Data center source (e.g. Epoch AI, OSM)                                                                                                        | `v1/datacenters/datacenters.json`                                                                                                                     | Per source: Epoch AI CC BY; OSM ODbL [Unverified]                                                                                                                    | To be set                                                                                                                                     | Not pulled yet                                                      |

Files that powerstation.ai writes (status, zones, flows, generation, forecasts, data centers, fixtures) use the repo license, AGPL-3.0. Each file still names its upstream source in `source` and `attribution`.

Do not use: WRI Global Power Plant Database (unmaintained), PeeringDB, Electricity Maps API, or any paid dataset.

## ENTSO-E terms (checked 2026-11-25)

Documents read (all linked from the Transparency Platform help page "Legal Terms and Conditions", updated 2026-11-22, https://transparencyplatform.zendesk.com/hc/en-us/articles/40921911218961-Legal-Terms-and-Conditions):

- "General Terms and Conditions for the use of the ENTSO-E Transparency Platform", approved 29 March 2023, applicable from 1 November 2023 (the "Terms of Use").
- "List of data available for free re-use", last modified 18 October 2023 (the "open-data list").
- "API Rate Limit Part 1", updated 2026-10-08, https://transparencyplatform.zendesk.com/hc/en-us/articles/12783148966036-API-Rate-Limit-Part-1

### What the open-data list allows

Quote: "Data Users may freely copy, redistribute, and adapt the listed data for any purpose, by giving appropriate credit (attribution) to its source and indicating if they have made any changes, with no need to seek for the prior agreement of the respective Primary Owner of Data." License: CC-BY-4.0.

Not covered by the list: all data from Moldova (MD) and Turkey (TR); some balancing items from Ukraine and BritNed; all data from the IFA (France–Great Britain) and Nemo Link (Belgium–Great Britain) interconnectors.

### Our datasets against the list

| Our dataset                                       | ENTSO-E data item (Transparency Regulation article)       | On the open-data list?                                                       |
| ------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Physical flows (`flows`, `kind: physical`)        | Physical flows (12.1.g)                                   | Yes, CC-BY-4.0                                                               |
| Capacity (`capacity`)                             | Forecasted cross-zonal capacity, day-ahead (11.1.a)       | Yes, CC-BY-4.0                                                               |
| Load forecast (`forecasts.load`)                  | Day-ahead forecast of the total load (6.1.b)              | Yes, CC-BY-4.0                                                               |
| Scheduled exchanges (`flows`, `kind: scheduled`)  | Scheduled day-ahead commercial exchanges (12.1.f)         | **No.** It was on the 2019 list; the 2020, 2022 and 2023 lists leave it out. |
| Actual load (`generation.load`)                   | Actual total load (6.1.a)                                 | **No**                                                                       |
| Generation per fuel (`generation`)                | Actual generation per production type (16.1.b and c)      | **No**                                                                       |
| Wind and solar forecasts (`forecasts.generation`) | Day-ahead generation forecast for wind and solar (14.1.d) | **No**                                                                       |

### What the Terms of Use say for data not on the list

Clause 3.1: the Data User must "mention the ENTSO-E Transparency Platform as the source of publication of the data", must not use the ENTSO-E name in a way that suggests sponsorship or endorsement, and must "not cause prejudice to the copyright or related right on a Transparency Platform Data, which may be owned by the concerned Primary Owner of Data. In case of a risk to cause prejudice to said right, the Data User shall seek the prior agreement of the holder of the copyright or related right." The user must check the open-data list "before each re-use".

Clause 3.2: ENTSO-E does not check the data for accuracy; the user uses it "under its sole responsibility". Clause 5.3 forbids use that "may cause unjustified damage to the reputation of ENTSO-E, of ENTSO-E members or of a Primary Owner of Data".

### API limits

- 400 requests per minute per API token (not per IP).
- Over the limit, the token can be banned for about 10 minutes.
- Requests from several machines with one token count together.
- ENTSO-E can revoke a misused token. Terms of Use clause 3.3 lets ENTSO-E add technical limits.
