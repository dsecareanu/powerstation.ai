# Session E report — Site shell, preview deploy, guide

Date: 2026-11-25. Branch: `ws/e-site` (PR 1: parts 1 and 2). Part 3 (guide) follows in PR 2 from a new branch after PR 1 merges.

## What exists now (PR 1)

- `apps/site` (`@powerstation/site`): the site shell and the build that assembles the apps into `apps/site/dist`.
  - Routes: map `/`, calculator `/calculator/`, About and sources `/about/`, `404.html` for other paths.
  - Shared header (text logo "powerstation.ai"; links Map, Calculator, About, with `aria-current`) and footer (sources with links and licenses, AGPL-3.0 and GitHub links). Added to every page after Vite builds the apps, so the apps do not change.
  - `pnpm build:site` (production) and `pnpm build:site:demo` (demo) from the root.
- **Demo mode** (`--demo` or `VITE_DEMO=1`): `fixtures/v1` copied to `/demo-data/v1/`; both apps read `/demo-data/`; clock fixed at `2026-11-25T12:30:00Z` through `VITE_FAKE_NOW`; banner on every page: "Demo data: these numbers are made up for testing. Real data from ENTSO-E is coming." (text, `role="note"`); `noindex` meta.
- **Production mode**: `VITE_DATA_BASE_URL` (default `https://data.powerstation.ai/`), real clock. The build fails if `demo-data/`, a JSON file with `"mock": true`, the banner text or the demo clock is in the output, or if `VITE_FAKE_NOW` is set.
- **Budget check** in the build: initial JS per page, gzip, fails over 200 KB. Measured: map 25.2 KB, calculator 21.6 KB, About and 404 0 KB.
- `apps/site/wrangler.jsonc`: assets-only Worker `powerstation-site`, `workers_dev: true`, `preview_urls: false`, no routes, no custom domains, `not_found_handling: 404-page`.
- **Guard** `apps/site/scripts/check-worker.ts` (also a unit test): fails unless the name is `powerstation-site` and there are no `routes`, `route`, `env`, `main`, `services` or `durable_objects`.
- `.github/workflows/deploy-site.yml`: actions pinned by SHA (same lines as `ci.yml`).
  - Pull requests (paths `apps/**`, `packages/**`, `fixtures/**`, `schema/**`, root `package.json`, lockfile, the workflow): guard, both builds, `wrangler deploy --dry-run`. No secrets.
  - Push to `main` and `workflow_dispatch`: same checks, then a `deploy` job in environment `site-deploy`: secrets check ("missing secret X"), guard, build by `SITE_DATA_MODE` (`demo` default, `live`, else fail), `wrangler deploy`.
- `wrangler` 4.164.0 pinned in `apps/site/package.json` and the lockfile. Telemetry off in CI (`WRANGLER_SEND_METRICS=false`).
- 6 unit tests in `apps/site/test/site.test.ts` (guard, shell injection, production and demo checks, budget).
- Setup guide for Daniel: `apps/site/README.md` (token, environment, variable, first deploy).

## Checked

- All CI checks pass locally (install, typecheck, lint, format, schema, tests, fixtures).
- `wrangler deploy --dry-run` passes with no credentials. Nothing was deployed. No Cloudflare resources, tokens or GitHub settings were created.
- Demo build under `wrangler dev`, headless Chrome at 375 px: map, calculator (FR, 500 MW) and About load with the banner and header; no sideways scroll; data loads from `/demo-data/` with the fixed clock (no "data delayed" banner); keyboard focus ring visible on header links. Only console error: missing `/favicon.ico` (404).
- `/calculator` redirects to `/calculator/`; unknown paths return the 404 page.

## Changes outside `apps/site` (all small)

- `apps/map/vite.config.ts`: `__DEV_NOW__` also takes `VITE_FAKE_NOW` in a build (empty by default).
- `apps/map/src/data/load.ts`: `clockNow()` uses the fixed clock when `__DEV_NOW__` is set, not only in dev.
- `apps/calculator`: no change. It is built with `--base /calculator/` and already reads `VITE_FAKE_NOW`.
- Root `package.json`: scripts `build:site`, `build:site:demo`.
- `pnpm-workspace.yaml`: `allowBuilds: workerd: false` (wrangler's runtime; pnpm 12 fails the install on an unlisted build script). `wrangler dev` and the dry run work without it.
- `.gitignore`: `.wrangler/`.

## Restyle (design system)

Per the orchestrator: plain styling, tokens only. A restyle touches `apps/site/src/shell.css`, `packages/ui/src/tokens.css`, and the markup in `apps/site/src/shell.ts` and `apps/site/pages/*.html`. No other colors or type sizes are set in `apps/site`.

## Decisions taken in this session

- The shell is added as static HTML after the Vite builds, not as Preact components in the apps. Reason: no change to the apps, no extra JS, the apps still run alone.
- The "Guide" header link is left out of PR 1, so the preview has no dead link. PR 2 adds it with the page.
- One fake clock variable for both apps: `VITE_FAKE_NOW` (the calculator already had it).
- Deploy with the lockfile-pinned `wrangler` CLI, not `cloudflare/wrangler-action`.
- The PR trigger (build + dry run only) is an addition to the brief's triggers, so CI checks the site build on every relevant PR.

## Notes for other sessions

- The calculator shows its own "powerstation.ai" line above its title and its own demo notice ("Demo data: these numbers are not real."). With the site shell, both repeat. Removing them is a copy change in `apps/calculator`, left for its owner.
- The map's "Next: place a data center" link and the header both point to `/calculator/`.
- No favicon yet (one 404 per page load). Suggest adding one with the design system.

## Open questions for Daniel

1. **Token reach.** A Cloudflare API token cannot be limited to one Worker. The deploy token (Workers Scripts: Edit) can also change `domain-landers`. The guard limits what the workflow does, not what the token can do. Options: accept this with the guard (now), or move the site to a separate Cloudflare account later. Which?
2. [Unverified] **Token permission.** The README asks for one permission, Account > Workers Scripts > Edit. Cloudflare's docs suggest the broader "Edit Cloudflare Workers" template. I expect the single permission to be enough for an assets-only Worker on workers.dev; the first deploy run will confirm it.

## Update: PR 1 merged, PR 2 (guide)

PR #18 merged on 2026-11-25. The orchestrator ran the first deploy from `main`: the preview serves `/`, `/calculator/` and `/about/` with the banner. The single token permission "Workers Scripts: Edit" was enough (open question 2 closed). `domain-landers` is untouched.

PR 2, branch `ws/e-guide` (from `origin/main`):

- `/guide/` ("Power infrastructure for the AI era"): the text of the old powerstation.ai page (backup of 2026-11-25), edited to the CLAUDE.md writing rules. Dropped: the "domain for sale" banner, the offer form, the HubSpot script and the RSS news feed (in `IDEAS.md`).
- Header link "Guide" added (Map, Calculator, Guide, About).
- Links from the guide to the map and the calculator: at the top, after "How much power AI needs" and after "Why the grid is the bottleneck".
- Search value: title "powerstation.ai: Power infrastructure for the AI era" and a description close to the old one; canonical `https://powerstation.ai/guide/`; Open Graph tags; `Article` + `FAQPage` structured data with the same answers as the page (`apps/site/src/guide-meta.ts`). Demo builds stay `noindex`.
- The comparison table scrolls sideways inside its own box (focusable region with a label). The page itself has no sideways scroll at 375 px.
- Styles: two small blocks added to `apps/site/src/shell.css` (`.site-table`, `.site-note`), tokens only.
- Checked: IEA figures (415 TWh in 2024, about 1.5%; about 945 TWh in 2030, base case) against the IEA "Energy and AI" report pages (2025). Other figures and timelines are from the old page and are listed as [Unverified] in the PR description.
- `IDEAS.md`: the news feed, and `robots.txt` + `sitemap.xml` for the launch (the guide moves from `/` to `/guide/`).

Open question for Daniel (launch): the old guide lived at `/`. At launch, `/` becomes the map. Keep the search value with a link from the map, a sitemap, or both?
