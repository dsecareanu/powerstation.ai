// Zone-level data center impact. Pure functions, no DOM. Every result is `modelled`.
import {
  FUEL_TYPES,
  type BorderSeries,
  type Datacenter,
  type DirectedCapacity,
  type FuelType,
  type ZoneGeneration,
} from "@powerstation/schema";
import { HOUR_MS, isoHour, sampleAt } from "./series";
import {
  MERIT_ORDER,
  type CalcResult,
  type CarbonResult,
  type Direction,
  type EmissionFactors,
  type ExtraSource,
  type PressureResult,
} from "./types";

/** Hours with import pressure above this share of capacity are flagged. */
export const PRESSURE_THRESHOLD = 0.9;

export interface CalcInput {
  zone: string;
  /** Data center size in MW. Flat load: the same extra load every hour. */
  sizeMw: number;
  generation: ZoneGeneration;
  /** Data window: only hours in [start, end) are used. Value i covers start + i hours. */
  window: { start: string; end: string };
  /** All borders in the flows file. Only `physical` borders that touch the zone are used. */
  borders: BorderSeries[];
  /** All directions in the capacity file. Undefined = capacity data is not available. */
  capacity: DirectedCapacity[] | undefined;
  /** Undefined = emission factors are not available. */
  emissionFactors: EmissionFactors | undefined;
  datacenters: Datacenter[];
}

interface Hour {
  ms: number;
  load: number;
  /** Fuel outputs this hour, MW. */
  fuels: Partial<Record<FuelType, number>>;
  modelled: boolean;
}

/** Net physical imports into the zone this hour, or null if a touching border has no value. */
export function netImportsAt(
  borders: BorderSeries[],
  zone: string,
  hourMs: number,
): { mw: number; modelled: boolean } | null {
  let sum = 0;
  let modelled = false;
  for (const b of borders) {
    if (b.kind !== "physical") continue;
    const into = b.to_zone === zone;
    const out = b.from_zone === zone;
    if (!into && !out) continue;
    const s = sampleAt(b.series, hourMs);
    if (s.value === null) return null;
    sum += into ? s.value : -s.value;
    if (s.state === "modelled") modelled = true;
  }
  return { mw: sum, modelled };
}

/**
 * Carbon intensity of the domestic mix in gCO2eq/kWh, or null if no running fuel has a factor.
 * Fuels without a factor (`value: null`) are left out of both sums. They are never counted as 0.
 */
export function carbonIntensity(
  fuels: Partial<Record<FuelType, number>>,
  factors: EmissionFactors,
): number | null {
  let weighted = 0;
  let total = 0;
  for (const fuel of FUEL_TYPES) {
    const mw = fuels[fuel];
    if (mw === undefined || mw <= 0) continue;
    const ef = factors[fuel].value;
    if (ef === null) continue;
    weighted += mw * ef;
    total += mw;
  }
  return total > 0 ? weighted / total : null;
}

/**
 * Import directions (neighbour to zone) of the zone's physical borders, split into the ones that
 * have a capacity entry and the ones that do not.
 */
export function importDirections(
  borders: BorderSeries[],
  capacity: DirectedCapacity[],
  zone: string,
): { found: DirectedCapacity[]; missing: Direction[]; borderCount: number } {
  const neighbours = new Set<string>();
  for (const b of borders) {
    if (b.kind !== "physical") continue;
    if (b.to_zone === zone) neighbours.add(b.from_zone);
    else if (b.from_zone === zone) neighbours.add(b.to_zone);
  }
  const found: DirectedCapacity[] = [];
  const missing: Direction[] = [];
  for (const n of neighbours) {
    const d = capacity.find((c) => c.from_zone === n && c.to_zone === zone);
    if (d) found.push(d);
    else missing.push({ from: n, to: zone });
  }
  return { found, missing, borderCount: neighbours.size };
}

/** Total import capacity into the zone this hour, or null if any direction has no value. */
export function importCapacityAt(found: DirectedCapacity[], hourMs: number): number | null {
  let sum = 0;
  for (const d of found) {
    const v = sampleAt(d.series, hourMs).value;
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

/**
 * Interconnector pressure (worst case: all extra load is imported).
 * Not computed at all if a physical border has no capacity for the import direction.
 */
function computePressure(
  hours: { ms: number }[],
  input: Pick<CalcInput, "zone" | "sizeMw" | "borders">,
  capacity: DirectedCapacity[],
): { result: PressureResult; modelledMs: Set<number> } {
  const { zone, sizeMw, borders } = input;
  const modelledMs = new Set<number>();
  const { found, missing, borderCount } = importDirections(borders, capacity, zone);
  if (missing.length > 0 || borderCount === 0) {
    return { result: { available: false, missingDirections: missing }, modelledMs };
  }
  let counted = 0;
  let above = 0;
  let max: number | null = null;
  let capacitySum = 0;
  for (const h of hours) {
    const cap = importCapacityAt(found, h.ms);
    const net = netImportsAt(borders, zone, h.ms);
    if (cap === null || cap <= 0 || net === null) continue;
    counted++;
    capacitySum += cap;
    if (net.modelled) modelledMs.add(h.ms);
    const p = (net.mw + sizeMw) / cap;
    if (p > PRESSURE_THRESHOLD) above++;
    if (max === null || p > max) max = p;
  }
  return {
    result: {
      available: true,
      directions: found.map((d) => ({ from: d.from_zone, to: d.to_zone })),
      hoursCounted: counted,
      hoursLeftOut: hours.length - counted,
      hoursAboveThreshold: above,
      maxPressure: max,
      meanCapacityMw: counted > 0 ? capacitySum / counted : null,
      threshold: PRESSURE_THRESHOLD,
    },
    modelledMs,
  };
}

function computeCarbon(
  hours: { ms: number; fuels: Partial<Record<FuelType, number>> }[],
  factors: EmissionFactors,
): CarbonResult {
  const hourly: { hour: string; gPerKwh: number }[] = [];
  const mwhByFuel = new Map<FuelType, number>();
  let totalMwh = 0;
  for (const h of hours) {
    const v = carbonIntensity(h.fuels, factors);
    if (v !== null) hourly.push({ hour: isoHour(h.ms), gPerKwh: v });
    for (const fuel of FUEL_TYPES) {
      const mw = h.fuels[fuel];
      if (mw === undefined || mw <= 0) continue;
      mwhByFuel.set(fuel, (mwhByFuel.get(fuel) ?? 0) + mw);
      totalMwh += mw;
    }
  }
  const values = hourly.map((x) => x.gPerKwh);
  const noFactorFuels = FUEL_TYPES.filter((f) => mwhByFuel.has(f) && factors[f].value === null)
    .map((fuel) => ({
      fuel,
      share: mwhByFuel.get(fuel)! / totalMwh,
      note: factors[fuel].note,
    }))
    .sort((a, b) => b.share - a.share);
  const proxyFuels = FUEL_TYPES.flatMap((fuel) => {
    const f = factors[fuel];
    return mwhByFuel.has(fuel) && f.match === "proxy" && f.value !== null
      ? [{ fuel, value: f.value, note: f.note }]
      : [];
  });
  return {
    hourly,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    excludedHours: hours.length - hourly.length,
    noFactor: {
      share: totalMwh > 0 ? noFactorFuels.reduce((a, f) => a + f.share, 0) : 0,
      fuels: noFactorFuels,
    },
    proxyFuels,
  };
}

/** First fuel in merit order that can add `sizeMw` this hour; else imports. */
export function likelyExtraSource(
  fuels: Partial<Record<FuelType, number>>,
  maxByFuel: Partial<Record<FuelType, number>>,
  sizeMw: number,
): ExtraSource {
  for (const source of MERIT_ORDER) {
    if (source === "imports") break;
    const output = fuels[source];
    const max = maxByFuel[source];
    if (output === undefined || max === undefined) continue;
    if (output > 0 && max - output >= sizeMw) return source;
  }
  return "imports";
}

export function calculate(input: CalcInput): CalcResult {
  const { zone, sizeMw, generation, capacity, emissionFactors } = input;
  const startMs = Date.parse(input.window.start);
  const endMs = Date.parse(input.window.end);
  const fuelsPresent = FUEL_TYPES.filter((f) => generation.generation[f] !== undefined);

  const hours: Hour[] = [];
  let totalHours = 0;
  for (let ms = startMs; ms < endMs; ms += HOUR_MS) {
    totalHours++;
    const load = sampleAt(generation.load, ms);
    if (load.value === null) continue;
    let modelled = load.state === "modelled";
    const fuels: Partial<Record<FuelType, number>> = {};
    let complete = true;
    for (const fuel of fuelsPresent) {
      const s = sampleAt(generation.generation[fuel], ms);
      if (s.value === null) {
        complete = false;
        break;
      }
      fuels[fuel] = s.value;
      if (s.state === "modelled") modelled = true;
    }
    if (!complete) continue;
    hours.push({ ms, load: load.value, fuels, modelled });
  }

  const validHours = hours.length;
  const base = {
    zone,
    sizeMw,
    totalHours,
    validHours,
    hoursWithoutData: totalHours - validHours,
    datacenters: summariseDatacenters(input.datacenters),
  };
  if (validHours === 0) {
    return {
      ...base,
      modelledInputHours: 0,
      dataWindow: null,
      load: null,
      imports: null,
      pressure: capacity ? computePressure([], input, capacity).result : null,
      carbon: emissionFactors ? computeCarbon([], emissionFactors) : null,
      extraSource: [],
    };
  }

  const generationOf = (h: Hour): number =>
    fuelsPresent.reduce((sum, f) => sum + (h.fuels[f] ?? 0), 0);

  // Load.
  const meanMw = hours.reduce((s, h) => s + h.load, 0) / validHours;
  const maxMw = Math.max(...hours.map((h) => h.load));

  // Imports.
  let hoursWith = 0;
  let hoursWithout = 0;
  for (const h of hours) {
    const gen = generationOf(h);
    if (h.load - gen > 0) hoursWithout++;
    if (h.load + sizeMw - gen > 0) hoursWith++;
  }

  // Interconnector pressure.
  let pressure: CalcResult["pressure"] = null;
  let modelledMs = new Set<number>();
  if (capacity) ({ result: pressure, modelledMs } = computePressure(hours, input, capacity));

  // Carbon intensity.
  const carbon = emissionFactors ? computeCarbon(hours, emissionFactors) : null;

  // Likely extra source.
  const maxByFuel: Partial<Record<FuelType, number>> = {};
  for (const f of fuelsPresent) maxByFuel[f] = Math.max(...hours.map((h) => h.fuels[f] ?? 0));
  const counts = new Map<ExtraSource, number>();
  for (const h of hours) {
    const s = likelyExtraSource(h.fuels, maxByFuel, sizeMw);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const extraSource = MERIT_ORDER.filter((s) => counts.has(s)).map((source) => ({
    source,
    hours: counts.get(source)!,
    share: counts.get(source)! / validHours,
  }));

  // Modelled inputs: generation or load, plus borders when pressure is computed.
  const modelledInputHours = hours.filter((h) => h.modelled || modelledMs.has(h.ms)).length;

  return {
    ...base,
    modelledInputHours,
    dataWindow: {
      firstValidHour: isoHour(hours[0]!.ms),
      lastValidHour: isoHour(hours[validHours - 1]!.ms),
    },
    load: { meanMw, maxMw, shareOfMean: sizeMw / meanMw, shareOfMax: sizeMw / maxMw },
    imports: { hoursWith, hoursWithout },
    pressure,
    carbon,
    extraSource,
  };
}

export function summariseDatacenters(records: Datacenter[]): CalcResult["datacenters"] {
  let withKnownPower = 0;
  let knownPowerMw = 0;
  let unknownPower = 0;
  for (const d of records) {
    if (d.power_mw === null) unknownPower++;
    else {
      withKnownPower++;
      knownPowerMw += d.power_mw;
    }
  }
  return { withKnownPower, knownPowerMw, unknownPower, records };
}
