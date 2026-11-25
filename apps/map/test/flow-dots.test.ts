import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DOT_LEGEND_MW,
  DOT_MW_AT_MAX,
  DOT_MW_AT_MIN,
  DOT_R_MAX,
  DOT_R_MIN,
  dotGap,
  dotRadius,
  flowEnds,
} from "../src/map/flowDots";

test("dot area is proportional to MW between the limits (radius ∝ √MW)", () => {
  const a = dotRadius(1000) ** 2;
  const b = dotRadius(4000) ** 2;
  assert.ok(Math.abs(b / a - 4) < 1e-9);
  assert.ok(Math.abs(dotRadius(2000) - 4.5) < 1e-9);
});

test("dot radius is clamped to a minimum and a maximum", () => {
  assert.equal(dotRadius(0), DOT_R_MIN);
  assert.equal(dotRadius(1), DOT_R_MIN);
  assert.equal(dotRadius(DOT_MW_AT_MIN / 2), DOT_R_MIN);
  assert.equal(dotRadius(DOT_MW_AT_MAX * 3), DOT_R_MAX);
  assert.ok(Math.abs(dotRadius(DOT_MW_AT_MAX) - DOT_R_MAX) < 1e-9);
});

test("dot radius grows with MW and ignores the sign", () => {
  let last = 0;
  for (const mw of [100, 300, 800, 2000, 4000, 6000]) {
    assert.ok(dotRadius(mw) >= last);
    last = dotRadius(mw);
  }
  assert.equal(dotRadius(-3000), dotRadius(3000));
});

test("legend sizes are distinct and inside the area-true range", () => {
  const r = DOT_LEGEND_MW.map(dotRadius);
  for (let i = 1; i < r.length; i++) assert.ok(r[i]! > r[i - 1]!);
  for (const mw of DOT_LEGEND_MW) assert.ok(mw >= DOT_MW_AT_MIN && mw <= DOT_MW_AT_MAX);
});

test("dots never touch: the gap is wider than a dot", () => {
  for (const mw of [0, 2000, 9000]) assert.ok(dotGap(dotRadius(mw)) > 2 * dotRadius(mw));
});

test("direction: dots move from exporter to importer", () => {
  assert.deepEqual(flowEnds("A", "B", 500), ["A", "B"]);
  assert.deepEqual(flowEnds("A", "B", -500), ["B", "A"]);
  assert.deepEqual(flowEnds("A", "B", 0), ["A", "B"]);
  assert.deepEqual(flowEnds("A", "B", null), ["A", "B"]);
});
