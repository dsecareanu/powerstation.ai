import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate } from "../src/calc/calculate";
import { formatPower } from "@powerstation/ui";
import { formatShare, homesInfo } from "../src/format";
import { summarise } from "../src/state/summary";
import { border, factorTable, series, windowOf, zoneGen } from "./helpers";

test("formatting: GW from 1000 MW, shares", () => {
  assert.equal(formatPower(500), "500 MW");
  assert.equal(formatPower(1000), "1 GW");
  assert.equal(formatPower(1500), "1.5 GW");
  assert.equal(formatShare(0.05), "5.0%");
  assert.equal(formatShare(0.0001), "less than 0.1%");
});

test("homes text: a country with a figure names the country and is not a fallback", () => {
  const h = homesInfo(1000, "DE", "Germany");
  assert.equal(h.isFallback, false);
  assert.match(h.text, /homes in Germany use on average/);
  assert.doesNotMatch(h.text, /EU homes/);
});

test("homes text: a country without a figure uses the EU homes wording", () => {
  const h = homesInfo(1000, "CH", "Switzerland");
  assert.equal(h.isFallback, true);
  assert.match(h.text, /EU homes use on average/);
  assert.doesNotMatch(h.text, /Switzerland/);
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
    [{ name: "Testland", result, homesText: homesInfo(500, "CH", "Testland").text }],
    "https://x.test/?a=1",
    "last 7 days",
    true,
  );
  assert.match(text, /500 MW data center in Testland/);
  assert.match(text, /Data: 1 Jan 2026 00:00 UTC to 1 Jan 2026 01:00 UTC/);
  assert.match(text, /Modelled estimate/);
  assert.match(text, /Demo data/);
  assert.match(text, /https:\/\/x\.test\/\?a=1$/);
  assert.match(text, /about as much as .* EU homes use on average/);
});

test("copy summary: pressure not calculated lists the borders; carbon names left-out fuels", () => {
  const text = summarise(
    [
      {
        name: "Testland",
        homesText: "about as much as 1 EU home uses on average",
        carbonUnit: "gCO2eq/kWh",
        result: {
          ...calculate({
            zone: "XX",
            sizeMw: 100,
            generation: zoneGen([1000], { gas: series([900]), oil: series([100]) }),
            window: windowOf(1),
            borders: [border("A", "XX", [10])],
            capacity: [],
            emissionFactors: factorTable({ gas: 400 }),
            datacenters: [],
          }),
        },
      },
    ],
    "https://x.test/",
    "last 7 days",
    false,
  );
  assert.match(text, /Interconnectors: not calculated\. Capacity is not published for A → XX/);
  assert.match(text, /about 400 gCO2eq\/kWh/);
  assert.match(text, /oil \(10%? of generation\) have no emission factor and are left out/);
});
