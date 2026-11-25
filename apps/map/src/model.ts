// Derived data for the views. Built once per loaded data set, then read per hour.
import type {
  CapacityFile,
  FlowsFile,
  ForecastsFile,
  GenerationFile,
  TimeSeries,
  ZonesFile,
} from "@powerstation/schema";
import {
  type BorderPair,
  type FlowAt,
  type GenerationIndex,
  flowAt,
  generationAt,
  generationIndex,
  measuredEndMs,
  netImportAt,
  pairBorders,
  timelineHours,
} from "./data/metrics";
import { type NodeIndex, aggregateBorders, buildNodes } from "./data/nodes";
import { HOUR_MS, MISSING, type Point, combine, pointAt, sumSeries, toMs } from "./data/series";
import type { LayerId } from "./layers";

export interface Model {
  index: NodeIndex;
  pairs: BorderPair[];
  gen: GenerationIndex;
  hours: number[];
  /** Start of the first hour with no measured flow; planned trade from here on. */
  measuredEnd: number;
  /** Day-ahead capacity per node direction. Key "A>B": power from A to B. */
  capacity: Map<string, TimeSeries>;
  /** Day-ahead load forecast per node: one series per zone, only when every zone has one. */
  loadForecast: Map<string, TimeSeries[]>;
  /** False when the generation file is not published (restricted data). */
  hasGeneration: boolean;
  /** True when at least one hour of planned trade (scheduled exchanges) is published. */
  hasPlanned: boolean;
}

export function buildModel(
  zones: ZonesFile,
  flows: FlowsFile,
  generation: GenerationFile | null,
  capacity: CapacityFile | null = null,
  forecasts: ForecastsFile | null = null,
): Model {
  const index = buildNodes(zones);
  const pairs = pairBorders(aggregateBorders(flows, index));
  // The timeline reaches 24 h ahead when the forecast does, even if no planned trade is published.
  const end =
    forecasts && toMs(forecasts.window.end) > toMs(flows.window.end)
      ? forecasts.window.end
      : flows.window.end;
  return {
    index,
    pairs,
    gen: generationIndex(generation ?? { zones: [] }, index),
    hours: timelineHours(flows.window.start, end),
    measuredEnd: measuredEndMs(flows),
    capacity: aggregateCapacity(capacity, index),
    loadForecast: forecastIndex(forecasts, index),
    hasGeneration: (generation?.zones.length ?? 0) > 0,
    hasPlanned: pairs.some((p) => p.scheduled?.series.states.some((s) => s !== "missing")),
  };
}

/** Sum the zone directions of a capacity file into node directions; borders inside a node drop. */
export function aggregateCapacity(
  file: CapacityFile | null,
  index: NodeIndex,
): Map<string, TimeSeries> {
  const acc = new Map<string, TimeSeries[]>();
  for (const b of file?.borders ?? []) {
    const a = index.nodeOfZone.get(b.from_zone);
    const z = index.nodeOfZone.get(b.to_zone);
    if (!a || !z || a === z) continue;
    const list = acc.get(`${a}>${z}`) ?? [];
    list.push(b.series);
    acc.set(`${a}>${z}`, list);
  }
  const out = new Map<string, TimeSeries>();
  for (const [k, list] of acc)
    out.set(k, sumSeries(list.map((series) => ({ series, sign: 1 as const }))));
  return out;
}

function forecastIndex(file: ForecastsFile | null, index: NodeIndex): Map<string, TimeSeries[]> {
  const byZone = new Map((file?.zones ?? []).map((z) => [z.zone, z.load]));
  const out = new Map<string, TimeSeries[]>();
  for (const n of index.nodes) {
    const list = n.zones.map((z) => byZone.get(z));
    // A node with one zone left out of the file would give a partial sum: leave it missing.
    if (list.every((s): s is TimeSeries => s !== undefined)) out.set(n.id, list);
  }
  return out;
}

/** Day-ahead load forecast of a node at one hour (state planned or missing). */
export function loadForecastAt(m: Model, nodeId: string, hour: number): Point {
  const list = m.loadForecast.get(nodeId);
  return list ? combine(list.map((s) => pointAt(s, hour))) : MISSING;
}

/**
 * Net position of a node from measured physical flows only (MW). Positive = net importer.
 * Missing after the latest measured hour, and when any of its borders has no value.
 */
export function netPhysicalAt(m: Model, nodeId: string, hour: number): Point {
  if (hour >= m.measuredEnd) return MISSING;
  const parts = m.pairs
    .filter((p) => p.from === nodeId || p.to === nodeId)
    .map((p) => {
      const q = p.physical ? pointAt(p.physical.series, hour) : MISSING;
      return q.value === null || p.to === nodeId ? q : { ...q, value: -q.value };
    });
  return combine(parts);
}

/** How full a border is at one hour: measured flow against the capacity in the same direction. */
export interface BorderUse {
  /** Measured (or modelled) flow; positive = from `pair.from` to `pair.to`. */
  flow: Point;
  /** Day-ahead capacity offered in the direction of the flow (planned or missing). */
  capacity: Point;
  /** 0 or more; can pass 1 (flows can exceed the day-ahead figure). Takes the flow's state. */
  share: Point;
}

export function borderUseAt(m: Model, pair: BorderPair, hour: number): BorderUse {
  const flow =
    hour < m.measuredEnd && pair.physical ? pointAt(pair.physical.series, hour) : MISSING;
  const dir =
    flow.value !== null && flow.value < 0 ? `${pair.to}>${pair.from}` : `${pair.from}>${pair.to}`;
  const cap = m.capacity.get(dir);
  const capacity = cap ? pointAt(cap, hour) : MISSING;
  if (flow.value === null || capacity.value === null || capacity.value <= 0)
    return { flow, capacity, share: MISSING };
  return { flow, capacity, share: { ...flow, value: Math.abs(flow.value) / capacity.value } };
}

/** The border with the highest average share of its offered capacity (measured hours). */
export function fullestPair(m: Model): BorderPair | undefined {
  let best: BorderPair | undefined;
  let bestScore = -1;
  for (const p of m.pairs) {
    let sum = 0;
    let n = 0;
    for (const h of m.hours) {
      if (h >= m.measuredEnd) break;
      const s = borderUseAt(m, p, h).share.value;
      if (s === null) continue;
      sum += s;
      n++;
    }
    const score = n ? sum / n : -1;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best ?? m.pairs[0];
}

/**
 * Share of borders that must have a measured flow for the map to open on an hour. The newest
 * hours are often still incomplete, because grid operators report with a delay.
 */
export const OPENING_COVERAGE = 0.9;

/** Share (0–1) of borders with a measured physical flow at one hour. null if no border has a series. */
export function measuredCoverageAt(m: Model, hour: number): number | null {
  const withSeries = m.pairs.filter((p) => p.physical);
  if (!withSeries.length) return null;
  const measured = withSeries.filter((p) => pointAt(p.physical!.series, hour).state === "measured");
  return measured.length / withSeries.length;
}

/**
 * Hour the map opens on: the newest measured hour where at least OPENING_COVERAGE of borders
 * have a measured flow. Searches the measured past only, never planned hours. If no hour in the
 * window reaches the threshold, it is the newest measured hour.
 */
export function openingHour(m: Model): number {
  const newest = m.measuredEnd - HOUR_MS;
  for (let i = m.hours.length - 1; i >= 0; i--) {
    const h = m.hours[i]!;
    if (h > newest) continue;
    const c = measuredCoverageAt(m, h);
    if (c !== null && c >= OPENING_COVERAGE) return h;
  }
  return newest;
}

export const flowsAt = (m: Model, hour: number): FlowAt[] =>
  m.pairs.map((p) => flowAt(p, hour, m.measuredEnd));

export function layerValue(
  m: Model,
  layer: LayerId,
  nodeId: string,
  hour: number,
  flows: FlowAt[],
): Point {
  if (layer === "netImport") return netImportAt(nodeId, flows);
  if (layer === "loadForecast") return loadForecastAt(m, nodeId, hour);
  return generationAt(m.gen, nodeId, hour)?.renewableShare ?? MISSING;
}

/** Pair key, e.g. "ES>FR". */
export const pairKey = (p: { from: string; to: string }): string => `${p.from}>${p.to}`;
