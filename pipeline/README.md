# Pipeline (`@powerstation/pipeline`)

Scripts that build the data files for powerstation.ai. The files follow the contract in `/schema`.

## Scripts

| Script                  | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `pnpm fixtures`         | Writes mock data to `/fixtures`. Every file has `mock: true`.                        |
| `pnpm discover-borders` | Asks ENTSO-E which zone pairs have physical flows. Writes `reference/borders.json`.  |
| `pnpm backfill`         | Fetches ENTSO-E data, builds the `v1/...` files, checks them. Can upload them to R2. |
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
