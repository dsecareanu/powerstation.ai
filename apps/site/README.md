# Site (`@powerstation/site`)

The site shell and the build that puts the apps together into one static site. It deploys to the Cloudflare Worker `powerstation-site`, on its preview URL `https://powerstation-site.danielsecareanu.workers.dev` only.

## Routes

| Path           | Page                     | Source            |
| -------------- | ------------------------ | ----------------- |
| `/`            | Map (Step 1: watch)      | `apps/map`        |
| `/calculator/` | Data center calculator   | `apps/calculator` |
| `/about/`      | About and sources        | `pages/about.html` |
| other          | Page not found (`404.html`) | `pages/404.html` |

The build adds the shell (header, footer, demo banner, `/site.css`) to every page after Vite builds the apps. The apps stay unchanged and still run on their own with `pnpm --filter <app> dev`.

## Build

From the repo root:

```sh
pnpm build:site        # production: real data, real clock, no fixtures
pnpm build:site:demo   # demo: mock fixtures, fixed clock, banner on every page
```

Output: `apps/site/dist`.

| Mode       | Data URL                                                    | Clock                              | Banner | Fixtures                    |
| ---------- | ----------------------------------------------------------- | ---------------------------------- | ------ | --------------------------- |
| Production | `VITE_DATA_BASE_URL`, default `https://data.powerstation.ai/` | real                               | no     | none                        |
| Demo       | `/demo-data/` (fixtures copied to `/demo-data/v1/`)         | fixed at `2026-11-25T12:30:00Z`    | yes    | `fixtures/v1`, all `mock: true` |

Demo mode: pass `--demo` or set `VITE_DEMO=1`. Demo pages also carry `<meta name="robots" content="noindex">`.

The build fails when:

- a production build holds `demo-data/`, a JSON file with `"mock": true`, the demo banner text, or the demo clock;
- a demo build has a page without the banner, or no fixtures;
- a page loads more than 200 KB of JS (gzip) at start.

Preview the built site locally: `pnpm --filter @powerstation/site preview` (runs `wrangler dev`, no Cloudflare account needed). Restart it after a new build.

## Styles

Plain layout on the `@powerstation/ui` tokens. A restyle touches only `src/shell.css` (shell), `packages/ui/src/tokens.css` (tokens) and the markup in `src/shell.ts` and `pages/`. No colors or type sizes are set anywhere else in this package.

## Deploy

Workflow: `.github/workflows/deploy-site.yml`.

- Pull requests: build in both modes, Worker guard and `wrangler deploy --dry-run`. No secrets, no upload.
- Push to `main` and **Run workflow**: the same checks, then `wrangler deploy` in the GitHub environment `site-deploy`.
- `wrangler` is pinned in `package.json` and the lockfile (4.164.0).

### Guard

`scripts/check-worker.ts` (also a test) fails unless `wrangler.jsonc`:

- has the name `powerstation-site`;
- has no `routes`, `route`, `env`, `main`, `services` or `durable_objects`;
- has `workers_dev: true` and an `assets.directory`.

The same Cloudflare account hosts the Worker `domain-landers`, which serves 13 domains. Never deploy to it. Never pass `--name` to `wrangler deploy`.

The launch (moving `powerstation.ai` and `www.powerstation.ai` to this Worker) is Daniel's step only, in the Cloudflare dashboard. This config never adds routes or custom domains.

### Setup (Daniel, once)

#### 1. Cloudflare API token

1. In the Cloudflare dashboard, go to **Manage account** > **Account API tokens** and select **Create Token**.
2. Select **Create Custom Token**. Name: `powerstation-site deploy (GitHub Actions)`.
3. Permissions: add one row, **Account** > **Workers Scripts** > **Edit**. Add no zone permissions (the Worker has no routes).
4. Account resources: **Include** > your account only.
5. Optional: under **Client IP Address Filtering**, leave it open (GitHub runners use many IPs). Set a **TTL** if you want the token to expire.
6. Select **Continue to summary**, then **Create Token**. Copy the token now; Cloudflare does not show it again.
7. Copy the account ID: dashboard > **Workers & Pages** > **Account details**.

Limit to know: Cloudflare cannot scope a token to one Worker. This token can edit every Worker in the account, `domain-landers` too. The guard step and the config keep deploys on `powerstation-site`. Keep the token only in the GitHub environment below.

#### 2. GitHub environment `site-deploy`

1. In the repo, go to **Settings** > **Environments** and select **New environment**. Name: `site-deploy`.
2. Under **Deployment branches and tags**, select **Selected branches and tags** and add `main`.
3. Add 2 environment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

If a secret is missing, the deploy job stops with `missing secret <NAME>` and deploys nothing.

#### 3. Data mode: `SITE_DATA_MODE`

1. Go to **Settings** > **Secrets and variables** > **Actions** > **Variables** > **New repository variable**.
2. Name: `SITE_DATA_MODE`. Value: `demo`.
3. When the real data is on `https://data.powerstation.ai`, change it to `live` and run the workflow again.

Unset counts as `demo`. Any other value fails the deploy.

#### 4. First deploy

1. Merge the pull request that adds the workflow.
2. Go to **Actions** > **Deploy site (preview)** > **Run workflow** (or wait for the run on the merge to `main`).
3. Open `https://powerstation-site.danielsecareanu.workers.dev`. Every page shows the demo banner.
