# Session E brief — Site shell, preview deploy, guide

Branch: `ws/e-site`. Read first: `CLAUDE.md`, `briefs/README.md`, the reports of sessions B, C and D, `apps/map/vite.config.ts`, `apps/calculator/vite.config.ts`, `pipeline/README.md`.

## Goal

One deployable static site on the Cloudflare Worker `powerstation-site`, on its preview URL `https://powerstation-site.danielsecareanu.workers.dev` only. Real data is not available yet (ENTSO-E API access pending), so the preview runs on the mock fixtures, clearly labelled as demo data. When real data exists, one build setting switches it to `https://data.powerstation.ai`.

## Owns

- `/apps/site` (new): the site shell and the build that assembles the apps.
- `.github/workflows/deploy-site.yml` (new).
- For this round only, because sessions B, C and D are done: the smallest changes in `apps/map` and `apps/calculator` needed for (a) the base path and (b) the demo mode below. No feature or copy changes there. List every such change in the PR description.
- `packages/ui`: request changes in the PR description; make them only if the orchestrator agrees.

## Part 1 — Site shell and demo build (first PR)

1. Routes: map at `/`, calculator at `/calculator/` (already the calculator link used by the map), "About and sources" at `/about/`. Shared header (logo text "powerstation.ai", links Map, Calculator, Guide, About) and footer (sources credit, AGPL-3.0 code link to the GitHub repo, data licenses). Use `@powerstation/ui` tokens and components.
2. One root command (e.g. `pnpm build:site`) builds both apps and the shell into one output folder.
3. **Demo mode** (build flag, e.g. `VITE_DEMO=1`): copy `fixtures/v1` into the output under `/demo-data/v1/`, point both apps at it, fix the clock to the fixtures' "now" (as dev mode already does), and show a visible banner on every page: "Demo data: these numbers are made up for testing. Real data from ENTSO-E is coming." The banner needs text, not only color. Fixtures must never be in a non-demo build: add a check that fails the build if they are.
4. Production mode (no flag): apps read `VITE_DATA_BASE_URL=https://data.powerstation.ai`, real clock, no fixtures in the output.
5. Budgets: initial JS ≤ 200 KB gzipped per page; test at 375 px; keyboard and focus; `prefers-reduced-motion`.

## Part 2 — Preview deploy (same PR)

1. `apps/site/wrangler.jsonc`: assets-only Worker named `powerstation-site`, `workers_dev: true`, **no routes and no custom domains**. The launch (moving `powerstation.ai` to this Worker) is Daniel's step only.
2. `.github/workflows/deploy-site.yml`: on push to `main` and `workflow_dispatch`. Environment `site-deploy`. Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. `permissions: contents: read`. Build in demo mode while a repo variable `SITE_DATA_MODE` is `demo` (default), production mode when it is `live`. Deploy with `wrangler deploy` (pin the wrangler version in the lockfile).
3. **Guard:** the workflow and the config may only ever deploy the Worker named `powerstation-site`. The same account hosts `domain-landers`, which serves 13 domains. Never touch it. Add a step that fails if the Worker name in the config is anything else.
4. If the secrets are missing, fail with a clear message ("missing secret X"). Do not run a deploy yourself; the orchestrator triggers the first run after merge.
5. Document setup in `apps/site/README.md`: how to create the Cloudflare API token (least privilege), the `site-deploy` environment, and the `SITE_DATA_MODE` variable.

## Part 3 — Guide page (second PR)

1. Source: `~/RevTechAgency/PowerstationAI-site-backup-2026-11-25/rendered/index.html` (the current live page, outside the repo). Port the guide text to `/guide/`.
2. Drop the "domain for sale" banner, the offer form and the HubSpot script. Drop the RSS news feed (it needs a backend; write it in `IDEAS.md`).
3. Edit the copy to the CLAUDE.md writing rules: short sentences, plain English, no political framing, none of the banned words, credit sources by name with links (e.g. IEA "Energy and AI", 2025). Mark figures you could not check `[Unverified]` in the PR description, not in the page. Keep the page title and meta description close to the current ones (search value).
4. Link the guide to the map and the calculator where it fits ("try it with real data").

## Done when

- PR 1: CI passes; `pnpm build:site` works in both modes; the demo build has the banner on every page; the production build has no fixtures; the deploy workflow passes a dry run (`wrangler deploy --dry-run`).
- PR 2: guide page live in the demo build, copy checked against the rules.
- `briefs/session-e-report.md` updated, then report STATUS to the orchestrator. The orchestrator verifies and merges. You do not merge.
