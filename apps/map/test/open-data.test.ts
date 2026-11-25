// The map on ENTSO-E open data only (CLAUDE.md rule 7): no generation file, no scheduled
// exchanges. Built from the repo fixtures with the restricted parts taken out (test-only variant).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type {
  CapacityFile,
  FlowsFile,
  ForecastsFile,
  GenerationFile,
  ZonesFile,
} from "@powerstation/schema";
import { HOUR_MS, toMs } from "../src/data/series";
import {
  borderUseAt,
  buildModel,
  fullestPair,
  layerValue,
  loadForecastAt,
  netPhysicalAt,
} from "../src/model";

const dir = join(import.meta.dirname, "..", "..", "..", "fixtures", "v1");
const load = <T>(p: string): T => JSON.parse(readFileSync(join(dir, p), "utf8")) as T;
const zones = load<ZonesFile>("meta/zones.json");
const flows = load<FlowsFile>("flows/rolling-7d.json");
const capacity = load<CapacityFile>("capacity/rolling-30d.json");
const forecasts = load<ForecastsFile>("forecasts/next-24h.json");
const generation = load<GenerationFile>("generation/rolling-7d.json");

/** Live open-data shape: physical flows only, window ends at the newest hour, no generation. */
function openFlows(): FlowsFile {
  const borders = flows.borders.filter((b) => b.kind === "physical");
  let end = 0;
  for (const b of borders)
    end = Math.max(end, toMs(b.series.start) + b.series.values.length * HOUR_MS);
  return {
    ...flows,
    borders,
    window: { ...flows.window, end: new Date(end).toISOString().replace(".000Z", "Z") },
  };
}

const open = buildModel(zones, openFlows(), null, capacity, forecasts);
const full = buildModel(zones, flows, generation, capacity, forecasts);
const lastMeasured = open.measuredEnd - HOUR_MS;

test("open data: no generation and no planned trade are detected", () => {
  assert.equal(open.hasGeneration, false);
  assert.equal(open.hasPlanned, false);
  assert.equal(full.hasGeneration, true);
  assert.equal(full.hasPlanned, true);
});

test("open data: the timeline still reaches the end of the load forecast", () => {
  assert.equal(open.hours.at(-1)! + HOUR_MS, toMs(forecasts.window.end));
  assert.ok(open.hours.at(-1)! >= open.measuredEnd);
});

test("open data: renewables layer is missing everywhere", () => {
  for (const n of open.index.nodes)
    assert.equal(layerValue(open, "renewables", n.id, lastMeasured, []).state, "missing");
});

test("load forecast layer: planned in the forecast hours, missing before them", () => {
  const first = toMs(forecasts.window.start);
  const fr = open.index.nodeOfCountry.get("FR")!;
  const p = loadForecastAt(open, fr, first);
  assert.equal(p.state, "planned");
  assert.ok(p.value! > 0);
  assert.deepEqual(layerValue(open, "loadForecast", fr, first, []), p);
  assert.equal(loadForecastAt(open, fr, first - 24 * HOUR_MS).state, "missing");
});

test("net position uses measured flows only: missing after the latest measured hour", () => {
  const fr = open.index.nodeOfCountry.get("FR")!;
  assert.equal(netPhysicalAt(open, fr, open.measuredEnd).state, "missing");
  // Same value with or without the planned-trade data: planned trade is never used.
  for (const h of open.hours.filter((t) => t < open.measuredEnd).slice(-12))
    assert.deepEqual(netPhysicalAt(open, fr, h), netPhysicalAt(full, fr, h));
});

test("net position: positive = import, the signed sum of the node's border flows", () => {
  const h = lastMeasured;
  for (const n of open.index.nodes) {
    const p = netPhysicalAt(open, n.id, h);
    if (p.value === null) continue;
    let sum = 0;
    for (const pair of open.pairs) {
      if (pair.from !== n.id && pair.to !== n.id) continue;
      const i = (h - toMs(pair.physical!.series.start)) / HOUR_MS;
      const v = pair.physical!.series.values[i]!;
      sum += pair.to === n.id ? v : -v;
    }
    assert.ok(Math.abs(sum - p.value) < 0.01, n.id);
  }
});

test("border use: share = |flow| / capacity in the direction of the flow", () => {
  let checked = 0;
  for (const pair of open.pairs) {
    const u = borderUseAt(open, pair, lastMeasured);
    if (u.share.value === null) continue;
    assert.equal(u.capacity.state, "planned");
    assert.equal(u.share.state, u.flow.state);
    assert.ok(Math.abs(u.share.value - Math.abs(u.flow.value!) / u.capacity.value!) < 1e-9);
    const dir = u.flow.value! < 0 ? `${pair.to}>${pair.from}` : `${pair.from}>${pair.to}`;
    const cap = open.capacity.get(dir)!;
    const i = (lastMeasured - toMs(cap.start)) / HOUR_MS;
    assert.equal(u.capacity.value, cap.values[i]);
    checked++;
  }
  assert.ok(checked > 0);
});

test("border use: no share after the latest measured hour", () => {
  for (const pair of open.pairs)
    assert.equal(borderUseAt(open, pair, open.measuredEnd).share.state, "missing");
});

test("fullest border is chosen without planned trade", () => {
  assert.ok(fullestPair(open));
});

test("no capacity file: border use is missing, nothing throws", () => {
  const m = buildModel(zones, openFlows(), null, null, null);
  assert.equal(m.capacity.size, 0);
  assert.equal(borderUseAt(m, m.pairs[0]!, lastMeasured).share.state, "missing");
  assert.equal(m.hours.at(-1)! + HOUR_MS, m.measuredEnd);
});
