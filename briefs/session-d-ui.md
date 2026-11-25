# Session D brief — Shared UI package

Branch: `ws/d-ui`. Owns: `/packages/ui` (`@powerstation/ui`).
Read first: `CLAUDE.md`, `briefs/README.md`, `briefs/session-0-report.md`.

## Goal

Shared look and components for the calculator (session B) and the map (session C). Ship a small first PR fast, because B and C wait for it.

## Context from the plan

- Audience: general public. Playful but honest. Mobile-first.
- Inspiration (style only): "Denki Ore Verzi" (bold display type, score bar with points and level, numbered step rail, animated counters, badges, clear "demo data" note) and "The bulb that taught me Ohm's law" (challenge headline, missions list with check marks, predict-then-test cards, expandable "mysteries").
- Light and dark theme. Respect `prefers-color-scheme` and `prefers-reduced-motion`.
- Framework: Preact. Keep the package small.

## First PR (priority — B and C depend on it)
1. **Design tokens** as CSS variables: colors (including one palette for the four data states and one for fuel types), type scale, spacing, radius. Color-blind safe; check contrast (WCAG AA).
2. **DataStateBadge / data-state styles:** `measured`, `planned`, `modelled`, `missing`, each with a pattern or label as well as color.
3. **DataDelayedBanner:** reads the newest time from `status.json` and `DATA_DELAYED_AFTER_HOURS`.
4. **AttributionPanel:** lists source, license and attribution from loaded data files.
5. **Everyday units formatter:** MW/GW/MWh plus a plain comparison ("about as much as N homes"). One constant with its cited source. [Unverified] Do not use a household figure from memory; leave a clearly marked placeholder and tell Daniel if no source is found.

## Second PR
6. **ScoreBar:** points, level name, progress bar. Levels (proposal): "Grid apprentice" → … → "Grid operator". Stored in `localStorage`, wrapped in try/catch.
7. **Missions list** with check marks and a short cheer message.
8. **StepRail** (numbered steps, current step highlighted).
9. **Mystery** (expandable question and answer).
10. **AnimatedNumber** (counts to a new value; no animation with reduced motion).

## Rules
- Components are presentational. No data fetching inside `@powerstation/ui`, except a small helper that reads `status.json` if the banner needs it.
- Each component has a usage example (a simple demo page in the package is enough).
- B and C request new shared components in their PR descriptions; add them in later PRs.

## Out of scope
- No app pages, no map, no calculator logic.

## Acceptance criteria
- Both apps can import tokens and components with `"@powerstation/ui": "workspace:*"`.
- Keyboard focus visible on all interactive parts. Contrast AA in light and dark.
- Package adds ≤ 30 KB gzipped to an app (excluding Preact). [Estimate] Adjust if measured otherwise and tell Daniel.
- Report: `briefs/session-d-report.md`.
