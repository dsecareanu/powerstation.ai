// The hour the map opens on, and which optional files the app requests.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DATA_PATHS,
  SCHEMA_VERSION,
  type BorderSeries,
  type DataState,
  type FlowsFile,
  type StatusFile,
  type ZonesFile,
} from "@powerstation/schema";
import { isListed, loadDefault, load30d } from "../src/data/load";
import { HOUR_MS, toMs } from "../src/data/series";
import { OPENING_COVERAGE, buildModel, measuredCoverageAt, openingHour } from "../src/model";

const T0 = "2026-11-25T00:00:00Z";
const t = (h: number) => toMs(T0) + h * HOUR_MS;
const envelope = {
  schema_version: SCHEMA_VERSION,
  generated_at: T0,
  mock: true,
  source: "test",
  license: "AGPL-3.0-only",
  attribution: "test",
};

// 11 single-zone countries in a chain give 10 borders, so 90% is exactly 9 of 10.
const CODES = ["AA", "BB", "CC", "DD", "EE", "FF", "GG", "HH", "II", "JJ", "KK"];
const zones: ZonesFile = {
  ...envelope,
  dataset: "zones",
  zones: CODES.map((c, i) => ({
    id: c,
    name: c,
    countries: [c] as [string],
    centroid: { lat: 50, lon: i },
    neighbours: [CODES[i - 1], CODES[i + 1]].filter((n): n is string => !!n),
  })),
  countries: CODES.map((c) => ({ code: c, name: c, zones: [c] as [string] })),
};

/**
 * `missingAt[h]` = how many of the 10 borders have no measured value at hour h.
 * Physical series cover hours 0–3 (newest measured hour = 3); planned trade covers hours 0–5.
 */
function flowsWith(missingAt: number[]): FlowsFile {
  const borders: BorderSeries[] = [];
  for (let b = 0; b < CODES.length - 1; b++) {
    const states: DataState[] = missingAt.map((m) => (b < m ? "missing" : "measured"));
    borders.push({
      from_zone: CODES[b]!,
      to_zone: CODES[b + 1]!,
      kind: "physical",
      series: {
        start: T0,
        resolution: "PT1H",
        unit: "MW",
        values: states.map((s) => (s === "missing" ? null : 100)),
        states,
      },
    });
    borders.push({
      from_zone: CODES[b]!,
      to_zone: CODES[b + 1]!,
      kind: "scheduled",
      series: {
        start: T0,
        resolution: "PT1H",
        unit: "MW",
        values: [1, 1, 1, 1, 1, 1],
        states: ["planned", "planned", "planned", "planned", "planned", "planned"],
      },
    });
  }
  return {
    ...envelope,
    dataset: "flows",
    window: { start: T0, end: "2026-11-25T06:00:00Z" },
    borders,
  };
}

const model = (missingAt: number[]) => buildModel(zones, flowsWith(missingAt), null);

test("the threshold is 90%", () => {
  assert.equal(OPENING_COVERAGE, 0.9);
});

test("opens on the newest hour that meets the threshold", () => {
  // Hour 3 (newest): 5 of 10 missing. Hour 2: 2 missing (80%). Hour 1: 1 missing (90%).
  const m = model([0, 1, 2, 5]);
  assert.equal(m.measuredEnd, t(4));
  assert.equal(measuredCoverageAt(m, t(1)), 0.9);
  assert.equal(openingHour(m), t(1));
});

test("opens on the newest measured hour when it already meets the threshold", () => {
  // Hours 2 and 3 both qualify: the newest one wins.
  assert.equal(openingHour(model([0, 0, 0, 1])), t(3));
});

test("never opens on a planned hour", () => {
  // Planned trade runs to hour 5 and is complete there, but it is not measured.
  const h = openingHour(model([0, 0, 0, 0]));
  assert.equal(h, t(3));
  assert.ok(h < model([0, 0, 0, 0]).measuredEnd);
});

test("falls back to the newest measured hour when no hour meets the threshold", () => {
  assert.equal(openingHour(model([2, 3, 4, 5])), t(3));
});

test("modelled values do not count as measured", () => {
  const f = flowsWith([0, 0, 0, 0]);
  // Newest hour: 2 of 10 borders modelled → 80% measured, so the map opens one hour earlier.
  for (const b of f.borders.filter((x) => x.kind === "physical").slice(0, 2)) {
    b.series.states[3] = "modelled";
    b.series.method = "Test fill.";
  }
  assert.equal(openingHour(buildModel(zones, f, null)), t(2));
});

// --- Loading: optional files only when status.json lists them ---

function status(paths: string[]): StatusFile {
  return {
    ...envelope,
    dataset: "status",
    files: paths.map((path) => ({
      path,
      dataset: (path.includes("generation")
        ? "generation"
        : path.includes("capacity")
          ? "capacity"
          : path.includes("forecasts")
            ? "forecasts"
            : path.includes("zones")
              ? "zones"
              : "flows") as StatusFile["files"][number]["dataset"],
      updated_at: T0,
      newest_measured_at: null,
      ok: true,
    })),
    sources: [],
  };
}

const LIVE_PATHS = [
  DATA_PATHS.zones,
  DATA_PATHS.flows7d,
  DATA_PATHS.flows30d,
  DATA_PATHS.capacity30d,
  DATA_PATHS.forecasts24h,
];

/** Stub fetch: serves the given files by path and records every request. */
function stubFetch(files: Record<string, unknown>): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const path = String(url).replace(/^\/data\//, "");
    requested.push(path);
    const body = files[path];
    return body === undefined
      ? new Response("not found", { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return requested;
}

const datasetOf = (dataset: string) => ({ ...envelope, dataset });

test("isListed reads status.json", () => {
  const s = status(LIVE_PATHS);
  assert.equal(isListed(s, DATA_PATHS.flows7d), true);
  assert.equal(isListed(s, DATA_PATHS.generation7d), false);
});

test("generation is not requested when status.json does not list it", async () => {
  const s = status(LIVE_PATHS);
  const requested = stubFetch({
    [DATA_PATHS.status]: s,
    [DATA_PATHS.zones]: datasetOf("zones"),
    [DATA_PATHS.flows7d]: datasetOf("flows"),
    [DATA_PATHS.flows30d]: datasetOf("flows"),
    [DATA_PATHS.capacity30d]: datasetOf("capacity"),
    [DATA_PATHS.forecasts24h]: datasetOf("forecasts"),
  });
  const d = await loadDefault();
  assert.equal(d.generation, null);
  assert.ok(d.capacity && d.forecasts);
  const d30 = await load30d(s);
  assert.equal(d30.generation, null);
  assert.ok(!requested.includes(DATA_PATHS.generation7d));
  assert.ok(!requested.includes(DATA_PATHS.generation30d));
  assert.equal(requested[0], DATA_PATHS.status, "status.json is read first");
});

test("generation is requested when status.json lists it", async () => {
  const s = status([...LIVE_PATHS, DATA_PATHS.generation7d]);
  const requested = stubFetch({
    [DATA_PATHS.status]: s,
    [DATA_PATHS.zones]: datasetOf("zones"),
    [DATA_PATHS.flows7d]: datasetOf("flows"),
    [DATA_PATHS.generation7d]: datasetOf("generation"),
  });
  const d = await loadDefault();
  assert.ok(d.generation);
  assert.ok(requested.includes(DATA_PATHS.generation7d));
  // Capacity and forecasts are listed but not served here: a 404 still gives null, not an error.
  assert.equal(d.capacity, null);
});
