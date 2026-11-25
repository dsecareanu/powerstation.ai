# Session C report — Map with timeline (Step 1: Watch)

Date: 2026-11-25. Branch: `ws/c-map`. Owns: `/apps/map`.

## What exists now

- `apps/map`: a Preact + Vite app. `pnpm --filter @powerstation/map dev` serves it with the fixtures; `build`, `test`, `typecheck` work.
- **SVG map** (d3-geo, Lambert azimuthal equal-area centred on Europe). No basemap. Countries are shaded by one of two layers: "Renewables share" or "Imports and exports". Zoom buttons and drag to pan.
- **Flow arrows** between country centroids. Width by MW (square-root scale, fixed for the whole window). Each data state has its own line style and a label:
  - measured: solid, with a moving pulse (no pulse with reduced motion);
  - planned trade: purple dashed;
  - modelled: gold dotted, faded, method in the label;
  - missing: grey dotted with a "?" marker.
- **Countries** with a non-measured value get a pattern on top of the colour: hatched (modelled), dots (missing), dashes (planned). Countries without data are flat grey and not focusable.
- **Timeline**: 7 days back to 24 h ahead, hourly. Slider (arrow keys, Home/End), play/pause, step buttons, "Latest" button. Marks: "latest measured" and a "now" tick when they differ. The part ahead of measurements is striped. 30-day toggle loads `rolling-30d` files only on first use.
- **Country panel**: picker plus tap on the map. Net imports/exports, load, generation, renewables share, generation mix bars. Each value has a data-state badge. Shared-zone note for DE-LU; zone-sum note for multi-zone countries.
- **Planned vs measured panel**: border picker plus tap on an arrow. Chart of measured flow (solid), modelled hours (gold dotted) and planned trade (dashed), with the selected hour. Values for the hour and the difference. The default border is the one where plan and measurement differ most on average.
- Data-delayed banner, attribution panel (includes Natural Earth), "How to read this map" guide, link to the calculator.
- Unit tests (`apps/map/test/aggregation.test.ts`, 11 tests): DE-LU (one zone, two countries), IT and NO (several zones each), direction and sign, intra-country flows ignored, missing and modelled state rules, physical vs planned split, net imports, generation sums and renewables share, plus a check on the fixtures.

## Measurements

| Item | Gzip |
|---|---|
| JS (whole app, incl. Preact, d3-geo and `@powerstation/ui`) | 26.0 KB |
| CSS | 4.6 KB |
| `countries.geojson` | 15 KB |
| Default data with fixtures (status, zones, flows 7d, generation 7d) | ~43 KB |

[Estimate] With ~40 real zones, `generation/rolling-7d.json` is ~110 KB (session 0 estimate), so the default view stays under the 500 KB data budget.

MapLibre GL 6.19 alone measured 292 KB gzipped JS (+10 KB CSS), over the 200 KB budget. See decision 2.

## Decisions (confirmed by Daniel on 2026-11-25)

1. **No basemap.** Natural Earth country polygons only. No tile service, no terms risk.
2. **SVG + d3-geo instead of MapLibre GL.** Reason: budget (26 KB for the whole app vs 292 KB for MapLibre alone). **`CLAUDE.md` still says "MapLibre GL for the map": Daniel updates it.** The data layer does not depend on the renderer, so a move to MapLibre later stays possible.
3. **Country shapes: Natural Earth 1:50m admin-0**, clipped to lon −25…45, lat 34…72, simplified to 15 %. Built by `pnpm --filter @powerstation/map shapes` from a pinned commit. The output is committed.
4. **Worktree**: the session started in the main checkout. Daniel chose a new worktree: `../PowerstationAI-ws-c-map`.

## Decisions taken in this session

- **Map nodes.** The map shows "nodes": the smallest group of countries and zones that can be shown without splitting data. DE and LU form one node ("Germany & Luxembourg"); both shapes show the same value. IT and NO are one node each; flows between their zones are ignored. Node centroid = mean of its zone centroids. [Inference] For IT the mean may fall near the coast; see open question 4.
- **Sums are strict.** When any part of a sum is `missing`, the sum is `missing` (no partial totals). Any `modelled` part makes the sum `modelled`, with the methods joined. See open question 2.
- **Planned trade starts at the latest measured hour**, not at the wall clock. Between the newest measured hour and "now" (a delay), the map shows planned trade, labelled as such.
- **Renewables share** = biomass, geothermal, hydro run of river, hydro reservoir, wind on/offshore, solar, other renewable, divided by all generation except pumped storage. Waste and pumped storage are left out. A zone with no renewable fuel type has 0 %, not "missing". The list is `RENEWABLE_FUELS` in `src/data/metrics.ts`.
- **Generation is measured only**, so future hours show "no data" on the renewables layer, with a note that points to the imports/exports layer. The forecasts file is not loaded (not in the default list).
- **No schema validation in the browser.** ajv would add ~100 KB; the pipeline validates before upload. The loader checks `dataset` only.
- **Keyboard**: countries are focusable in A–Z order (Enter/Space selects). Arrows are clickable but not in the tab order (up to ~70 borders with real data); keyboard users pick a border in the "Border" list. Both panels have a picker.
- **Dev clock**: the dev server fixes "now" to 2026-11-25T12:30Z. `?now=<ISO>` overrides it in dev only (e.g. `?now=2026-11-25T18:00:00Z` shows the delayed banner). Production uses the real clock.
- **Data URL**: `VITE_DATA_BASE_URL` (default `/data/`). The dev server maps `/data/` to `fixtures/`. Fixtures are never in the build.
- **Calculator link**: `VITE_CALCULATOR_URL` (default `/calculator/`).

## Shared UI (`@powerstation/ui`)

- PR #3 and #5 are merged. The map imports `DataStateBadge`, `DataDelayedBanner`, `AttributionPanel`, `formatPower`, `fuelColorVar`, `describePowerInHomes` and the styles from `@powerstation/ui`. The temporary stand-ins are deleted.
- "Homes" comparison: a node with one country passes its code and name (country figure, or "EU homes" when the country has no figure). The DE-LU node covers two countries, so it uses the EU figure.
- Preact `^10.29.8`, the same as `@powerstation/ui`.
- Test fixtures use `SCHEMA_VERSION` (schema 1.1.0). The map does not use the new capacity or emission-factor files.

## Open questions for Daniel

1. **Strict sums**: with real data, one missing border hour blanks a country's net imports for that hour. Keep strict, or show a partial sum marked "incomplete" (needs a UI state that is not in the schema)?
2. **Calculator URL**: what is the deployed path of the calculator? Default now: `/calculator/`.
3. **Country centroids**: should `zones.json` `countries[]` get an optional `centroid` (schema change, session A)? It would anchor arrows for multi-zone countries better than the mean of zone centroids.
4. **`DATA_SOURCES.md`**: add Natural Earth (public domain, 1:50m admin-0, commit `9380cca`, pulled 2026-11-25). I did not edit it (outside `/apps/map`).
5. **Mock "now" vs real "now"**: the timeline window comes from the flows file. If the pipeline is late by many hours, the "now" tick can fall right of the window and is then hidden. OK?

## What other sessions must know

- **Session D**: possible later request: a legend item for the four flow line styles (solid, dashed, dotted, "?"), if the calculator needs it too. Nothing blocking.
- **Session A**: the map needs `newest_measured_at` in `status.json` for every file with measured values, and the physical flow series to end at the newest measured hour (the map uses that end as the planned/measured switch).
- **Session B**: the map links to the calculator with `VITE_CALCULATOR_URL`.
