import assert from "node:assert/strict";
import { test } from "node:test";
import { DATA_PATHS, SCHEMA_VERSION, type DataFile, type TimeSeries } from "@powerstation/schema";
import {
  capacityFile,
  flowsFile,
  generationFile,
  iso,
  type FlowBorder,
  type Series,
} from "../src/build/files";
import {
  cutFlows,
  cutGeneration,
  mergeCapacity,
  mergeFlows,
  mergeGeneration,
  mergeTimeSeries,
  parseExisting,
} from "../src/build/merge";
import { validateAll } from "../src/build/output";
import { buildZonesFile, type BordersReference, type CentroidsReference } from "../src/zones";

const H = 3_600_000;
const D = 24 * H;
const NOW = Date.UTC(2026, 10, 25, 12, 0);
const START = NOW - 30 * D;
const OLD_AT = "2026-11-25T11:17:00Z";
const NEW_AT = "2026-11-25T12:17:00Z";

const borders: BordersReference = {
  checked_at: "2026-11-25T00:00:00Z",
  window: { start: "2026-11-18T00:00:00Z", end: "2026-11-25T00:00:00Z" },
  method: "test",
  directed: [
    { from: "BE", to: "FR", hours_with_data: 5 },
    { from: "FR", to: "BE", hours_with_data: 5 },
    { from: "BE", to: "NL", hours_with_data: 5 },
  ],
};
const centroids: CentroidsReference = {
  method: "test",
  source: "test",
  centroids: {
    BE: { lat: 50.6, lon: 4.6 },
    FR: { lat: 46.6, lon: 2.4 },
    NL: { lat: 52.2, lon: 5.5 },
  },
};
const zones = buildZonesFile(OLD_AT, borders, centroids);
const ctx = { startMs: START, nowMs: NOW, zones };

const series = (start: number, count: number, f: (i: number) => number | null): Series => ({
  start,
  values: Array.from({ length: count }, (_, i) => f(i)),
});
const ts = (values: (number | null)[], startMs: number, state = "measured"): TimeSeries => ({
  start: iso(startMs),
  resolution: "PT1H",
  unit: "MW",
  values,
  states: values.map((v) => (v === null ? "missing" : state)) as TimeSeries["states"],
});

test("mergeTimeSeries: new wins, new null keeps old (with its state), gaps are missing", () => {
  const t0 = NOW;
  const old = ts([1, 2, 3, 4], t0);
  const fresh = ts([30, null, 50], t0 + 2 * H, "planned");
  const merged = mergeTimeSeries(old, fresh, t0 + H, t0 + 6 * H);
  assert.equal(merged.start, iso(t0 + H));
  assert.deepEqual(merged.values, [2, 30, 4, 50, null]);
  assert.deepEqual(merged.states, ["measured", "planned", "measured", "planned", "missing"]);
});

test("mergeTimeSeries: hours outside the new window are dropped", () => {
  const merged = mergeTimeSeries(ts([1, 2, 3, 4, 5], NOW), undefined, NOW + 2 * H, NOW + 4 * H);
  assert.deepEqual(merged.values, [3, 4]);
});

test("mergeTimeSeries: method is kept when a kept value is modelled", () => {
  const old = { ...ts([7], NOW, "modelled"), method: "test method" };
  assert.equal(mergeTimeSeries(old, undefined, NOW, NOW + H).method, "test method");
  assert.equal("method" in mergeTimeSeries(ts([7], NOW), undefined, NOW, NOW + H), false);
});

function oldFlows() {
  const b: FlowBorder[] = [
    // 31 days of data: the first 24 hours are older than the new window.
    { from: "BE", to: "FR", kind: "physical", series: series(START - D, 31 * 24, (i) => i) },
    // Ends 3 hours early: it is late this hour.
    { from: "BE", to: "NL", kind: "physical", series: series(START, 30 * 24 - 3, () => 5) },
  ];
  return flowsFile(b, START - D, NOW, OLD_AT);
}
function freshFlows() {
  const b: FlowBorder[] = [
    {
      from: "BE",
      to: "FR",
      kind: "physical",
      series: series(NOW - 48 * H, 48, (i) => (i === 47 ? null : 1000 + i)),
    },
  ];
  return flowsFile(b, NOW - 48 * H, NOW, NEW_AT);
}

test("mergeFlows: overlap, trimming, null keeps old, late series is padded", () => {
  const merged = mergeFlows(oldFlows(), freshFlows(), ctx);
  assert.equal(merged.window.start, iso(START));
  assert.equal(merged.window.end, iso(NOW));
  assert.equal(merged.generated_at, NEW_AT);
  const bf = merged.borders.find((b) => b.to_zone === "FR")!.series;
  assert.equal(bf.start, iso(START));
  assert.equal(bf.values.length, 30 * 24);
  assert.equal(bf.values[0], 24); // old hour 24 is the first hour of the window
  assert.equal(bf.values[30 * 24 - 48], 1000); // new value wins over old
  assert.equal(bf.values[30 * 24 - 1], 30 * 24 + 24 - 1); // new null keeps the old value
  const bn = merged.borders.find((b) => b.to_zone === "NL")!.series;
  assert.equal(bn.values.length, 30 * 24);
  assert.deepEqual(bn.values.slice(-4), [5, null, null, null]);
  assert.deepEqual(bn.states.slice(-4), ["measured", "missing", "missing", "missing"]);
});

test("mergeFlows: with no old file the fresh series is padded with missing", () => {
  const merged = mergeFlows(null, freshFlows(), ctx);
  const s = merged.borders[0]!.series;
  assert.equal(s.values.length, 30 * 24);
  assert.equal(s.values[0], null);
  assert.equal(s.values[30 * 24 - 48], 1000);
});

test("mergeCapacity: a series that is new in the fresh build is added and padded", () => {
  const old = capacityFile(
    [{ from: "BE", to: "FR", series: series(START, 30 * 24 + 24, () => 900) }],
    START,
    NOW + D,
    OLD_AT,
  );
  const fresh = capacityFile(
    [
      { from: "BE", to: "FR", series: series(NOW - 48 * H, 72, () => 950) },
      { from: "FR", to: "BE", series: series(NOW - 48 * H, 72, () => 800) },
    ],
    NOW - 48 * H,
    NOW + D,
    NEW_AT,
  );
  const merged = mergeCapacity(old, fresh, ctx);
  assert.equal(merged.window.end, iso(NOW + D));
  const fb = merged.borders.find((b) => b.from_zone === "FR")!.series;
  assert.equal(fb.values.length, 30 * 24 + 24);
  assert.equal(fb.values[0], null);
  assert.equal(fb.values.at(-1), 800);
  const be = merged.borders.find((b) => b.from_zone === "BE")!.series;
  assert.equal(be.values[0], 900);
  assert.equal(be.values.at(-1), 950);
});

test("old series for zones that are not in zones.json are dropped", () => {
  // BE-NL are neighbours, but FR-NL are not.
  const old = capacityFile(
    [{ from: "FR", to: "NL", series: series(START, 10, () => 1) }],
    START,
    NOW + D,
    OLD_AT,
  );
  const fresh = capacityFile([], NOW - 48 * H, NOW + D, NEW_AT);
  assert.equal(mergeCapacity(old, fresh, ctx).borders.length, 0);
});

test("an old-only series with no value left in the window is dropped", () => {
  const old = capacityFile(
    [{ from: "BE", to: "FR", series: series(START - 40 * D, 24, () => 1) }],
    START - 40 * D,
    START - 39 * D,
    OLD_AT,
  );
  const fresh = capacityFile([], NOW - 48 * H, NOW + D, NEW_AT);
  assert.equal(mergeCapacity(old, fresh, ctx).borders.length, 0);
});

test("mergeGeneration: load and fuels merge by zone and fuel", () => {
  const old = generationFile(
    [
      {
        zone: "FR",
        load: series(START, 30 * 24, () => 100),
        generation: {
          solar: series(START, 30 * 24, () => 10),
          nuclear: series(START, 30 * 24, () => 50),
        },
      },
    ],
    START,
    NOW,
    OLD_AT,
  );
  const fresh = generationFile(
    [
      {
        zone: "FR",
        load: series(NOW - 48 * H, 48, () => 200),
        generation: {
          solar: series(NOW - 48 * H, 48, () => 20),
          wind_onshore: series(NOW - 48 * H, 48, () => 5),
        },
      },
    ],
    NOW - 48 * H,
    NOW,
    NEW_AT,
  );
  const merged = mergeGeneration(old, fresh, ctx);
  const fr = merged.zones[0]!;
  assert.equal(fr.load.values[0], 100);
  assert.equal(fr.load.values.at(-1), 200);
  assert.equal(fr.generation.solar!.values.at(-1), 20);
  assert.equal(fr.generation.nuclear!.values.at(-1), 50); // late: kept from the old file
  assert.equal(fr.generation.wind_onshore!.values[0], null); // new: padded
  assert.equal(fr.generation.wind_onshore!.values.at(-1), 5);
});

test("7-day files are cut from the merged 30-day files", () => {
  const flows = mergeFlows(oldFlows(), freshFlows(), ctx);
  const f7 = cutFlows(flows, NOW - 7 * D);
  assert.equal(f7.window.start, iso(NOW - 7 * D));
  assert.equal(f7.borders[0]!.series.values.length, 7 * 24);
  assert.equal(f7.borders[0]!.series.start, iso(NOW - 7 * D));
  const gen = generationFile(
    [{ zone: "FR", load: series(START, 30 * 24, () => 1), generation: {} }],
    START,
    NOW,
    OLD_AT,
  );
  assert.equal(cutGeneration(gen, NOW - 7 * D).zones[0]!.load.values.length, 7 * 24);
});

test("merged files pass validation and zone checks", () => {
  const flows = mergeFlows(oldFlows(), freshFlows(), ctx);
  const capacity = mergeCapacity(
    null,
    capacityFile(
      [{ from: "BE", to: "FR", series: series(NOW - 48 * H, 72, () => 950) }],
      NOW - 48 * H,
      NOW + D,
      NEW_AT,
    ),
    ctx,
  );
  const files: Record<string, DataFile> = {
    [DATA_PATHS.zones]: zones,
    [DATA_PATHS.flows30d]: flows,
    [DATA_PATHS.flows7d]: cutFlows(flows, NOW - 7 * D),
    [DATA_PATHS.capacity30d]: capacity,
  };
  assert.deepEqual(validateAll(files, zones), []);
});

test("parseExisting: absent, other schema_version, invalid and good files", () => {
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);
  const good = JSON.stringify(oldFlows());
  assert.equal(parseExisting(null, "flows", "x", log), null);
  assert.equal(
    parseExisting(good.replace(`"${SCHEMA_VERSION}"`, '"0.9.0"'), "flows", "x", log),
    null,
  );
  assert.ok(logs.some((l) => l.includes("schema_version")));
  assert.equal(parseExisting("{not json", "flows", "x", log), null);
  const broken = JSON.stringify({ ...oldFlows(), borders: "nope" });
  assert.equal(parseExisting(broken, "flows", "x", log), null);
  assert.equal(parseExisting(good, "capacity", "x", log), null); // wrong dataset
  assert.equal(
    parseExisting(JSON.stringify({ ...oldFlows(), mock: true }), "flows", "x", log),
    null,
  );
  assert.ok(parseExisting(good, "flows", "x", log));
  assert.equal(logs.length, 5);
});
