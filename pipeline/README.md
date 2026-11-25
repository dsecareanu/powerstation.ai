# Pipeline (`@powerstation/pipeline`)

Scripts that build the data files for powerstation.ai. The files follow the contract in `/schema`.

## Scripts

| Script                  | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `pnpm fixtures`         | Writes mock data to `/fixtures`. Every file has `mock: true`.                        |
| `pnpm discover-borders` | Asks ENTSO-E which zone pairs have physical flows. Writes `reference/borders.json`.  |
| `pnpm backfill`         | Fetches ENTSO-E data, builds the `v1/...` files, checks them. Can upload them to R2. |
| `pnpm run update`       | Fetches recent ENTSO-E data and merges it into the rolling files from R2. No upload. |
| `pnpm news --out <dir>` | Reads public news feeds and writes `v1/meta/news.json` (headlines only). No secrets. |
| `pnpm upload <dir>`     | Checks the files in `<dir>/v1` and uploads them to R2. `status.json` goes last.      |
| `pnpm test`             | Runs the tests. They use synthetic XML only and need no network.                     |

Run the scripts from `/pipeline`, or with `pnpm --filter @powerstation/pipeline <script>` from the root.

## Environment variables

The secrets (`ENTSOE_TOKEN` and the R2 variables) live only in the GitHub environment `data-publish` (see `CLAUDE.md`). The scripts read them there, in GitHub Actions. Do not keep these tokens on a laptop. The scripts can also read `pipeline/.env` (git-ignored); that is only for tests without real tokens.

| Variable                       | Needed for                                           |
| ------------------------------ | ---------------------------------------------------- |
| `ENTSOE_TOKEN`                 | `discover-borders` and `backfill`                    |
| `R2_ACCOUNT_ID`                | `backfill --upload`                                  |
| `R2_ACCESS_KEY_ID`             | `backfill --upload`                                  |
| `R2_SECRET_ACCESS_KEY`         | `backfill --upload`                                  |
| `R2_BUCKET`                    | `backfill --upload`                                  |
| `ENTSOE_RESTRICTED_PUBLISH_OK` | `backfill --upload --include-restricted` (see below) |

## Discover borders

Run it in GitHub Actions, not on a laptop (the token lives only in GitHub):

1. Go to **Actions** > **Discover borders** > **Run workflow**.
2. Wait about 20 to 70 minutes. It sends about 2,350 requests. The log lists the zones without flows.
3. The workflow commits `pipeline/reference/borders.json` to a branch `data/borders-<run id>` and opens a pull request to `main`. If `borders.json` did not change, it stops without a branch.
4. Review the pull request. GitHub does not start CI by itself on a pull request that a workflow opened: select **Approve workflows to run** in the pull request. Then merge it as usual.
5. If the run summary says it could not open the pull request, turn on **Settings** > **Actions** > **General** > **Allow GitHub Actions to create and approve pull requests**, or open the pull request with the link in the summary.

The script is resumable. It saves each finished pair in `out/discover-cache.json`. After a crash or a 429, run it again. A cache older than 24 hours is ignored. Use `--fresh` to ignore the cache at once.

The script sends up to 3 requests at the same time (`--concurrency <n>`). The client limit is 2 per second and 120 per minute. The log shows a progress line every 100 pairs, with the request rate over the last minute, and a heartbeat line after 60 s without output. After a second HTTP 429 the script stops with exit code 2 and keeps the cache. In GitHub Actions, the workflow saves the cache with `actions/cache` (one key per UTC day), also when a run fails or is cancelled. A rerun on the same UTC day resumes from it.

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

## News job (GitHub Actions)

The workflow `.github/workflows/data-news.yml` runs every 3 hours at minute 23, and by hand (`workflow_dispatch`). It reads the feeds in `src/news.ts` and uploads only `v1/meta/news.json`. It does not touch `status.json` or the other files.

- It keeps headlines whose title matches the keyword list: at most 2 per publisher and 8 in total, newest first, no duplicate titles, not older than 30 days.
- It stores only the title, the link, the publisher name and the date. Never article text or images.
- A feed that fails is skipped. With zero matching headlines, nothing is uploaded and the previous file stays.
- It uses its own concurrency group (`data-news`), so a queued news run never replaces a queued hourly run.

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

Do these steps once, in this order. Sources: ENTSO-E help page "How to get security token?" (updated 2026-11-25); Cloudflare R2 docs (public buckets, CORS, S3 API tokens); GitHub Actions docs (schedule, disabling and enabling a workflow, notifications). All checked 2026-11-25.

### 1. ENTSO-E token

1. Go to https://transparency.entsoe.eu/ and select **Sign In**, then **Register**.
2. Confirm the account with the link in the email.
3. Send an email to transparency@entsoe.eu. Subject: `RESTful API access`. Body: the email address of the account.
4. Wait for the confirmation email. ENTSO-E says this takes up to 3 working days.
5. Sign in, open **My Account** and select **Generate a new token**.
6. Keep the token secret. Do not put it in the repo.

### 2. Find the borders (once, in GitHub Actions)

Do this after step 5 (the environment and its secrets exist).

1. Go to **Actions** > **Discover borders** > **Run workflow**.
2. Review the pull request it opens. It holds only zone pairs and hour counts of open data (physical flows). Select **Approve workflows to run** so that CI runs, then merge it.
3. Details and the fallback if no pull request opens: see "Discover borders" above.

The hourly job stops with a clear error until `borders.json` is on `main`.

### 3. R2 bucket

Deploy plan (Daniel, 2026-11-25):

| Item                  | Value                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Bucket                | `powerstation-data`                                                                                             |
| Public access         | custom domain `data.powerstation.ai` only                                                                       |
| CORS                  | `GET` (and `HEAD`) from `https://powerstation.ai` and `https://powerstation-site.danielsecareanu.workers.dev`   |
| Base URL for the apps | `https://data.powerstation.ai` (paths `v1/...`, for example `https://data.powerstation.ai/v1/meta/status.json`) |

R2 is not enabled on the Cloudflare account yet (API error 403, code 10042). Enable R2 first: dashboard > **R2 object storage** > follow the steps to turn it on.

1. In the Cloudflare dashboard, go to **R2 object storage** and select **Create bucket**. Name: `powerstation-data`.
2. Open the bucket, select **Settings**. Under **Custom Domains**, select **Add**. Enter `data.powerstation.ai`. The domain must be a zone in the same Cloudflare account. Wait until the status is **Active**.
3. Do not turn on the public development URL (`r2.dev`). It is rate-limited and for tests only.
4. Under **CORS Policy**, select **Add CORS policy**. On the **JSON** tab, paste this policy:

   ```json
   [
     {
       "AllowedOrigins": [
         "https://powerstation.ai",
         "https://powerstation-site.danielsecareanu.workers.dev"
       ],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add `http://localhost:5173` only if you want the local dev server to read live data.

5. Everything in this bucket is public through the custom domain. Put nothing else in it.

### 4. R2 API token

1. Go to **R2 object storage** > **Overview**. Next to **API Tokens**, select **Manage**.
2. Select **Create Account API token**.
3. Permission: **Object Read & Write**. Select **Apply to specific buckets only** and select the data bucket.
4. Select **Create API Token**. Copy the **Access Key ID** and the **Secret Access Key** now; Cloudflare does not show the secret again.
5. Copy your account ID. It is the first part of the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 5. GitHub environment and secrets

1. In the repo, go to **Settings** > **Environments** and select **New environment**. Name: `data-publish`.
2. Optional: under **Deployment branches and tags**, allow only `main`.
3. Add 5 environment secrets: `ENTSOE_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
4. Do not add `ENTSOE_RESTRICTED_PUBLISH_OK`. It stays unset until ENTSO-E gives written permission.

### 6. First run

1. Merge the pull request that adds the workflows. GitHub runs scheduled workflows only from the default branch, and the **Run workflow** button shows only for workflow files on the default branch.
2. Go to **Actions** > **Hourly data update** > **Run workflow**. The first run finds no files on R2, so it fetches 30 days. This takes a few minutes.
3. Check the run log. If a secret is missing, the log says `Missing secret <NAME> (add it to the GitHub environment "data-publish")` and nothing is uploaded.
4. Open `https://<data domain>/v1/meta/status.json` in a browser.
5. Go to **Actions** > **Monthly data-center update** > **Run workflow**. It needs the `zones.json` that the hourly run wrote.

### Things to know about GitHub Actions

- **Delays:** GitHub can delay scheduled runs at busy times, mostly at the start of each hour, and can drop some. The job runs at minute 17 to lower this risk. The site shows "data delayed" when the newest data is more than 2 hours old.
- **60-day stop:** in a public repository, GitHub disables scheduled workflows when the repository has no activity for 60 days. To start them again: **Actions** > select the workflow > **Enable workflow**, or run `gh workflow enable data-hourly.yml` (and `data-monthly.yml`).
- **Failure emails:** GitHub sends notifications for scheduled workflows to the user who created the workflow. If another user changes the `cron` line, that user gets them. If a user enables a disabled workflow again, that user gets them.
- **Public signal:** the "data delayed" banner on the site is the public sign that the job has stopped.
- **Overlap:** both workflows use the concurrency group `data-publish`, so they never write to R2 at the same time.

## Rate limits

ENTSO-E allows 400 requests per minute per token ([API Rate Limit](https://transparencyplatform.zendesk.com/hc/en-us/articles/12783148966036-API-Rate-Limit-Part-1)). [Unverified] The limit may also count per IP, and GitHub runner IPs are shared. The client uses 30% of the token limit: at most 2 requests per second and 120 per minute, in every job (discover, backfill, hourly update). The `maxPerSecond` and `maxPerMinute` client options change this.

- HTTP 429 (the token is banned for about 10 minutes): all requests of the client pause for 11 minutes, then continue. Requests already in flight that also get 429 count as the same ban. A second ban stops the client: no more requests are sent, and the script fails.
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
