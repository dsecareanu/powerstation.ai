import assert from "node:assert/strict";
import { test } from "node:test";
import type { StatusFile, ZonesFile } from "@powerstation/schema";
import { annualKwhPerHousehold, homesEquivalent } from "../src/constants/households";
import { isDataDelayed } from "../src/data/freshness";
import { buildSearch, parseUrlState, type UrlState } from "../src/state/url";
import { readFixture } from "./helpers";

const zones = readFixture<ZonesFile>("meta/zones.json");
const status = readFixture<StatusFile>("meta/status.json");
const NOW = Date.parse("2026-11-25T12:00:00Z");

test("URL state round trip", () => {
  const state: UrlState = {
    zone: "FR",
    country: "FR",
    size: 1000,
    period: "30d",
    compare: { zone: "PL", country: "PL" },
  };
  const search = buildSearch(state, zones);
  assert.equal(search, "?zone=FR&country=FR&size=1000&period=30d&compare=PL");
  assert.deepEqual(parseUrlState(search, zones), state);
});

test("URL state round trip without compare", () => {
  const state: UrlState = { zone: "NL", country: "NL", size: 100, period: "7d" };
  assert.deepEqual(parseUrlState(buildSearch(state, zones), zones), state);
});

test("DE-LU keeps the country the user picked (DE and LU)", () => {
  for (const country of ["DE", "LU"]) {
    const state: UrlState = {
      zone: "DE-LU",
      country,
      size: 500,
      period: "7d",
      compare: { zone: "DE-LU", country: "LU" },
    };
    // compare equal to zone is dropped
    const parsed = parseUrlState(buildSearch(state, zones), zones);
    assert.equal(parsed.country, country);
    assert.equal(parsed.compare, undefined);
  }
  const lu: UrlState = {
    zone: "FR",
    country: "FR",
    size: 500,
    period: "7d",
    compare: { zone: "DE-LU", country: "LU" },
  };
  const search = buildSearch(lu, zones);
  assert.match(search, /compareCountry=LU/);
  assert.deepEqual(parseUrlState(search, zones), lu);
});

test("invalid URL params fall back to defaults", () => {
  const first = zones.zones[0]!;
  const parsed = parseUrlState("?zone=ZZ&country=QQ&size=abc&period=1y&compare=NOPE", zones);
  assert.deepEqual(parsed, {
    zone: first.id,
    country: first.countries[0],
    size: 500,
    period: "7d",
  });
});

test("size must be an integer from 1 to 10000", () => {
  for (const bad of ["0", "10001", "-5", "1.5", "", "1e3"]) {
    assert.equal(parseUrlState(`?size=${bad}`, zones).size, 500, bad);
  }
  assert.equal(parseUrlState("?size=1", zones).size, 1);
  assert.equal(parseUrlState("?size=10000", zones).size, 10000);
});

test("a zone with a mismatched country gets a valid country", () => {
  const parsed = parseUrlState("?zone=FR&country=PL", zones);
  assert.deepEqual([parsed.zone, parsed.country], ["FR", "FR"]);
});

test("data delayed: fixtures are fresh at the fixed time, delayed with a later clock", () => {
  assert.equal(isDataDelayed(status, NOW), false);
  assert.equal(isDataDelayed(status, NOW + 2 * 3_600_000), false);
  assert.equal(isDataDelayed(status, NOW + 2 * 3_600_000 + 1), true);
  assert.equal(isDataDelayed(status, Date.parse("2027-01-01T00:00:00Z")), true);
});

test("data delayed when no file has a measured time", () => {
  const empty: StatusFile = {
    ...status,
    files: status.files.map((f) => ({ ...f, newest_measured_at: null })),
  };
  assert.equal(isDataDelayed(empty, NOW), true);
});

test("homes equivalent: no value without a sourced figure", () => {
  assert.equal(annualKwhPerHousehold("DE"), undefined);
  assert.equal(homesEquivalent(1000, undefined), null);
});

test("homes equivalent: size x 8760 h x 1000 / kWh per year", () => {
  assert.equal(homesEquivalent(1, 8760), 1000);
  assert.equal(annualKwhPerHousehold("XX", { XX: { kwhPerYear: 3000, year: 2000 } }), 3000);
});
