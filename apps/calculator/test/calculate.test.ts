import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CapacityFile,
  Datacenter,
  DatacentersFile,
  EmissionFactorsFile,
  FlowsFile,
  GenerationFile,
} from "@powerstation/schema";
import {
  calculate,
  carbonIntensity,
  importDirections,
  likelyExtraSource,
  netImportsAt,
  PRESSURE_THRESHOLD,
  summariseDatacenters,
  type CalcInput,
} from "../src/calc/calculate";
import { border, dir, factorTable, readFixture, series, T0, windowOf, zoneGen } from "./helpers";

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

/** Pressure result when it is available; fails the test otherwise. */
function availablePressure(r: ReturnType<typeof calculate>) {
  assert.ok(r.pressure?.available, "pressure should be available");
  return r.pressure;
}

const flows4 = [border("A", "XX", [100, -100, 80, null]), border("XX", "B", [40, 0, 0, 0])];
const gen4 = zoneGen([100, 100, 100, 100], { gas: series([1, 1, 1, 1]) });

test("import capacity is summed per direction into the zone; export directions are ignored", () => {
  const borders = [
    border("A", "XX", [0]),
    border("XX", "B", [0]),
    border("XX", "C", [0], "scheduled"),
  ];
  const capacity = [
    dir("A", "XX", [60]),
    dir("B", "XX", [40]),
    dir("XX", "A", [999]),
    dir("XX", "B", [999]),
    dir("C", "XX", [555]),
  ];
  const d = importDirections(borders, capacity, "XX");
  assert.deepEqual(
    d.found.map((x) => [x.from_zone, x.to_zone]),
    [
      ["A", "XX"],
      ["B", "XX"],
    ],
  );
  assert.deepEqual(d.missing, []);
  const r = calculate(
    base({
      sizeMw: 0,
      generation: zoneGen([100], { gas: series([1]) }),
      window: windowOf(1),
      borders,
      capacity,
    }),
  );
  assert.equal(availablePressure(r).meanCapacityMw, 100);
});

test("pressure above 0.9 is flagged, with max, mean capacity and left-out hours", () => {
  const r = calculate(
    base({
      sizeMw: 50,
      generation: gen4,
      window: windowOf(4),
      borders: flows4,
      capacity: [dir("A", "XX", [60, 60, 60, 60]), dir("B", "XX", [40, 40, 40, 40])],
    }),
  );
  // Capacity 100 every hour.
  // h0: net 100-40=60 -> (60+50)/100 = 1.1 flagged
  // h1: net -100 -> -0.5
  // h2: net 80 -> 1.3 flagged
  // h3: border flow missing -> left out of pressure only
  assert.equal(PRESSURE_THRESHOLD, 0.9);
  assert.equal(r.validHours, 4);
  assert.deepEqual(r.pressure, {
    available: true,
    directions: [
      { from: "A", to: "XX" },
      { from: "B", to: "XX" },
    ],
    hoursCounted: 3,
    hoursLeftOut: 1,
    hoursAboveThreshold: 2,
    maxPressure: 1.3,
    meanCapacityMw: 100,
    threshold: 0.9,
  });
});

test("pressure uses the capacity of each hour", () => {
  const r = calculate(
    base({
      sizeMw: 0,
      generation: zoneGen([1, 1], { gas: series([1, 1]) }),
      window: windowOf(2),
      borders: [border("A", "XX", [50, 50])],
      capacity: [dir("A", "XX", [100, 50])],
    }),
  );
  const p = availablePressure(r);
  assert.equal(p.maxPressure, 1);
  assert.equal(p.hoursAboveThreshold, 1);
  assert.equal(p.meanCapacityMw, 75);
});

test("pressure exactly at 0.9 is not flagged", () => {
  const r = calculate(
    base({
      sizeMw: 40,
      generation: zoneGen([100], { gas: series([1]) }),
      window: windowOf(1),
      borders: [border("A", "XX", [50])],
      capacity: [dir("A", "XX", [100])],
    }),
  );
  assert.equal(availablePressure(r).hoursAboveThreshold, 0);
});

test("a missing capacity value leaves the hour out of pressure only, and counts it", () => {
  const r = calculate(
    base({
      sizeMw: 10,
      generation: zoneGen([1, 1, 1], { gas: series([1, 1, 1]) }),
      window: windowOf(3),
      borders: [border("A", "XX", [10, 10, 10]), border("B", "XX", [10, 10, 10])],
      capacity: [dir("A", "XX", [50, null, 50]), dir("B", "XX", [50, 50, 50])],
    }),
  );
  const p = availablePressure(r);
  assert.equal(p.hoursCounted, 2);
  assert.equal(p.hoursLeftOut, 1);
  // The other results still use all 3 hours.
  assert.equal(r.validHours, 3);
  assert.equal(r.hoursWithoutData, 0);
});

test("an hour with zero import capacity is left out and counted", () => {
  const r = calculate(
    base({
      generation: zoneGen([1, 1], { gas: series([1, 1]) }),
      window: windowOf(2),
      borders: [border("A", "XX", [10, 10])],
      capacity: [dir("A", "XX", [0, 100])],
    }),
  );
  const p = availablePressure(r);
  assert.equal(p.hoursCounted, 1);
  assert.equal(p.hoursLeftOut, 1);
  assert.ok(Number.isFinite(p.maxPressure));
});

test("pressure is unavailable, with the border list, when a border has no import capacity", () => {
  // Capacity for A -> XX exists. B -> XX does not (only the export direction XX -> B does).
  const r = calculate(
    base({
      generation: gen4,
      window: windowOf(4),
      borders: flows4,
      capacity: [dir("A", "XX", [60, 60, 60, 60]), dir("XX", "B", [40, 40, 40, 40])],
    }),
  );
  assert.deepEqual(r.pressure, {
    available: false,
    missingDirections: [{ from: "B", to: "XX" }],
  });
  // The rest of the page still works.
  assert.equal(r.validHours, 4);
  assert.ok(r.load);
  assert.ok(r.imports);
});

test("pressure is unavailable, with several borders listed, when none has capacity", () => {
  const r = calculate(base({ borders: flows4, capacity: [] }));
  assert.deepEqual(r.pressure, {
    available: false,
    missingDirections: [
      { from: "A", to: "XX" },
      { from: "B", to: "XX" },
    ],
  });
});

test("pressure is null when capacity data is not loaded", () => {
  const r = calculate(base({ borders: [border("A", "XX", [100, 100, 100])] }));
  assert.equal(r.pressure, null);
});

test("pressure is unavailable even when no hour has data", () => {
  const r = calculate(
    base({
      generation: zoneGen([null], { gas: series([1]) }),
      window: windowOf(1),
      borders: [border("A", "XX", [1])],
      capacity: [],
    }),
  );
  assert.equal(r.validHours, 0);
  assert.equal(r.pressure?.available, false);
});

test("modelled border hours count as modelled input when pressure is computed", () => {
  const input = base({
    borders: [border("A", "XX", [1, 1, 1], "physical", [2])],
    capacity: [dir("A", "XX", [100, 100, 100])],
  });
  assert.equal(calculate(input).modelledInputHours, 1);
  assert.equal(calculate({ ...input, capacity: undefined }).modelledInputHours, 0);
});

// ---- Carbon intensity ------------------------------------------------------------------------

test("carbon intensity is the output-weighted average over fuels with a factor", () => {
  // (50 * 400 + 50 * 1000 + 0 * 0) / 100 = 700. Negative pumped storage is ignored.
  const factors = factorTable({ gas: 400, hard_coal: 1000, nuclear: 0 });
  const v = carbonIntensity(
    { gas: 50, hard_coal: 50, nuclear: 0, hydro_pumped_storage: -20 },
    factors,
  );
  assert.equal(v, 700);
});

test("a fuel with no factor is left out of both sums, not counted as 0", () => {
  const factors = factorTable({ gas: 400 });
  // Counted as 0 it would give 400 * 10 / 30 = 133. Left out it gives 400.
  assert.equal(carbonIntensity({ gas: 10, oil: 20 }, factors), 400);
});

test("carbon intensity is null with no generation, or only fuels without a factor", () => {
  const factors = factorTable({ gas: 400 });
  assert.equal(carbonIntensity({ gas: 0 }, factors), null);
  assert.equal(carbonIntensity({ oil: 5, waste: 5 }, factors), null);
  assert.equal(carbonIntensity({}, factors), null);
});

test("carbon series: mean, min, max, hours left out, share without a factor, proxy notes", () => {
  const r = calculate(
    base({
      generation: zoneGen([1, 1, 1, 1], {
        gas: series([50, 100, 0, 10]),
        nuclear: series([50, 0, 0, 0]),
        oil: series([0, 0, 10, 10]),
      }),
      window: windowOf(4),
      emissionFactors: factorTable({
        gas: { value: 400, match: "proxy", note: "Gas uses combined cycle." },
        nuclear: 0,
      }),
    }),
  );
  // h0: (50*400)/100 = 200. h1: 400. h2: only oil runs, no factor -> left out and counted.
  // h3: gas 10 and oil 10 -> oil is left out, so 400.
  assert.deepEqual(
    r.carbon?.hourly.map((h) => h.gPerKwh),
    [200, 400, 400],
  );
  assert.equal(r.carbon?.mean, 1000 / 3);
  assert.equal(r.carbon?.min, 200);
  assert.equal(r.carbon?.max, 400);
  assert.equal(r.carbon?.excludedHours, 1);
  // Generation: h0 100, h1 100, h2 10, h3 20 = 230 MWh. Oil = 20 MWh.
  assert.equal(r.carbon?.noFactor.share, 20 / 230);
  assert.deepEqual(r.carbon?.noFactor.fuels, [
    { fuel: "oil", share: 20 / 230, note: "No factor." },
  ]);
  assert.deepEqual(r.carbon?.proxyFuels, [
    { fuel: "gas", value: 400, note: "Gas uses combined cycle." },
  ]);
});

test("carbon: no fuel without a factor means share 0 and no list", () => {
  const r = calculate(base({ emissionFactors: factorTable({ gas: 400 }) }));
  assert.equal(r.carbon?.noFactor.share, 0);
  assert.deepEqual(r.carbon?.noFactor.fuels, []);
  assert.deepEqual(r.carbon?.proxyFuels, []);
});

test("carbon is null when emission factors are not loaded", () => {
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

function fixtureInput(zone: string, period: "7d" | "30d") {
  const gen = readFixture<GenerationFile>(`generation/rolling-${period}.json`);
  const flows = readFixture<FlowsFile>(`flows/rolling-${period}.json`);
  const cap = readFixture<CapacityFile>("capacity/rolling-30d.json");
  const ef = readFixture<EmissionFactorsFile>("meta/emission-factors.json");
  const z = gen.zones.find((x) => x.zone === zone)!;
  return base({
    zone,
    generation: z,
    window: gen.window,
    borders: flows.borders,
    capacity: cap.borders,
    emissionFactors: ef.factors,
    sizeMw: 500,
  });
}

test("fixture DE-LU: pressure is computed from the capacity file, in both periods", () => {
  for (const period of ["7d", "30d"] as const) {
    const input = fixtureInput("DE-LU", period);
    const r = calculate(input);
    const p = availablePressure(r);
    // 6 physical borders: FR, NL, BE, PL, CZ, AT.
    assert.equal(p.directions.length, 6);
    assert.ok(p.directions.every((d) => d.to === "DE-LU"));
    assert.equal(p.hoursCounted + p.hoursLeftOut, r.validHours);
    // Capacity gaps, the flow gap on the FR border (3 hours) or missing hours leave hours out.
    assert.ok(p.hoursLeftOut >= 3, `${period}: left out ${p.hoursLeftOut}`);
    assert.ok(p.hoursCounted > 0);
    assert.ok(p.meanCapacityMw! > 10_000, "six borders add up to well over 10 GW");
  }
});

test("fixture zones: every zone has full import capacity except PT", () => {
  const gen = readFixture<GenerationFile>("generation/rolling-30d.json");
  const unavailable: Record<string, string[]> = {};
  for (const z of gen.zones) {
    const r = calculate(fixtureInput(z.zone, "30d"));
    if (!r.pressure?.available) {
      unavailable[z.zone] = (
        r.pressure?.available === false ? r.pressure.missingDirections : []
      ).map((d) => `${d.from}>${d.to}`);
    }
  }
  // PT has one physical border (ES-PT, flow direction ES -> PT). The file has only PT -> ES.
  assert.deepEqual(unavailable, { PT: ["ES>PT"] });
});

test("fixture emission factors: oil, waste and others are left out, lignite is a proxy", () => {
  const r = calculate(fixtureInput("DE-LU", "30d"));
  assert.ok(r.carbon && r.carbon.mean !== null);
  assert.ok(r.carbon.mean > 0);
  assert.ok(r.carbon.noFactor.share > 0 && r.carbon.noFactor.share < 1);
  const allowed = ["oil", "waste", "other_renewable", "other", "hydro_pumped_storage"];
  assert.ok(r.carbon.noFactor.fuels.every((f) => allowed.includes(f.fuel)));
  const lignite = r.carbon.proxyFuels.find((f) => f.fuel === "lignite");
  assert.equal(lignite?.value, 820);
  assert.match(lignite?.note ?? "", /lignite/i);
});

test("fixtures: every zone and both periods run without error", () => {
  for (const period of ["7d", "30d"] as const) {
    const gen = readFixture<GenerationFile>(`generation/rolling-${period}.json`);
    const flows = readFixture<FlowsFile>(`flows/rolling-${period}.json`);
    for (const z of gen.zones) {
      const r = calculate({ ...fixtureInput(z.zone, period), borders: flows.borders });
      assert.equal(r.validHours + r.hoursWithoutData, r.totalHours);
      assert.equal(r.totalHours, period === "7d" ? 168 : 720);
    }
  }
});
