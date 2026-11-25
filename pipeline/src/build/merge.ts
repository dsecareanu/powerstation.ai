// Merges a fresh (short) build into the existing rolling files.
//
// Rule for each hour of the new window:
// - a new value (not null) wins;
// - else an old value (not null) is kept, with its state;
// - else the hour is missing.
// Hours outside the new window are dropped.
import {
  SCHEMA_VERSION,
  type CapacityFile,
  type DataFile,
  type DataState,
  type FlowsFile,
  type FuelType,
  type GenerationFile,
  type TimeSeries,
  type ZonesFile,
} from "@powerstation/schema";
import { validateDataFile } from "@powerstation/schema/validate";
import { HOUR_MS } from "../entsoe/parse";
import { iso } from "./files";

export interface MergeContext {
  /** Start of the new window (ms). */
  startMs: number;
  /** Current UTC hour (ms). Physical flows and generation end here. */
  nowMs: number;
  /** Series for zones or borders that are not in this file are dropped. */
  zones: ZonesFile;
  log?: (message: string) => void;
}

// ---------- reading existing files ----------

/**
 * Parses an existing file from R2. Returns null (and logs why) if the file is
 * absent, is not valid JSON, has another schema version, fails validation or is a mock.
 */
export function parseExisting<T extends DataFile>(
  text: string | null,
  dataset: T["dataset"],
  label: string,
  log: (message: string) => void = () => {},
): T | null {
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    log(`Ignoring existing ${label}: not valid JSON.`);
    return null;
  }
  const version = (data as { schema_version?: unknown } | null)?.schema_version;
  if (version !== SCHEMA_VERSION) {
    log(
      `Ignoring existing ${label}: schema_version ${JSON.stringify(version)}, expected ${SCHEMA_VERSION}.`,
    );
    return null;
  }
  const result = validateDataFile(data);
  if (!result.ok || result.dataset !== dataset) {
    const why = result.ok ? `dataset is ${result.dataset}` : result.errors.slice(0, 3).join("; ");
    log(`Ignoring existing ${label}: ${why}`);
    return null;
  }
  if ((data as { mock?: unknown }).mock !== false) {
    log(`Ignoring existing ${label}: mock is not false.`);
    return null;
  }
  return data as T;
}

// ---------- one series ----------

function valueAt(ts: TimeSeries | undefined, t: number): { v: number | null; s: DataState } | null {
  if (!ts) return null;
  const idx = (t - Date.parse(ts.start)) / HOUR_MS;
  if (!Number.isInteger(idx) || idx < 0 || idx >= ts.values.length) return null;
  return { v: ts.values[idx] ?? null, s: ts.states[idx] ?? "missing" };
}

/** Merges an old and a fresh series onto the hours [startMs, endMs). */
export function mergeTimeSeries(
  old: TimeSeries | undefined,
  fresh: TimeSeries | undefined,
  startMs: number,
  endMs: number,
): TimeSeries {
  const values: (number | null)[] = [];
  const states: DataState[] = [];
  let modelledFromFresh = false;
  let modelledFromOld = false;
  for (let t = startMs; t < endMs; t += HOUR_MS) {
    const f = valueAt(fresh, t);
    const o = valueAt(old, t);
    if (f && f.v !== null) {
      values.push(f.v);
      states.push(f.s);
      if (f.s === "modelled") modelledFromFresh = true;
    } else if (o && o.v !== null) {
      values.push(o.v);
      states.push(o.s);
      if (o.s === "modelled") modelledFromOld = true;
    } else {
      values.push(null);
      states.push("missing");
    }
  }
  const method = (modelledFromFresh && fresh?.method) || (modelledFromOld && old?.method) || "";
  return {
    start: iso(startMs),
    resolution: "PT1H",
    unit: "MW",
    values,
    states,
    ...(method ? { method } : {}),
  };
}

const isEmpty = (ts: TimeSeries): boolean => ts.values.every((v) => v === null);

/** Cuts a series so that it starts at startMs (no change if it starts later). */
export function cutTimeSeries(ts: TimeSeries, startMs: number): TimeSeries {
  const first = Date.parse(ts.start);
  if (startMs <= first) return ts;
  const skip = Math.round((startMs - first) / HOUR_MS);
  return {
    ...ts,
    start: iso(startMs),
    values: ts.values.slice(skip),
    states: ts.states.slice(skip),
  };
}

// ---------- files ----------

function neighbours(zones: ZonesFile, a: string, b: string): boolean {
  return zones.zones.find((z) => z.id === a)?.neighbours.includes(b) ?? false;
}

/** Merges the series of two lists by identity key. Old-only series that have no value are dropped. */
function mergeByKey<T>(
  old: T[],
  fresh: T[],
  key: (item: T) => string,
  seriesOf: (item: T) => TimeSeries,
  endOf: (item: T) => number,
  ctx: MergeContext,
  keep: (item: T) => boolean,
  label: string,
): (T & { merged: TimeSeries })[] {
  const oldMap = new Map<string, T>();
  for (const o of old) {
    if (keep(o)) oldMap.set(key(o), o);
    else ctx.log?.(`Dropped old ${label} ${key(o)}: not in zones.json.`);
  }
  const freshMap = new Map(fresh.map((f) => [key(f), f]));
  const out: (T & { merged: TimeSeries })[] = [];
  for (const k of [...new Set([...oldMap.keys(), ...freshMap.keys()])].sort()) {
    const o = oldMap.get(k);
    const f = freshMap.get(k);
    const base = (f ?? o)!;
    const merged = mergeTimeSeries(
      o ? seriesOf(o) : undefined,
      f ? seriesOf(f) : undefined,
      ctx.startMs,
      endOf(base),
    );
    if (!f && isEmpty(merged)) {
      ctx.log?.(`Dropped old ${label} ${k}: no value in the new window.`);
      continue;
    }
    out.push({ ...base, merged });
  }
  return out;
}

export function mergeFlows(old: FlowsFile | null, fresh: FlowsFile, ctx: MergeContext): FlowsFile {
  const windowEnd = Date.parse(fresh.window.end);
  const borders = mergeByKey(
    old?.borders ?? [],
    fresh.borders,
    (b) => `${b.from_zone}|${b.to_zone}|${b.kind}`,
    (b) => b.series,
    (b) => (b.kind === "physical" ? ctx.nowMs : windowEnd),
    ctx,
    (b) => neighbours(ctx.zones, b.from_zone, b.to_zone),
    "flow series",
  ).map((b) => ({
    from_zone: b.from_zone,
    to_zone: b.to_zone,
    kind: b.kind,
    series: b.merged,
  }));
  return { ...fresh, window: { start: iso(ctx.startMs), end: fresh.window.end }, borders };
}

export function mergeCapacity(
  old: CapacityFile | null,
  fresh: CapacityFile,
  ctx: MergeContext,
): CapacityFile {
  const windowEnd = Date.parse(fresh.window.end);
  const borders = mergeByKey(
    old?.borders ?? [],
    fresh.borders,
    (b) => `${b.from_zone}|${b.to_zone}`,
    (b) => b.series,
    () => windowEnd,
    ctx,
    (b) => neighbours(ctx.zones, b.from_zone, b.to_zone),
    "capacity series",
  ).map((b) => ({ from_zone: b.from_zone, to_zone: b.to_zone, series: b.merged }));
  return { ...fresh, window: { start: iso(ctx.startMs), end: fresh.window.end }, borders };
}

export function mergeGeneration(
  old: GenerationFile | null,
  fresh: GenerationFile,
  ctx: MergeContext,
): GenerationFile {
  const known = new Set(ctx.zones.zones.map((z) => z.id));
  const oldZones = new Map((old?.zones ?? []).map((z) => [z.zone, z]));
  const freshZones = new Map(fresh.zones.map((z) => [z.zone, z]));
  const zones: GenerationFile["zones"] = [];
  for (const id of [...new Set([...oldZones.keys(), ...freshZones.keys()])].sort()) {
    if (!known.has(id)) {
      ctx.log?.(`Dropped old generation zone ${id}: not in zones.json.`);
      continue;
    }
    const o = oldZones.get(id);
    const f = freshZones.get(id);
    const load = mergeTimeSeries(o?.load, f?.load, ctx.startMs, ctx.nowMs);
    const generation: Partial<Record<FuelType, TimeSeries>> = {};
    const fuels = new Set([
      ...Object.keys(o?.generation ?? {}),
      ...Object.keys(f?.generation ?? {}),
    ]) as Set<FuelType>;
    for (const fuel of [...fuels].sort()) {
      const merged = mergeTimeSeries(
        o?.generation[fuel],
        f?.generation[fuel],
        ctx.startMs,
        ctx.nowMs,
      );
      if (!f?.generation[fuel] && isEmpty(merged)) continue;
      generation[fuel] = merged;
    }
    if (!f && isEmpty(load) && Object.keys(generation).length === 0) continue;
    zones.push({ zone: id, load, generation });
  }
  return { ...fresh, window: { start: iso(ctx.startMs), end: iso(ctx.nowMs) }, zones };
}

// ---------- 7-day files ----------

export function cutFlows(file: FlowsFile, startMs: number): FlowsFile {
  return {
    ...file,
    window: { start: iso(Math.max(startMs, Date.parse(file.window.start))), end: file.window.end },
    borders: file.borders.map((b) => ({ ...b, series: cutTimeSeries(b.series, startMs) })),
  };
}

export function cutGeneration(file: GenerationFile, startMs: number): GenerationFile {
  return {
    ...file,
    window: { start: iso(Math.max(startMs, Date.parse(file.window.start))), end: file.window.end },
    zones: file.zones.map((z) => ({
      zone: z.zone,
      load: cutTimeSeries(z.load, startMs),
      generation: Object.fromEntries(
        Object.entries(z.generation).map(([fuel, s]) => [fuel, cutTimeSeries(s, startMs)]),
      ),
    })),
  };
}
