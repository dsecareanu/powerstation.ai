---
version: alpha
name: powerstation.ai
description: Line diagram. Ink on cool paper, one high-voltage yellow, IBM Plex. Data states shown by line style as well as colour.
colors:
  primary: "#15191E"
  paper: "#F5F6F3"
  surface: "#FFFFFF"
  sunken: "#ECEEE9"
  line: "#D5D9D3"
  field: "#80868F"
  land: "#E3E6E0"
  land-strong: "#CFD3CC"
  ink: "#15191E"
  ink-muted: "#555C66"
  on-ink: "#F5F6F3"
  signal: "#FFD21A"
  signal-tint: "#FFF4C2"
  state-measured: "#0072B2"
  state-planned: "#C4520A"
  state-planned-text: "#AD4708"
  state-modelled: "#A2337A"
  state-missing: "#6E7179"
  dark-paper: "#0E1116"
  dark-surface: "#171B21"
  dark-line: "#2C323B"
  dark-land: "#1F242C"
  dark-ink: "#ECEEF0"
  dark-ink-muted: "#A3AAB5"
  dark-signal-tint: "#3A3110"
typography:
  display:
    fontFamily: IBM Plex Sans
    fontSize: 46px
    fontWeight: 600
    lineHeight: 1.08
  h2:
    fontFamily: IBM Plex Sans
    fontSize: 25px
    fontWeight: 600
    lineHeight: 1.2
  h3:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  readout:
    fontFamily: IBM Plex Mono
    fontSize: 52px
    fontWeight: 600
    lineHeight: 1
  data:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: 2px
  md: 6px
  lg: 10px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 24px
  "6": 32px
  "7": 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 0 18px
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: 44px
  button-secondary-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  badge-measured:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  notice:
    backgroundColor: "{colors.signal-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  now-marker:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    size: 16px
  selected-country:
    backgroundColor: "{colors.signal-tint}"
    textColor: "{colors.ink}"
  map-land:
    backgroundColor: "{colors.land}"
    textColor: "{colors.ink-muted}"
  map-no-data:
    backgroundColor: "{colors.land-strong}"
    textColor: "{colors.ink}"
  hairline:
    backgroundColor: "{colors.line}"
    height: 1px
  form-field-border:
    backgroundColor: "{colors.field}"
    height: 1px
  sunken-track:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  data-measured:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.state-measured}"
  data-planned:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.state-planned-text}"
  data-planned-line:
    backgroundColor: "{colors.state-planned}"
    height: 3px
  data-modelled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.state-modelled}"
  data-missing:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.state-missing}"
  dark-page:
    backgroundColor: "{colors.dark-paper}"
    textColor: "{colors.dark-ink}"
  dark-panel:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink-muted}"
  dark-hairline:
    backgroundColor: "{colors.dark-line}"
    height: 1px
  dark-map-land:
    backgroundColor: "{colors.dark-land}"
    textColor: "{colors.dark-ink}"
  dark-notice:
    backgroundColor: "{colors.dark-signal-tint}"
    textColor: "{colors.dark-ink}"
---

## Overview

powerstation.ai is a free tool where anyone can watch electricity move between European countries and test what a large new load would do. The audience is the general public and journalists, not energy experts.

- **Character:** instrument-like, candid, curious. It shows its working.
- **World:** the single-line diagram and the transmission line. Ink on paper, high-voltage yellow, measured traces and planned schedules.
- **Moments:** the map with its flows, and the calculator result. Colour and motion live there. Everything else stays quiet.
- **Signature: the now line.** A solid line turns dashed at a yellow "now" point. It is the logo mark, the timeline, the chart rule and the map legend. It follows data rule 2: measured before now, planned trade after.

Decided by Daniel on 2026-11-25 (direction A "Line diagram", IBM Plex). Proposal with research: https://claude.ai/artifact/TBE6bHhkGnRKymvetnXjzA. Code tokens: `packages/ui/src/tokens.css` (names `--ps-*`).

## Colors

- **Paper, surface, sunken, line:** the neutral ramp, cool with a slight green bias. Panels are surface on paper. Hairlines are `line`.
- **Ink (primary):** text, buttons, links, measured flows on the map. 16.3:1 on paper.
- **Ink muted:** secondary text, units after numbers. 6.2:1 on paper.
- **Field:** borders of inputs and selects (3.4:1 on paper).
- **Signal yellow `#FFD21A`:** the one brand colour. It marks now, focus and one highlight per screen. It is never text and never sits alone on paper (1.3:1): it always has an ink outline or ink on top.
- **Signal tint:** highlight fill behind ink text, notices.
- **Map ramps** (`apps/map/src/layers.ts`): Renewables share runs from brown (low) to pale yellow (high); Imports and exports runs from brown (exports) through a light neutral (about balanced) to slate (imports). No green and no violet on the map: a green "renewables" ramp would judge the energy mix. The ramps are a scale of their own; signal yellow itself is never a data value.
- **Data states:** Okabe–Ito based, unchanged from the first `@powerstation/ui` release. Planned text uses `state-planned-text` (5.3:1); the brighter `state-planned` is for lines and fills only.
- **No blue accent.** Blue means measured, so actions are ink.
- **Fuel colours** (`--ps-fuel-*` in code) are for chart fills only, always with labels or a legend. None is violet. Nuclear is sand `#CAB78B` (since 2026-11-25), chosen to stay apart from every other fuel colour also with colour-blind vision.
- **Dark theme** changes only the semantic layer (the `dark-*` values above and the dark blocks in `tokens.css`). Yellow stays the same.

## Typography

- **IBM Plex Sans** for words, **IBM Plex Mono** for numbers you read off an instrument (readouts, times, MW values in tables). Both SIL OFL 1.1, self-hosted from `packages/ui/src/fonts/` (Latin subset, 400 and 600, about 77 KB in all).
- Fallback is the system stack, with `font-display: swap`, so a slow font never blocks the map.
- Two weights only: 400 and 600. Hierarchy comes from size and colour.
- Sentence case everywhere. No uppercase tracked labels. No italic for emphasis.
- Numbers use tabular figures (`font-variant-numeric: tabular-nums`). The unit follows the number in muted text: `2,140 MW`.

## Layout

- Mobile first. Test at 375 px. Side gutter 16 px at every width.
- 4 px spacing grid (`--ps-space-1` to `--ps-space-7`). Small gaps inside a group, larger gaps between groups.
- The map takes the most space on every screen where it appears. Panels sit beside it on wide screens and below it on phones.
- Keep running text near 65 characters wide.

## Elevation & Depth

No shadows. Depth comes from surface steps (paper → surface → sunken) and 1 px hairlines. The only "glow" is the focus ring.

## Shapes

- 2 px: badges, swatches, small marks.
- 6 px: buttons, inputs, selects, segmented controls, notices.
- 10 px: panels and the map frame.
- Full circle only for things that are circles: the now marker, step numbers, check marks. No pill buttons or pill badges.

## Components

- **Buttons:** primary is solid ink with paper text; secondary is ink outline on transparent. 44 px tall. Hover lifts 1 px, press moves 1 px down. One primary per screen.
- **Segmented control and toggles:** ink outline group; the pressed item is solid ink.
- **State badge:** 2 px radius, 1.5 px border in the state colour, a pattern swatch, the label in ink. Planned is dashed, missing is dotted, modelled has a hatch swatch and always a method line.
- **Notice (data delayed, demo data):** signal tint ground, ink text. In a panel: ink border with a 6 px left edge. As the full-width demo banner above the site header: a 1.5 px ink rule below it. Text first; colour is never the only signal.
- **Readout:** Plex Mono 600 number, unit in muted Plex Sans, then one plain comparison ("about as much as 1.4 million homes").
- **Map:** flat land shapes with paper-coloured borders, no basemap and no sea colour. Flows are shown only by round dots that move from the exporting to the importing country; no arrows. Dot size scales with MW (area-true: radius ∝ √MW, 2 to 8 px), not line width. A faint guide line under the dots repeats the data state: solid for measured (ink dots), dashed for planned trade (hollow orange dots), short dash for modelled. A flow with no data has no dots, only a dotted line and a "?" mark. The selected country keeps its data colour and gets a 2.5 px ink outline. A country with no value for the hour gets the dotted "no data" pattern (`#pat-missing`) over its fill, with a label in the legend.
- **Timeline:** solid ink track for the measured past, dashed planned track after now, the yellow now marker with a text label.
- **Credit line:** under every chart and map, 13–14 px muted: source name, licence.
- **Focus ring:** 2 px ink ring plus a 3 px signal halo (`--ps-focus-ring`). Visible on both themes.
- **Native controls** (range slider, radios, checkboxes): `accent-color: var(--ps-color-accent)` on the app body, so they are ink, never the browser's blue.
- **Links:** ink, 1 px underline 3 px below the text, 2 px on hover.
- **Site header** (`apps/site/src/shell.ts`, `shell.css`): surface band with a hairline below, the wordmark on the left, nav links on the right in ink at 15 px, each 44 px tall. The current page is bold with a solid 2 px underline.
- **Site footer:** 14 px muted text above a hairline: sources with licences, code licence.
- **Text pages** (About, Guide, 404): one 44 rem column, headings at 600 on the token scale, a hairline above each `h2`, definition lists as rows between hairlines, the guide's contents in a quiet panel.
- **Data-state labels in text** (About, "How to read the numbers"): each label shows the same line as the map: solid measured, dashed planned, hatched modelled, dotted no data (`.site-state--*`).

## Motion

- Motion only where it explains something: flow dots show direction, numbers count when a value changes.
- One ease-out curve, 120 ms for controls, 400 ms for values.
- Under `prefers-reduced-motion` everything rests: flow dots stay still and a small direction mark past the last dot shows direction.

## Logo

The logo is the now line followed by the wordmark "powerstation.ai" in IBM Plex Sans 600, lowercase, converted to outlines. The square mark is the now line alone on an ink tile. Files are in `apps/site/public/brand/`:

| File                                                                             | Use                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `logo-light.svg`                                                                 | Wordmark on paper or white: ink text and line, yellow point with an ink ring                                      |
| `logo-dark.svg`                                                                  | Wordmark on dark grounds: light text and line, yellow point with a dark ring                                      |
| `logo-mono.svg`                                                                  | One colour (`currentColor`, black as a file): the point is an open ring. For print in one ink, stamps, embroidery |
| `mark.svg`                                                                       | Square mark: ink tile, paper line, yellow point. Avatars, social profiles                                         |
| `favicon.svg`, `favicon.ico` (16 and 32 px)                                      | Browser tabs                                                                                                      |
| `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `site.webmanifest` | Home screen and web manifest. Full-bleed ink square; the line stays inside the maskable safe zone                 |

The site header uses the same drawing inline (`apps/site/src/logo.ts`), in `currentColor`, so it follows the light and dark themes. The link around it has `aria-label="powerstation.ai"`.

- **Construction:** at a type size of 100 units, the line is 12 units thick (close to the stem of Plex Sans 600), sits on the middle of the x-height, and runs solid 42 units, the point (radius 16), then two dashes. The gap from line to text is 28 units.
- **Clear space:** at least the x-height of the wordmark on every side. Nothing else (text, edges, other logos) inside it.
- **Minimum size:** wordmark 16 px tall on screen (22 px in the header on phones, 24 px from 768 px), 12 mm in print. Square mark 16 px.
- **Do** use the light file on paper and white, the dark file on ink and dark photos, the one-colour file when only one ink is possible.
- **Do** keep the solid-point-dashed order: it is the measured → now → planned story.
- **Don't** recolour the point (only yellow, or an open ring in one colour), stretch, rotate, add shadows or outlines, or set the wordmark in another face.
- **Don't** use the lightning-bolt icon from the old "domain for sale" lander. It belongs to the shared `domain-landers` Worker, not to powerstation.ai.

## Checks in code

These tests guard the rules above. Keep them passing; extend them with new colours.

- `packages/ui/test/tokens.test.ts`: text contrast 4.5:1 and data-state contrast 3:1 on paper and surface, both themes; field borders 3:1; no violet fuel colour; nuclear at least delta E 15 from every other fuel under normal, protan, deutan and tritan vision.
- `apps/map/test/layers.test.ts`: no violet in the map ramps; lightness in order on each ramp (renewables gets lighter as the share rises); no ramp colour is signal yellow.
- `apps/site/test/site.test.ts`: the header wordmark keeps its accessible name; every page links the favicon set; every brand file exists.
- `DESIGN.md` itself: `npx @google/design.md lint DESIGN.md` with 0 errors and 0 warnings.

## Do's and Don'ts

- Do show every value's state with a pattern or label as well as colour.
- Do label planned values "planned trade", never "forecast".
- Do put the source and licence on every chart and map.
- Don't use signal yellow `#FFD21A` as a data value, as text, or alone on paper. The map's yellow-to-brown ramp is a separate scale.
- Don't use green to mean "renewable" or "good". Describe the data; do not judge energy sources.
- Don't add a second accent colour, gradients, glows, shadows or glass.
- Don't use violet or lavender anywhere: page design, map ramps or fuel colours.
- Don't use weights above 600 or uppercase labels.
- Don't add a lightning bolt or plug icon to the logo. The mark is the now line.
