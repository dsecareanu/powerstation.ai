import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate } from "../src/calc/calculate";
import { formatHomes, formatMw, formatShare } from "../src/format";
import { summarise } from "../src/state/summary";
import { series, windowOf, zoneGen } from "./helpers";

test("formatting: GW from 1000 MW, shares, homes", () => {
  assert.equal(formatMw(500), "500 MW");
  assert.equal(formatMw(1000), "1 GW");
  assert.equal(formatMw(1500), "1.5 GW");
  assert.equal(formatShare(0.05), "5.0%");
  assert.equal(formatShare(0.0001), "less than 0.1%");
  assert.equal(formatHomes(1_250_000), "1.3 million");
  assert.equal(formatHomes(412_345), "410,000");
});

test("copy summary names the zone, size, data dates, modelled estimate and link", () => {
  const result = calculate({
    zone: "XX",
    sizeMw: 500,
    generation: zoneGen([1000, 1000], { gas: series([900, 1200]) }),
    window: windowOf(2),
    borders: [],
    capacity: undefined,
    emissionFactors: undefined,
    datacenters: [],
  });
  const text = summarise(
    [{ name: "Testland", result, homes: null }],
    "https://x.test/?a=1",
    "last 7 days",
    true,
  );
  assert.match(text, /500 MW data center in Testland/);
  assert.match(text, /Data: 1 Jan 2026 00:00 UTC to 1 Jan 2026 01:00 UTC/);
  assert.match(text, /Modelled estimate/);
  assert.match(text, /Demo data/);
  assert.match(text, /https:\/\/x\.test\/\?a=1$/);
  assert.doesNotMatch(text, /homes/);
});
