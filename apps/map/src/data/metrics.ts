// Per-node values at one hour: flows on the map, net imports, generation mix, load.
import type { FlowsFile, FuelType, GenerationFile, TimeSeries } from "@powerstation/schema";
import { FUEL_TYPES } from "@powerstation/schema";
import type { NodeBorder, NodeIndex } from "./nodes";
import { HOUR_MS, MISSING, type Point, combine, pointAt, seriesEndMs, toMs } from "./series";

/**
 * Fuel types counted as renewable for the "renewables share" layer.
 * Left out: hydro_pumped_storage (stores energy, net can be negative), waste (partly fossil),
 * nuclear and fossil fuels. The share is renewables / total generation without pumped storage.
 */
export const RENEWABLE_FUELS: readonly FuelType[] = [
  "biomass",
  "geothermal",
  "hydro_run_of_river",
  "hydro_reservoir",
  "wind_onshore",
  "wind_offshore",
  "solar",
  "other_renewable",
];

/** Start (inclusive) of the first hour after the newest measured flow hour. */
export function measuredEndMs(flows: FlowsFile): number {
  let end = toMs(flows.window.start);
  for (const b of flows.borders)
    if (b.kind === "physical") end = Math.max(end, seriesEndMs(b.series));
  return end;
}

/** The flow shown on the map for one node border pair at one hour. */
export interface FlowAt {
  from: string;
  to: string;
  /** physical before measuredEnd, scheduled ("planned trade") from measuredEnd on. */
  kind: "physical" | "scheduled";
  point: Point;
}

/** Group node borders by node pair, so physical and scheduled sit together. */
export function pairBorders(borders: NodeBorder[]) {
  const pairs = new Map<
    string,
    { from: string; to: string; physical?: NodeBorder; scheduled?: NodeBorder }
  >();
  for (const b of borders) {
    const k = `${b.from}>${b.to}`;
    let p = pairs.get(k);
    if (!p) pairs.set(k, (p = { from: b.from, to: b.to }));
    p[b.kind] = b;
  }
  return [...pairs.values()];
}

export type BorderPair = ReturnType<typeof pairBorders>[number];

export function flowAt(pair: BorderPair, hourMs: number, measuredEnd: number): FlowAt {
  const kind = hourMs < measuredEnd ? "physical" : "scheduled";
  const b = pair[kind];
  return { from: pair.from, to: pair.to, kind, point: b ? pointAt(b.series, hourMs) : MISSING };
}

/** Net import of a node at one hour (MW). Positive = the node imports. */
export function netImportAt(nodeId: string, flows: FlowAt[]): Point {
  const parts = flows
    .filter((f) => f.from === nodeId || f.to === nodeId)
    .map((f) =>
      f.point.value === null || f.to === nodeId ? f.point : { ...f.point, value: -f.point.value },
    );
  return combine(parts);
}

export interface NodeGeneration {
  load: Point;
  /** Only fuel types that at least one zone of the node has. */
  byFuel: Partial<Record<FuelType, Point>>;
  /** Sum of all fuels except pumped storage. */
  total: Point;
  /** 0–1. */
  renewableShare: Point;
}

/** Generation series of the node's zones, indexed once per file. */
export function generationIndex(file: GenerationFile, index: NodeIndex) {
  const byNode = new Map<string, { load: TimeSeries[]; fuels: Map<FuelType, TimeSeries[]> }>();
  for (const z of file.zones) {
    const nodeId = index.nodeOfZone.get(z.zone);
    if (!nodeId) continue;
    let e = byNode.get(nodeId);
    if (!e) byNode.set(nodeId, (e = { load: [], fuels: new Map() }));
    e.load.push(z.load);
    for (const fuel of FUEL_TYPES) {
      const s = z.generation[fuel];
      if (!s) continue;
      const list = e.fuels.get(fuel) ?? [];
      list.push(s);
      e.fuels.set(fuel, list);
    }
  }
  return byNode;
}

export type GenerationIndex = ReturnType<typeof generationIndex>;

export function generationAt(
  gen: GenerationIndex,
  nodeId: string,
  hourMs: number,
): NodeGeneration | null {
  const e = gen.get(nodeId);
  if (!e) return null;
  const at = (list: TimeSeries[]) => combine(list.map((s) => pointAt(s, hourMs)));
  const byFuel: NodeGeneration["byFuel"] = {};
  for (const [fuel, list] of e.fuels) byFuel[fuel] = at(list);
  const counted = FUEL_TYPES.filter((f) => f !== "hydro_pumped_storage" && byFuel[f]).map(
    (f) => byFuel[f]!,
  );
  const total = combine(counted);
  const renewList = RENEWABLE_FUELS.filter((f) => byFuel[f]).map((f) => byFuel[f]!);
  // A node with no renewable fuel type has a share of 0 (absent is not a gap).
  const renew: Point = renewList.length ? combine(renewList) : { value: 0, state: "measured" };
  return { load: at(e.load), byFuel, total, renewableShare: share(renew, total) };
}

function share(part: Point, total: Point): Point {
  if (part.value === null || total.value === null || total.value <= 0) return MISSING;
  const modelled = part.state === "modelled" || total.state === "modelled";
  const method = part.method ?? total.method;
  const value = part.value / total.value;
  if (!modelled) return { value, state: total.state };
  return method ? { value, state: "modelled", method } : { value, state: "modelled" };
}

/** All hour starts of the timeline, from window start to window end. */
export function timelineHours(startIso: string, endIso: string): number[] {
  const out: number[] = [];
  for (let t = toMs(startIso); t < toMs(endIso); t += HOUR_MS) out.push(t);
  return out;
}
