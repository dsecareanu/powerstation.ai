# powerstation.ai — Claude Code rules

Read this file first in every session. Your session brief is in `briefs/`. The full plan (`powerstation-ai-plan.md`) is not in the repo: it stays in Daniel's local project folder. If your brief points to a plan section you cannot read, ask Daniel.

## What this project is

- A free, open-source web tool: **"Play the real grid."**
- Users explore real European grid data and test questions such as "What happens to the grid if a 1 GW data center goes here?"
- Audience: general public and journalists. Not energy experts.
- Language: English.

## v1 scope (Europe only)

1. **Step 1 — Watch:** map with a timeline (7 days back, 30-day toggle, 24 h ahead). Measured flows behind "now", planned trade ahead.
2. **Step 2 — Place a data center:** zone-level impact calculator. Also ships as a standalone page.
3. Not in v1: daily predictions (v1.1), balancing lab, US, rest of world, leaderboards, accounts.

Do not add features outside your session brief. Write ideas in `IDEAS.md` instead.

## Stack (default — confirm in session 0)

- TypeScript everywhere. Vite and Preact for the apps. The map is SVG with d3-geo and Natural Earth country shapes, with no basemap (MapLibre GL measured 292 KB gzipped, over the JS budget).
- Static site on Cloudflare (Pages or Workers static assets), deployed from GitHub.
- Data: JSON files in Cloudflare R2, written by a scheduled GitHub Actions workflow (hourly) that runs the `/pipeline` scripts. Decided by Daniel 2026-11-25: free, one codebase. If Actions proves unreliable (late or skipped runs), move the same code to a Cloudflare Worker with a Cron Trigger. n8n is not used in v1.
- **No backend in v1.** The browser reads public JSON files only.
- Package manager: pnpm workspaces.

## Repo structure

```
/schema          JSON Schema + generated TypeScript types (the data contract)
/fixtures        Mock data that follows the schema (never deployed to production)
/packages/ui     Shared UI: tokens, score bar, attribution panel, data-state styles
/apps/map        Step 1 — map with timeline
/apps/calculator Step 2 — data center calculator
/pipeline        Scripts: backfill, validation, back-tests
/n8n             Not used in v1 (kept for possible later templates)
/briefs          One brief per Claude Code session
```

## Data rules (mandatory)

1. **Every value has exactly one state:** `measured`, `planned`, `modelled` or `missing`.
   - Never show a `modelled` value without its label and method.
   - Never fill a gap without marking it `modelled` or `missing`.
2. **Planned is not forecast.** ENTSO-E day-ahead scheduled exchanges are commercial plans. Label them "planned trade", never "forecast flow".
3. **Units:** power in MW (hourly average), energy in MWh, time in UTC ISO 8601. Convert to local time only in the UI.
4. **Everyday units in the UI:** next to MW/GW, show a plain comparison (e.g. "about as much as N homes"). The household figure lives only in `@powerstation/ui` (`packages/ui/src/units.ts`): Eurostat per country, EU aggregate as fallback, labelled "average EU homes". Apps import it. Do not add a second figure.
5. **Freshness:** the UI reads `status.json`. If the newest data is older than 2 hours, show "data delayed".
6. **Attribution:** every data file carries its source and license. The UI shows them in the attribution panel.
7. **ENTSO-E open data only:** physical flows, day-ahead capacity and day-ahead load forecast are CC BY 4.0. Do not publish actual load, generation per fuel, wind/solar forecasts or scheduled exchanges until Daniel confirms ENTSO-E permission (see `DATA_SOURCES.md`).

## Schema change rule

- The schema in `/schema` is the contract between all sessions.
- Only one session at a time may change it. Bump `schema_version`, update fixtures, then tell Daniel. Other sessions rebase.
- Apps and pipeline must validate against the schema in CI.

## Writing and copy

- Short sentences. Active voice. Plain English for a general audience.
- No political framing. Describe what the data shows. Do not judge countries or energy sources.
- Do not use "guarantee", "ensures", "eliminates" or "will never" in copy.
- Credit sources by name.

## Quality budgets

- Mobile-first. Test at 375 px width.
- [Estimate] Targets, adjust with measurements: initial JS ≤ 200 KB gzipped; data loaded for the default view ≤ 500 KB gzipped; first useful view ≤ 3 s on a mid-range phone over 4G.
- Accessibility: keyboard use for all controls, visible focus, color is never the only signal (data states need a pattern or label too), respect `prefers-reduced-motion`.
- Browser storage (`localStorage`) only for personal settings and scores. Wrap reads and writes in try/catch.

## Design

- `DESIGN.md` (repo root) holds the design rules: direction "Line diagram", decided by Daniel 2026-11-25. Read it before any UI change.
- Use the `--ps-*` tokens from `packages/ui/src/tokens.css`. No raw colours, fonts or radii in app CSS. Exception: the choropleth ramps in `apps/map/src/layers.ts` (tests check: no violet, lightness in order).
- Fonts: IBM Plex Sans and Mono, self-hosted in `packages/ui/src/fonts/`. No font CDN.
- Signal yellow (`--ps-color-signal`) is the brand colour only: never a data value, never text.

## Domain and launch

- Preview: every merge to `main` deploys the site to `https://powerstation-site.danielsecareanu.workers.dev` (demo data).

- Today `powerstation.ai` serves a "domain for sale" page with a guide ("Power infrastructure for the AI era") and a news feed. It runs on the Cloudflare Worker `domain-landers`, which also serves 12 other domains. Never redeploy, change or delete `domain-landers`.
- Backup of that page and Worker (2026-11-25): `~/RevTechAgency/PowerstationAI-site-backup-2026-11-25/` (outside the repo).
- Launch = move the `powerstation.ai` and `www.powerstation.ai` custom domains from `domain-landers` to the app's Worker. Rollback = move them back. Only Daniel launches.

## Secrets and licensing

- No API keys or tokens in the repo. The ENTSO-E token and the R2 API token live in GitHub Actions secrets only (repository environment `data-publish`). Never print them in logs.
- Repo: https://github.com/dsecareanu/powerstation.ai (default branch `main`). The root `LICENSE` (AGPL-3.0) already exists. Do not replace it.
- Code license: AGPL-3.0.
- Exception: the `/n8n` folder is MIT, with its own `LICENSE` file in that folder. It is not used in v1. Never copy AGPL code into `/n8n`.
- Data from OSM-derived sources stays ODbL. Keep `DATA_SOURCES.md` up to date (source, license, attribution text, date pulled).
- Do not use: WRI Global Power Plant Database (unmaintained), PeeringDB, Electricity Maps API, any paid dataset.

## Git workflow

- One session = one git worktree = one branch: `ws/<session-letter>-<short-name>` (e.g. `ws/b-calculator`).
- Small commits with clear messages.
- Open a pull request to `main`. The orchestrator thread merges each PR, one at a time, after it verifies the PR (Daniel's instruction, 2026-11-25). Sessions do not merge their own PRs, except the design session (below).
- **Design merges (Daniel, 2026-11-25):** the design session merges its own PRs when every changed file is design-only: `DESIGN.md`; `packages/ui/src/tokens.css`, `styles.css` and `fonts/`; `apps/site/src/shell.css` and `apps/site/public/brand/`; app CSS that only switches to tokens; and the tests for these files. Any other file (app `.ts`/`.tsx` logic, `schema/`, `pipeline/`, build scripts, CLAUDE.md) goes to the orchestrator.
  - Before the merge: `check` passes on an up-to-date branch, the local checks and `pnpm build:site:demo` pass, and the result is checked at 375 px and desktop in light and dark.
  - One PR at a time, never `--admin`. After the merge: confirm the preview shows the change, and tell Daniel so the orchestrator knows that open PRs need "Update branch".
- Do not edit files owned by another workstream. If you need a change there, write it in your PR description.
- `main` is protected (ruleset "Protect main"): PR only, CI check `check` must pass on an up-to-date branch, no force push. Never merge with `--admin` or another bypass.
- Never edit, commit or switch branches in the main checkout (`~/RevTechAgency/PowerstationAI`). If your session starts there, first run `git worktree add -b ws/<letter>-<name> ../PowerstationAI-worktrees/ws-<letter>-<name> main` and work only in that folder.
- `pnpm-lock.yaml` conflict: take main's version, run `pnpm install`, commit. Never hand-edit it.
- Stacked PR (base = another `ws/` branch): after the base merges, change the base to `main`. Branches are not deleted on merge.
- After any merge to `main`, open PRs fall behind and cannot merge. Update the branch (GitHub "Update branch", or `gh api -X PUT repos/dsecareanu/powerstation.ai/pulls/<n>/update-branch`), then wait for `check`. The API can return a GraphQL error and still succeed: read the branch head before you retry.
- Local-only ignores (drafts, notes): add them to `.git/info/exclude`, not `.gitignore`.

## Checks (same as CI)

`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm schema:check && pnpm test && pnpm validate:fixtures`

## Labels when reporting to Daniel

- `[Inference]` for conclusions not verified.
- `[Estimate]` for approximate numbers.
- `[Unverified]` for facts not checked against a primary source.
- If information is missing, ask. Do not guess.
