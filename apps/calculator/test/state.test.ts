import assert from "node:assert/strict";
import { test } from "node:test";
import { DATA_PATHS, type StatusFile, type ZonesFile } from "@powerstation/schema";
import { getFreshness, householdsFor } from "@powerstation/ui";
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

const paths = [DATA_PATHS.generation7d, DATA_PATHS.flows7d];
const delayedAt = (ms: number, st: StatusFile = status) =>
  getFreshness(st, { paths, now: new Date(ms) }).delayed;

test("data delayed: fixtures are fresh at the fixed time, delayed with a later clock", () => {
  assert.equal(delayedAt(NOW), false);
  assert.equal(delayedAt(NOW + 2 * 3_600_000), false);
  assert.equal(delayedAt(NOW + 2 * 3_600_000 + 1), true);
  assert.equal(delayedAt(Date.parse("2027-01-01T00:00:00Z")), true);
});

test("data delayed when no checked file has a measured time", () => {
  const empty: StatusFile = {
    ...status,
    files: status.files.map((f) => ({ ...f, newest_measured_at: null })),
  };
  assert.equal(delayedAt(NOW, empty), true);
});

test("household table has a figure for every fixture country, and CH falls back to the EU", () => {
  for (const c of ["DE", "LU", "FR", "NL", "BE", "PL", "CZ", "AT", "HU", "RO", "ES", "PT"]) {
    const h = householdsFor(c);
    assert.equal(h.isFallback, false, c);
    assert.ok(h.mwhPerYear > 1 && h.mwhPerYear < 20, `${c}: ${h.mwhPerYear}`);
  }
  const ch = householdsFor("CH");
  assert.equal(ch.isFallback, true);
  assert.equal(ch.area, "EU");
});
