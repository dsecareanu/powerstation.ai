import assert from "node:assert/strict";
import { test } from "node:test";
import type { Datacenter, DatacentersFile, FlowsFile, GenerationFile } from "@powerstation/schema";
import {
  calculate,
  carbonIntensity,
  likelyExtraSource,
  netImportsAt,
  PRESSURE_THRESHOLD,
  summariseDatacenters,
  type CalcInput,
} from "../src/calc/calculate";
import { border, readFixture, series, T0, windowOf, zoneGen } from "./helpers";

function base(overrides: Partial<CalcInput> = {}): CalcInput {
  return {
    zone: "XX",
    sizeMw: 30,
    generation: zoneGen([100, 100, 50], { gas: series([120, 60, 100]) }),
    window: windowOf(3),
    borders: [],
    capacity: undefined,
    emissionFactors: undefined,
    datacenters: [],
    ...overrides,
  };
}

// ---- Share of load -------------------------------------------------------------------------

test("share of mean and peak load uses valid hours only", () => {
  const r = calculate(
    base({
      sizeMw: 50,
      generation: zoneGen([100, 200, null, 300], { gas: series([1, 1, 1, 1]) }),
      window: windowOf(4),
    }),
  );
  assert.equal(r.validHours, 3);
  assert.equal(r.load?.meanMw, 200);
  assert.equal(r.load?.maxMw, 300);
  assert.equal(r.load?.shareOfMean, 0.25);
  assert.equal(r.load?.shareOfMax, 50 / 300);
});

// ---- Missing and modelled hours --------------------------------------------------------------

test("hours with missing load or missing fuel are excluded and counted", () => {
  const r = calculate(
    base({
      generation: zoneGen([100, null, 100, 100], {
        gas: series([10, 10, null, 10]),
        solar: series([5, 5, 5, 5]),
      }),
      window: windowOf(4),
    }),
  );
  assert.equal(r.totalHours, 4);
  assert.equal(r.validHours, 2);
  assert.equal(r.hoursWithoutData, 2);
  assert.deepEqual(r.dataWindow, {
    firstValidHour: "2026-01-01T00:00:00Z",
    lastValidHour: "2026-01-01T03:00:00Z",
  });
});

test("a series that ends early makes the later hours count as missing", () => {
  const r = calculate(
    base({
      generation: zoneGen([100, 100, 100], { gas: series([10, 10]) }),
      window: windowOf(3),
    }),
  );
  assert.equal(r.hoursWithoutData, 1);
});

test("hours with modelled input are included and counted separately", () => {
  const r = calculate(
    base({
      generation: {
        zone: "XX",
        load: series([100, 100, 100]),
        generation: { gas: series([10, 10, 10], [1]) },
      },
    }),
  );
  assert.equal(r.validHours, 3);
  assert.equal(r.modelledInputHours, 1);
});

test("no usable hour gives null results and no crash", () => {
  const r = calculate(
    base({ generation: zoneGen([null, null, null], { gas: series([1, 1, 1]) }) }),
  );
  assert.equal(r.validHours, 0);
  assert.equal(r.hoursWithoutData, 3);
  assert.equal(r.load, null);
  assert.equal(r.dataWindow, null);
  assert.deepEqual(r.extraSource, []);
});

// ---- Imports ---------------------------------------------------------------------------------

test("import need is positive when load plus size is above generation", () => {
  // h0: 100 - 120 = -20 without; 100 + 30 - 120 = 10 with.
  // h1: 100 - 60 = 40 without; 70 with. h2: 50 - 100 = -50; -20.
  const r = calculate(base());
  assert.deepEqual(r.imports, { hoursWith: 2, hoursWithout: 1 });
});

test("an exact balance does not need imports", () => {
  const r = calculate(
    base({ sizeMw: 20, generation: zoneGen([100], { gas: series([120]) }), window: windowOf(1) }),
  );
  assert.deepEqual(r.imports, { hoursWith: 0, hoursWithout: 0 });
});

test("pumped storage counts as net, also when negative", () => {
  // generation = 100 + (-30) = 70; load 60 + size 30 = 90 > 70.
  const r = calculate(
    base({
      generation: zoneGen([60], { gas: series([100]), hydro_pumped_storage: series([-30]) }),
      window: windowOf(1),
    }),
  );
  assert.deepEqual(r.imports, { hoursWith: 1, hoursWithout: 0 });
});

// ---- Interconnector pressure -----------------------------------------------------------------

test("net imports: positive into the zone, negative out of it, scheduled ignored", () => {
  const borders = [
    border("A", "XX", [100, -100]), // into XX: +100, then -100
    border("XX", "B", [40, 40]), // out of XX: -40
    border("XX", "C", [999, 999], "scheduled"),
    border("A", "B", [777, 777]), // does not touch XX
  ];
  assert.deepEqual(netImportsAt(borders, "XX", Date.parse(T0)), { mw: 60, modelled: false });
  assert.deepEqual(netImportsAt(borders, "XX", Date.parse(T0) + 3_600_000), {
    mw: -140,
    modelled: false,
  });
});

test("net imports is null when a touching border has no value", () => {
  const borders = [border("A", "XX", [100, null]), border("XX", "B", [40, 40])];
  assert.equal(netImportsAt(borders, "XX", Date.parse(T0) + 3_600_000), null);
});

test("pressure above 0.9 is flagged, with max and missing-border hours", () => {
  const r = calculate(
    base({
      sizeMw: 50,
      generation: zoneGen([100, 100, 100, 100], { gas: series([1, 1, 1, 1]) }),
      window: windowOf(4),
      borders: [border("A", "XX", [100, -100, 80, null]), border("XX", "B", [40, 0, 0, 0])],
      capacity: { zone: "XX", mw: 100 },
    }),
  );
  // h0: net 100-40=60 -> (60+50)/100 = 1.1 flagged
  // h1: net -100 -> -0.5
  // h2: net 80 -> 1.3 flagged
  // h3: border missing -> left out of pressure only
  assert.equal(PRESSURE_THRESHOLD, 0.9);
  assert.equal(r.validHours, 4);
  assert.deepEqual(r.pressure, {
    capacityMw: 100,
    hoursCounted: 3,
    hoursWithoutBorderData: 1,
    hoursAboveThreshold: 2,
    maxPressure: 1.3,
    threshold: 0.9,
  });
});

test("pressure exactly at 0.9 is not flagged", () => {
  const r = calculate(
    base({
      sizeMw: 40,
      generation: zoneGen([100], { gas: series([1]) }),
      window: windowOf(1),
      borders: [border("A", "XX", [50])],
      capacity: { zone: "XX", mw: 100 },
    }),
  );
  assert.equal(r.pressure?.hoursAboveThreshold, 0);
});

test("pressure is null when capacity is undefined", () => {
  const r = calculate(base({ borders: [border("A", "XX", [100, 100, 100])] }));
  assert.equal(r.pressure, null);
});

test("modelled border hours count as modelled input when pressure is computed", () => {
  const input = base({
    borders: [border("A", "XX", [1, 1, 1], "physical", [2])],
    capacity: { zone: "XX", mw: 100 },
  });
  assert.equal(calculate(input).modelledInputHours, 1);
  assert.equal(calculate({ ...input, capacity: undefined }).modelledInputHours, 0);
});

// ---- Carbon intensity ------------------------------------------------------------------------

test("carbon intensity is the output-weighted average of emission factors", () => {
  // (50 * 400 + 50 * 1000 + 0 * 0) / 100 = 700. Negative pumped storage is ignored.
  const v = carbonIntensity(
    { gas: 50, hard_coal: 50, nuclear: 0, hydro_pumped_storage: -20 },
    { gas: 400, hard_coal: 1000, nuclear: 0 },
  );
  assert.equal(v, 700);
});

test("carbon intensity is null for a running fuel without a factor, or with no generation", () => {
  assert.equal(carbonIntensity({ gas: 10, oil: 5 }, { gas: 400 }), null);
  assert.equal(carbonIntensity({ gas: 0 }, { gas: 400 }), null);
  // A fuel that does not run needs no factor.
  assert.equal(carbonIntensity({ gas: 10, oil: 0 }, { gas: 400 }), 400);
});

test("carbon series has mean, min, max and counts excluded hours", () => {
  const r = calculate(
    base({
      generation: zoneGen([1, 1, 1, 1], {
        gas: series([50, 100, 0, 10]),
        nuclear: series([50, 0, 0, 0]),
        oil: series([0, 0, 0, 10]),
      }),
      window: windowOf(4),
      emissionFactors: { gas: 400, nuclear: 0 },
    }),
  );
  // h0: (50*400)/100 = 200. h1: 400. h2: no generation -> excluded. h3: oil runs, no factor -> excluded.
  assert.deepEqual(
    r.carbon?.hourly.map((h) => h.gPerKwh),
    [200, 400],
  );
  assert.equal(r.carbon?.mean, 300);
  assert.equal(r.carbon?.min, 200);
  assert.equal(r.carbon?.max, 400);
  assert.equal(r.carbon?.excludedHours, 2);
});

test("carbon is null when emission factors are undefined", () => {
  assert.equal(calculate(base()).carbon, null);
});

// ---- Likely extra source ---------------------------------------------------------------------

test("merit order picks the first fuel that runs and has room for the size", () => {
  const max = { gas: 100, hard_coal: 100, lignite: 100 };
  assert.equal(likelyExtraSource({ gas: 10, hard_coal: 10, lignite: 10 }, max, 50), "gas");
  // Gas is off: next fuel.
  assert.equal(likelyExtraSource({ gas: 0, hard_coal: 10, lignite: 10 }, max, 50), "hard_coal");
  // Gas has no room (100 - 80 = 20 < 50).
  assert.equal(likelyExtraSource({ gas: 80, hard_coal: 10, lignite: 10 }, max, 50), "hard_coal");
  // Room exactly equal to size qualifies.
  assert.equal(likelyExtraSource({ gas: 50, hard_coal: 100 }, max, 50), "gas");
});

test("merit order falls back to imports", () => {
  const max = { gas: 100, hydro_reservoir: 100 };
  assert.equal(likelyExtraSource({ gas: 90, hydro_reservoir: 0 }, max, 50), "imports");
  assert.equal(likelyExtraSource({}, {}, 50), "imports");
  // Fuels outside the merit order (nuclear, wind) are never picked.
  assert.equal(likelyExtraSource({ nuclear: 10 }, { nuclear: 1000 }, 50), "imports");
});

test("extra source shares add up to 1 over valid hours", () => {
  // gas max 100. h0: out 10 -> gas. h1: out 90 -> no room -> imports. h2: out 0 -> imports.
  const r = calculate(
    base({
      sizeMw: 50,
      generation: zoneGen([1, 1, 1, 1], { gas: series([10, 90, 0, 100]) }),
      window: windowOf(4),
    }),
  );
  assert.deepEqual(
    r.extraSource.map((s) => [s.source, s.hours, s.share]),
    [
      ["gas", 1, 0.25],
      ["imports", 3, 0.75],
    ],
  );
});

// ---- Data centers ----------------------------------------------------------------------------

test("data centers: known power summed, unknown power counted", () => {
  const f = readFixture<DatacentersFile>("datacenters/datacenters.json");
  const inZone = f.datacenters.filter((d) => d.zone === "DE-LU");
  assert.equal(inZone.length, 2);
  const s = summariseDatacenters(inZone);
  assert.equal(s.withKnownPower, 1);
  assert.equal(s.knownPowerMw, 180);
  assert.equal(s.unknownPower, 1);
  assert.equal(inZone.find((d) => d.power_mw === null)?.power_state, "missing");
});

test("data centers: an empty zone gives zeros", () => {
  const s = summariseDatacenters([] as Datacenter[]);
  assert.deepEqual([s.withKnownPower, s.knownPowerMw, s.unknownPower], [0, 0, 0]);
});

// ---- Fixtures --------------------------------------------------------------------------------

test("fixture DE-LU: gaps in load are excluded and counted", () => {
  const gen = readFixture<GenerationFile>("generation/rolling-7d.json");
  const z = gen.zones.find((x) => x.zone === "DE-LU")!;
  // Independent count: hours where load or any fuel series is null.
  let expected = 0;
  for (let i = 0; i < z.load.values.length; i++) {
    const gap =
      z.load.values[i] === null ||
      Object.values(z.generation).some((s) => s && s.values[i] === null);
    if (gap) expected++;
  }
  assert.ok(expected >= 2, "fixture should have load gaps");
  const r = calculate(base({ zone: "DE-LU", generation: z, window: gen.window, sizeMw: 500 }));
  assert.equal(r.totalHours, 168);
  assert.equal(r.hoursWithoutData, expected);
  assert.equal(r.validHours, 168 - expected);
});

test("fixture DE-LU: the FR border gap and modelled gap show up with synthetic capacity", () => {
  const gen = readFixture<GenerationFile>("generation/rolling-7d.json");
  const flows = readFixture<FlowsFile>("flows/rolling-7d.json");
  const z = gen.zones.find((x) => x.zone === "DE-LU")!;
  const common = {
    zone: "DE-LU",
    generation: z,
    window: gen.window,
    borders: flows.borders,
    sizeMw: 500,
  };
  const withCap = calculate(base({ ...common, capacity: { zone: "DE-LU", mw: 30000 } }));
  const withoutCap = calculate(base(common));
  // 3 hours missing 30 h before now; 4 hours modelled 48 h before now.
  assert.equal(withCap.pressure?.hoursWithoutBorderData, 3);
  assert.equal(withCap.pressure?.hoursCounted, withCap.validHours - 3);
  assert.equal(withCap.modelledInputHours, withoutCap.modelledInputHours + 4);
  assert.equal(withoutCap.pressure, null);
  assert.equal(withoutCap.carbon, null);
});

test("fixtures: every zone and both periods run without error", () => {
  for (const period of ["7d", "30d"] as const) {
    const gen = readFixture<GenerationFile>(`generation/rolling-${period}.json`);
    const flows = readFixture<FlowsFile>(`flows/rolling-${period}.json`);
    for (const z of gen.zones) {
      const r = calculate(
        base({ zone: z.zone, generation: z, window: gen.window, borders: flows.borders }),
      );
      assert.equal(r.validHours + r.hoursWithoutData, r.totalHours);
      assert.equal(r.totalHours, period === "7d" ? 168 : 720);
    }
  }
});
