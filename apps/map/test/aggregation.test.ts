// Zone → country aggregation: DE-LU (one zone, two countries), IT and NO (several zones each).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type {
  BorderSeries,
  DataState,
  FlowsFile,
  GenerationFile,
  TimeSeries,
  ZonesFile,
} from "@powerstation/schema";
import {
  flowAt,
  generationAt,
  generationIndex,
  measuredEndMs,
  netImportAt,
  pairBorders,
} from "../src/data/metrics";
import { aggregateBorders, buildNodes } from "../src/data/nodes";
import { HOUR_MS, combine, pointAt, sumSeries, toMs } from "../src/data/series";

const T0 = "2026-11-25T00:00:00Z";
const t = (h: number) => toMs(T0) + h * HOUR_MS;

const envelope = {
  schema_version: "1.0.0" as const,
  generated_at: T0,
  mock: true,
  source: "test",
  license: "AGPL-3.0-only",
  attribution: "test",
};

const zone = (id: string, countries: [string, ...string[]], lat: number, lon: number) => ({
  id,
  name: id,
  countries,
  centroid: { lat, lon },
  neighbours: [],
});

const zones: ZonesFile = {
  ...envelope,
  dataset: "zones",
  zones: [
    zone("DE-LU", ["DE", "LU"], 51, 10),
    zone("FR", ["FR"], 46, 2),
    zone("CH", ["CH"], 47, 8),
    zone("IT-North", ["IT"], 45, 10),
    zone("IT-South", ["IT"], 41, 16),
    zone("NO1", ["NO"], 60, 11),
    zone("NO3", ["NO"], 64, 11),
    zone("SE2", ["SE"], 64, 16),
    zone("SE3", ["SE"], 59, 15),
  ],
  countries: [
    { code: "DE", name: "Germany", zones: ["DE-LU"] },
    { code: "LU", name: "Luxembourg", zones: ["DE-LU"] },
    { code: "FR", name: "France", zones: ["FR"] },
    { code: "CH", name: "Switzerland", zones: ["CH"] },
    { code: "IT", name: "Italy", zones: ["IT-North", "IT-South"] },
    { code: "NO", name: "Norway", zones: ["NO1", "NO3"] },
    { code: "SE", name: "Sweden", zones: ["SE2", "SE3"] },
  ],
};

const series = (values: (number | null)[], states?: DataState[], method?: string): TimeSeries => {
  const s: TimeSeries = {
    start: T0,
    resolution: "PT1H",
    unit: "MW",
    values,
    states: states ?? values.map((v) => (v === null ? "missing" : "measured")),
  };
  if (method) s.method = method;
  return s;
};

const border = (
  from_zone: string,
  to_zone: string,
  values: (number | null)[],
  kind: BorderSeries["kind"] = "physical",
  states?: DataState[],
  method?: string,
): BorderSeries => ({ from_zone, to_zone, kind, series: series(values, states, method) });

const flows = (borders: BorderSeries[]): FlowsFile => ({
  ...envelope,
  dataset: "flows",
  window: { start: T0, end: "2026-11-25T03:00:00Z" },
  borders,
});

test("DE-LU becomes one node for Germany and Luxembourg", () => {
  const idx = buildNodes(zones);
  const n = idx.byId.get("DE+LU");
  assert.ok(n);
  assert.equal(n.name, "Germany & Luxembourg");
  assert.deepEqual(n.zones, ["DE-LU"]);
  assert.equal(idx.nodeOfCountry.get("DE"), "DE+LU");
  assert.equal(idx.nodeOfCountry.get("LU"), "DE+LU");
  assert.equal(idx.nodeOfZone.get("DE-LU"), "DE+LU");
});

test("multi-zone countries become one node each", () => {
  const idx = buildNodes(zones);
  assert.deepEqual(idx.byId.get("IT")?.zones, ["IT-North", "IT-South"]);
  assert.deepEqual(idx.byId.get("NO")?.zones, ["NO1", "NO3"]);
  assert.equal(idx.nodeOfZone.get("IT-South"), "IT");
  assert.deepEqual(idx.byId.get("IT")?.centroid, { lat: 43, lon: 13 });
  assert.equal(idx.nodes.length, 6);
});

test("flows inside one country are ignored", () => {
  const idx = buildNodes(zones);
  const out = aggregateBorders(
    flows([border("IT-North", "IT-South", [500]), border("NO1", "NO3", [200])]),
    idx,
  );
  assert.deepEqual(out, []);
});

test("zone borders between the same two countries are summed with direction", () => {
  const idx = buildNodes(zones);
  // NO1 → SE3 = +100 and SE2 → NO3 = +40, so net NO → SE = 60.
  const out = aggregateBorders(
    flows([border("NO1", "SE3", [100, 10]), border("SE2", "NO3", [40, -5])]),
    idx,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.from, "NO");
  assert.equal(out[0]!.to, "SE");
  assert.deepEqual(out[0]!.series.values, [60, 15]);
  assert.equal(out[0]!.parts.length, 2);
});

test("a border written in the other direction gets its sign flipped", () => {
  const idx = buildNodes(zones);
  // FR → DE-LU = +300 means DE+LU → FR = -300 ("DE+LU" < "FR").
  const [b] = aggregateBorders(flows([border("FR", "DE-LU", [300])]), idx);
  assert.equal(b!.from, "DE+LU");
  assert.equal(b!.to, "FR");
  assert.deepEqual(b!.series.values, [-300]);
});

test("one missing part makes the sum missing; modelled keeps its method", () => {
  const idx = buildNodes(zones);
  const out = aggregateBorders(
    flows([
      border(
        "CH",
        "IT-North",
        [100, 100, 100],
        "physical",
        ["measured", "missing", "modelled"],
        "Linear fill.",
      ),
      border("CH", "IT-South", [1, 1, 1]),
    ]),
    idx,
  );
  const s = out[0]!.series;
  assert.deepEqual(s.states, ["measured", "missing", "modelled"]);
  assert.deepEqual(s.values, [101, null, 101]);
  assert.equal(s.method, "Linear fill.");
});

test("physical before the newest measured hour, planned trade after", () => {
  const idx = buildNodes(zones);
  const f = flows([
    border("FR", "CH", [10, 20]),
    border("FR", "CH", [11, 21, 31], "scheduled", ["planned", "planned", "planned"]),
  ]);
  const pairs = pairBorders(aggregateBorders(f, idx));
  const end = measuredEndMs(f);
  assert.equal(end, t(2));
  assert.deepEqual(flowAt(pairs[0]!, t(1), end), {
    from: "CH",
    to: "FR",
    kind: "physical",
    point: { value: -20, state: "measured" },
  });
  assert.deepEqual(flowAt(pairs[0]!, t(2), end).point, { value: -31, state: "planned" });
});

test("net import of a node sums its borders; positive = import", () => {
  const idx = buildNodes(zones);
  const f = flows([border("FR", "CH", [100]), border("CH", "IT-North", [30])]);
  const pairs = pairBorders(aggregateBorders(f, idx));
  const at = pairs.map((p) => flowAt(p, t(0), measuredEndMs(f)));
  assert.deepEqual(netImportAt("CH", at), { value: 70, state: "measured" });
  assert.deepEqual(netImportAt("FR", at), { value: -100, state: "measured" });
  assert.deepEqual(netImportAt("IT", at), { value: 30, state: "measured" });
});

test("generation of a multi-zone country is summed and the renewables share computed", () => {
  const idx = buildNodes(zones);
  const gen: GenerationFile = {
    ...envelope,
    dataset: "generation",
    window: { start: T0, end: "2026-11-25T01:00:00Z" },
    zones: [
      {
        zone: "IT-North",
        load: series([300]),
        generation: { gas: series([200]), solar: series([50]) },
      },
      {
        zone: "IT-South",
        load: series([100]),
        generation: { solar: series([150]), hydro_pumped_storage: series([-40]) },
      },
      { zone: "CH", load: series([50]), generation: { nuclear: series([80]) } },
    ],
  };
  const g = generationAt(generationIndex(gen, idx), "IT", t(0))!;
  assert.deepEqual(g.load, { value: 400, state: "measured" });
  assert.deepEqual(g.byFuel.solar, { value: 200, state: "measured" });
  assert.deepEqual(g.total, { value: 400, state: "measured" });
  assert.deepEqual(g.renewableShare, { value: 0.5, state: "measured" });
  // A node with no renewable fuel has a share of 0, not "missing".
  assert.deepEqual(generationAt(generationIndex(gen, idx), "CH", t(0))!.renewableShare, {
    value: 0,
    state: "measured",
  });
});

test("series helpers", () => {
  assert.deepEqual(pointAt(series([1, 2]), t(5)), { value: null, state: "missing" });
  assert.deepEqual(combine([]), { value: null, state: "missing" });
  // Ranges that do not overlap: the hours one input does not cover are missing.
  const late: TimeSeries = { ...series([5]), start: "2026-11-25T01:00:00Z" };
  assert.deepEqual(
    sumSeries([
      { series: series([1]), sign: 1 },
      { series: late, sign: 1 },
    ]).states,
    ["missing", "missing"],
  );
});

test("fixtures: DE-LU → FR keeps its modelled and missing gaps after aggregation", () => {
  const dir = join(import.meta.dirname, "..", "..", "..", "fixtures", "v1");
  const load = <T>(p: string): T => JSON.parse(readFileSync(join(dir, p), "utf8")) as T;
  const z = load<ZonesFile>("meta/zones.json");
  const f = load<FlowsFile>("flows/rolling-7d.json");
  const idx = buildNodes(z);
  const out = aggregateBorders(f, idx);
  assert.equal(out.length, f.borders.length); // fixtures have no border inside one node
  const de = out.find((b) => b.from === "DE+LU" && b.to === "FR" && b.kind === "physical")!;
  assert.ok(de.series.states.includes("modelled"));
  assert.ok(de.series.states.includes("missing"));
  assert.ok(de.series.method);
});
