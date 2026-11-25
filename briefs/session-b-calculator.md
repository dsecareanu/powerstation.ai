# Session B brief — Data center calculator

Branch: `ws/b-calculator`. Owns: `/apps/calculator`.
Read first: `CLAUDE.md`, `briefs/README.md`, `briefs/session-0-report.md`, `schema/README.md`.

## Goal

A standalone page: "What happens to the grid if a data center goes here?" It ships first, before the map, to test interest from the public and journalists.

## Context from the plan

- Positioning: "Play the real grid." Real European data, not a fictional grid.
- Audience: general public and journalists. Journalists should be able to cite a result link instead of doing the analysis themselves.
- Inspiration (style, not content): the "Denki Ore Verzi" page (score bar, numbered steps, drag/slider input, animated counters, honest "demo data" note) and "The bulb that taught me Ohm's law" (challenge headline, missions, predict-then-test, short "mysteries").
- **Scope limit: zone level only.** [Inference] Local grid capacity (substation, hosting capacity) is not public in most countries. The page must say that it cannot tell whether a specific site can connect.

## Inputs
- Zone, picked by country (map or list; a simple country picker is enough for v1).
- Data center size: 100 MW, 500 MW, 1 GW, or a custom value.
- Period: last 7 days or last 30 days.
- Load profile: flat (data centers run around the clock). Show the assumption.

## Outputs (everyday units next to MW/GW)
1. Share of the zone's average load and peak load. Plain comparison, e.g. "about as much power as N homes". [Unverified] Source the household figure (for example Eurostat) and keep it in one constant with its citation.
2. Hours in the period when the zone would need more imports, and how close the interconnectors come to their capacity (uses capacity data from schema 1.1.0).
3. Carbon intensity of the power the data center would use, hour by hour (uses emission factors from schema 1.1.0).
4. Which generation would likely cover the extra load.
5. **Comparison mode:** the same data center in two zones side by side.

## Method (proposal — confirm with Daniel before you implement)
- Extra load = data center size, every hour.
- Import need per hour = (load + extra load) − domestic generation. Positive = imports needed.
- Interconnector pressure per hour = (net imports + extra import need) ÷ total import capacity. Flag hours above 90%.
- Carbon intensity = average of the zone's generation mix that hour, using the emission factors (attributional). Label it.
- "Likely extra source": simple merit-order rule, labelled `modelled`. Write the rule on the page.
- All results are `modelled`. Show method, assumptions and data dates on the page.

## Sharing
- The URL holds all inputs (zone, size, period, comparison zone), so every result has a permanent link.
- "Copy result" button: a short text summary with the link and data date, ready for an article.
- A share image needs a server. Leave it for later; note it in `IDEAS.md`.

## Game layer (light, optional in v1)
- Missions, e.g. "Find the zone where a 1 GW data center runs cleanest", "Find a zone where it would need imports more than half the time".
- Score bar from `/packages/ui`, stored in `localStorage`.

## Dependencies
- Schema 1.1.0 (capacity, emission factors) comes from session A. Until it is merged, build against current fixtures and stub these two inputs. Never invent real numbers.
- Shared components come from session D (`@powerstation/ui`). Build data loading and calculation logic first; wire the UI after D's first PR is merged.

## Out of scope
- No map animation, no flows timeline (session C).
- No backend, no accounts, no share images.

## Acceptance criteria
- Works on a 375 px screen. Keyboard usable. Respects reduced motion.
- Calculation logic has unit tests with fixture data, including `missing` gaps and the data center with `power_mw: null`.
- `missing` hours are excluded from results and counted on the page ("3 hours without data").
- Data-delayed banner when `status.json` is older than 2 hours.
- Attribution panel lists every source used.
- Report: `briefs/session-b-report.md`.
