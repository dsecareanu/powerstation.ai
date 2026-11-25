# Pipeline (`@powerstation/pipeline`)

Scripts that build the data files for powerstation.ai. The files follow the contract in `/schema`.

## Scripts

| Script                  | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `pnpm fixtures`         | Writes mock data to `/fixtures`. Every file has `mock: true`.                        |
| `pnpm discover-borders` | Asks ENTSO-E which zone pairs have physical flows. Writes `reference/borders.json`.  |
| `pnpm backfill`         | Fetches ENTSO-E data, builds the `v1/...` files, checks them. Can upload them to R2. |
| `pnpm run update`       | Fetches recent ENTSO-E data and merges it into the rolling files from R2. No upload. |
| `pnpm upload <dir>`     | Checks the files in `<dir>/v1` and uploads them to R2. `status.json` goes last.      |
| `pnpm test`             | Runs the tests. They use synthetic XML only and need no network.                     |

Run the scripts from `/pipeline`, or with `pnpm --filter @powerstation/pipeline <script>` from the root.

## Environment variables

Put them in `pipeline/.env` (git-ignored) or export them. Never commit them.

| Variable                       | Needed for                                           |
| ------------------------------ | ---------------------------------------------------- |
| `ENTSOE_TOKEN`                 | `discover-borders` and `backfill`                    |
| `R2_ACCOUNT_ID`                | `backfill --upload`                                  |
| `R2_ACCESS_KEY_ID`             | `backfill --upload`                                  |
| `R2_SECRET_ACCESS_KEY`         | `backfill --upload`                                  |
| `R2_BUCKET`                    | `backfill --upload`                                  |
| `ENTSOE_RESTRICTED_PUBLISH_OK` | `backfill --upload --include-restricted` (see below) |

## Discover borders

1. Run `pnpm discover-borders`.
2. Wait about 7 minutes. It sends about 2,350 requests.
3. Check `reference/borders.json` and the list of zones without flows.

The script is resumable. It saves each finished pair in `out/discover-cache.json`. After a crash or a 429, run it again. A cache older than 24 hours is ignored. Use `--fresh` to ignore the cache at once.

## Backfill

```sh
# Build files locally. Nothing leaves the machine.
pnpm backfill

# Same, with a fixed time (for tests).
pnpm backfill --now 2026-11-25T12:00:00Z

# Build, check and upload open data to R2.
pnpm backfill --upload
```

Flags:

- `--now <ISO>`: use this time as "now". It is floored to the hour. Default: the current time.
- `--days <n>`: how many days to go back, 1 to 32. Default: 30. The 7-day files are cut from the same data.
- `--include-restricted`: also fetch restricted data. See below. Default: off.
- `--upload`: upload the checked files to R2. Default: off.
- `--out <dir>`: output folder. Default: `pipeline/out`.

Files go to `out/<run time>/v1/...`. The run also writes `out/<run time>/warnings.json`. The folder is git-ignored. Do not commit it.

The script prints a size table and a list of warnings. A border with one unpublished direction is on that list. Its flow uses the other direction alone.

Every file is checked with `validateDataFile` and `checkZoneReferences`. A file with `mock` not `false` fails. If any check fails, nothing is uploaded.

`status.json` is uploaded last.

## Restricted data

ENTSO-E allows us to publish only some data items now:

- Open: physical flows, forecasted transfer capacity, day-ahead load forecast.
- Restricted: actual generation, actual load, scheduled exchanges, wind and solar forecasts.

We wait for written permission from ENTSO-E for the restricted items. So:

- Without `--include-restricted`, the script does not query them. It writes no generation files. The flows files have only `physical` series. The forecasts file has load only.
- With `--include-restricted`, the script writes everything locally. This is for tests and for the app work.
- `--upload` together with `--include-restricted` fails, unless `ENTSOE_RESTRICTED_PUBLISH_OK=yes` is set. Set it only after the permission is recorded.

## Hourly job (GitHub Actions)

The workflow `.github/workflows/data-hourly.yml` updates the data on R2 every hour. It runs at minute 17. You can also start it by hand (`workflow_dispatch`, input `recent_hours`, default 48).

The job runs in the GitHub environment `data-publish`. Only one run at a time is allowed. A run that is already going is not cancelled.

Steps of one run:

1. Check out the code and install the packages.
2. `pnpm --filter @powerstation/pipeline run update`: download the current 30-day files from R2. Fetch the last `recent_hours` hours from ENTSO-E. Merge them into the old files. Write the result to `pipeline/out/run/v1/...`. This step does not upload.
3. `pnpm validate --deploy pipeline/out/run/v1`: check every file against the schema. A file with `mock: true` fails. If a check fails, the run stops and nothing is uploaded.
4. `pnpm --filter @powerstation/pipeline run upload pipeline/out/run`: check the content again, then upload every `v1/**/*.json` file. `status.json` goes last.

Secrets (set them in the environment `data-publish`): `ENTSOE_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. If one is missing, the step stops with one line for each missing secret.

The workflow does not set `ENTSOE_RESTRICTED_PUBLISH_OK`. It does not pass `--include-restricted`. So it publishes open data only. The upload script also checks the file content. It refuses a flows file with a `scheduled` series, a `generation` file, and a forecasts file with wind or solar data. It refuses a file with `mock` not `false`.

Merge rule, for each hour of the new 30-day window:

- A new value wins.
- If the new value is missing and the old value exists, the old value stays, with its state.
- Otherwise the hour is `missing`.
- Hours older than the window are dropped.
- A series that is in the old file but not in the new data stays. It may only be late. If it has no value left in the window, it is dropped.
- `forecasts/next-24h.json` and `zones.json` are always new. The 7-day files are cut from the merged 30-day files. `status.json` is made again from the merged files.

If a 30-day file is absent on R2, or it has another `schema_version`, or it fails the schema check, the update ignores it. It then fetches all 30 days for that dataset.

Run the update on your machine (no upload):

```sh
pnpm --filter @powerstation/pipeline run update --out pipeline/out/run
pnpm validate --deploy pipeline/out/run/v1
```

Use `pnpm run update`. The short form `pnpm update` is a different pnpm command.

## Setup (Daniel)

## Rate limits

ENTSO-E allows 400 requests per minute per token. The client stays below this: at most 6 requests per second and 350 per minute.

- HTTP 429 (the token is banned for about 10 minutes): the client waits 11 minutes and tries again, 2 times at most.
- HTTP 5xx or a network error: the client tries again 3 times, after 2 s, 8 s and 30 s.
- HTTP 401: the token is wrong. The script stops.
- HTTP 400: the script stops and prints the reason from ENTSO-E.
- "No data" (HTTP 200, reason code 999) is not an error. The series is empty.

The token is never printed.

## Data rules

- Every value has one state: `measured`, `planned` or `missing`. This pipeline makes no `modelled` values.
- Hourly values are averages. An hour is valid only if all its sub-steps have a value. Values are rounded to whole MW.
- Border flows are netted: positive means from the zone that comes first in the alphabet to the other.
- Capacity is not netted. A direction with no data is left out.
