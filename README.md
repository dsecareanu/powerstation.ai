# powerstation.ai

**Play the real grid.** A free, open-source web tool to explore real European grid data and test questions such as "What happens to the grid if a 1 GW data center goes here?"

Status: early build. The apps use mock data until the data pipeline delivers real files.

## Why

Data maps show real data but you cannot play with them. Grid games are playable but use fictional grids. powerstation.ai puts a game layer on real grid data, and marks every value as measured, planned, modelled or missing.

## Data sources

- ENTSO-E Transparency Platform: cross-border flows, scheduled exchanges, generation, load and forecasts (Europe).
- Data center locations: see [`DATA_SOURCES.md`](DATA_SOURCES.md).

Every data file names its source and license. The site shows them in an attribution panel.

## Repo layout

| Folder             | Content                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `schema/`          | The data contract: JSON Schema, generated TypeScript types, validator |
| `fixtures/`        | Mock data that follows the schema (never deployed)                    |
| `pipeline/`        | Scripts: fixture generator; later backfill and back-tests             |
| `packages/ui/`     | Shared UI components                                                  |
| `apps/map/`        | Step 1: map with timeline                                             |
| `apps/calculator/` | Step 2: data center calculator                                        |
| `briefs/`          | One brief per build session                                           |

## Run it

You need Node.js 22 or newer (CI uses 24) and Corepack (comes with Node).

```sh
git clone https://github.com/dsecareanu/powerstation.ai.git
cd powerstation.ai
corepack enable          # gives you the pnpm version in package.json
pnpm install
pnpm typecheck
pnpm validate:fixtures
```

Other commands:

| Command                             | What it does                                                |
| ----------------------------------- | ----------------------------------------------------------- |
| `pnpm test`                         | Runs the validator tests                                    |
| `pnpm lint` / `pnpm format`         | ESLint / Prettier                                           |
| `pnpm fixtures`                     | Regenerates the mock data in `fixtures/`                    |
| `pnpm validate <file-or-folder>...` | Validates data files against the schema                     |
| `pnpm validate --deploy <folder>`   | Same, and fails on files with `"mock": true`                |
| `pnpm schema:types`                 | Regenerates `schema/src/generated.ts` after a schema change |

The data contract is described in [`schema/README.md`](schema/README.md).

## License

- Code: [AGPL-3.0](LICENSE).
- Data keeps the license of its source (see `DATA_SOURCES.md`).
