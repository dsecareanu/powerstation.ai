# Session C brief — Map with timeline (Step 1: Watch)

Branch: `ws/c-map`. Owns: `/apps/map`.
Read first: `CLAUDE.md`, `briefs/README.md`, `briefs/session-0-report.md`, `schema/README.md`.

## Goal

A map of Europe that plays the grid over time: measured flows behind "now", planned trade ahead.

## Context from the plan

- Closest competitor: "Europe Power Grid" (jasperbernaers.com/europe-power-grid). It already shows live flows as moving dots with a 24-hour time-lapse. **Do not build a copy.** Our difference: planned vs actual, honest data states, everyday units, and the data center calculator next to it.
- Audience: general public. Mobile-first.

## Features
1. **Map:** MapLibre GL. Countries shaded by a chosen layer (generation mix share, e.g. renewables %; or net import/export).
2. **Flows:** arrows between country centroids, width by MW.
   - Data is per bidding zone. Country view: sum the border flows between zones in different countries. Ignore flows inside one country.
   - Measured: solid, animated. Planned trade: dashed, labelled "planned trade". Modelled: hatched/faded with method. Missing: grey with "no data".
3. **Timeline:** 7 days back (toggle to 30 days) to 24 h ahead, hourly, with a "now" marker and a play button. Load `rolling-30d` files only when the toggle is used.
4. **Planned vs actual:** for past hours, show the planned trade next to the measured flow for a selected border. This is a key story; make it easy to find.
5. **Country panel (tap a country):** generation mix, load, net imports/exports, all with everyday units.
6. Data-delayed banner, attribution panel, short "how to read this map" guide.

## Choices to confirm with Daniel (ask, then wait)
- **Basemap tiles:** a free source that allows public use (for example OpenFreeMap, or Protomaps PMTiles hosted on R2). [Unverified] Check each terms of use.
- **Country shapes:** Natural Earth (public domain) is the proposal.

## Performance
- [Unverified] MapLibre GL alone may be close to or above the 200 KB gzipped JS budget in `CLAUDE.md`. Measure it. Propose to Daniel either a separate budget for the map library or lazy-loading the map after the first view. Do not silently break the budget.
- Default view loads only `zones`, `status`, `flows/rolling-7d` and `generation/rolling-7d`.

## Dependencies
- Shared components from session D (`@powerstation/ui`). Build data loading, aggregation and timeline logic first; wire UI after D's first PR is merged.
- Fixtures have a fixed "now" (2026-11-25T12:00Z). Fake the clock in development, or run `pnpm fixtures --now <time>` locally (do not commit that output).

## Out of scope
- No data center calculator (session B). A link to it is enough.
- No predictions game (v1.1), no US, no rest of world.

## Acceptance criteria
- Works on a 375 px screen. Keyboard usable for the timeline and country selection. Respects reduced motion (no animated arrows, static widths).
- Zone → country aggregation has unit tests, including DE-LU (two countries) and multi-zone countries (IT, NO).
- Every arrow and every value shows its data state; color is never the only signal.
- Report: `briefs/session-c-report.md`.
