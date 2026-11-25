// Builds the data files (as defined in /schema) from hourly series.
import {
  DATA_PATHS,
  SCHEMA_VERSION,
  type CapacityFile,
  type DataFile,
  type DataState,
  type FileStatus,
  type ForecastsFile,
  type FlowsFile,
  type FuelType,
  type GenerationFile,
  type StatusFile,
  type TimeSeries,
} from "@powerstation/schema";
import { HOUR_MS } from "../entsoe/parse";
import { diffHourly, negateHourly, type Hourly } from "./hourly";
import type { Warnings } from "./warnings";

export const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/** Hourly values that start at `start` (ms). */
export interface Series {
  start: number;
  values: Hourly;
}

export const seriesEnd = (s: Series): number => s.start + s.values.length * HOUR_MS;

/** The part of a series from newStart on. */
export function cut(s: Series, newStart: number): Series {
  if (newStart <= s.start) return s;
  return { start: newStart, values: s.values.slice(Math.round((newStart - s.start) / HOUR_MS)) };
}

function timeSeries(s: Series, state: "measured" | "planned"): TimeSeries {
  const states: DataState[] = s.values.map((v) => (v === null ? "missing" : state));
  return { start: iso(s.start), resolution: "PT1H", unit: "MW", values: s.values, states };
}

const envelope = (generatedAt: string) => ({
  schema_version: SCHEMA_VERSION,
  generated_at: generatedAt,
  mock: false as const,
  source: "ENTSO-E Transparency Platform",
  source_url: "https://transparency.entsoe.eu/",
  license: "AGPL-3.0-only",
  attribution:
    "Source: ENTSO-E Transparency Platform (transparency.entsoe.eu). Hourly averages and netted border flows computed by powerstation.ai. ENTSO-E open data items are licensed CC BY 4.0.",
});

// ---------- netting ----------

export interface Netted {
  values: Hourly;
  /** Set when one direction was not published at all: the direction that was used. */
  oneSided?: "a_to_b" | "b_to_a";
}

/**
 * Net flow of one border, from A to B (A < B). Each side is null if ENTSO-E
 * published nothing for that direction in the whole window. Returns null if both are null.
 */
export function netBorder(aToB: Hourly | null, bToA: Hourly | null): Netted | null {
  if (!aToB && !bToA) return null;
  if (aToB && bToA) return { values: diffHourly(aToB, bToA) };
  if (aToB) return { values: aToB, oneSided: "a_to_b" };
  return { values: negateHourly(bToA!), oneSided: "b_to_a" };
}

// ---------- file builders ----------

export interface FlowBorder {
  from: string;
  to: string;
  kind: "physical" | "scheduled";
  series: Series;
}

export function flowsFile(
  borders: FlowBorder[],
  windowStart: number,
  windowEnd: number,
  generatedAt: string,
): FlowsFile {
  return {
    ...envelope(generatedAt),
    dataset: "flows",
    window: { start: iso(windowStart), end: iso(windowEnd) },
    borders: borders.map((b) => ({
      from_zone: b.from,
      to_zone: b.to,
      kind: b.kind,
      series: timeSeries(
        cut(b.series, windowStart),
        b.kind === "physical" ? "measured" : "planned",
      ),
    })),
  };
}

export interface DirectedCapacitySeries {
  from: string;
  to: string;
  series: Series;
}

export function capacityFile(
  list: DirectedCapacitySeries[],
  windowStart: number,
  windowEnd: number,
  generatedAt: string,
): CapacityFile {
  for (const c of list) {
    if (c.series.values.some((v) => v !== null && v < 0)) {
      throw new Error(`Negative capacity on ${c.from} -> ${c.to}`);
    }
  }
  return {
    ...envelope(generatedAt),
    dataset: "capacity",
    window: { start: iso(windowStart), end: iso(windowEnd) },
    borders: list.map((c) => ({
      from_zone: c.from,
      to_zone: c.to,
      series: timeSeries(cut(c.series, windowStart), "planned"),
    })),
  };
}

export interface ZoneSeries<K extends string> {
  zone: string;
  load: Series;
  generation: Partial<Record<K, Series>>;
}

export function generationFile(
  zones: ZoneSeries<FuelType>[],
  windowStart: number,
  windowEnd: number,
  generatedAt: string,
): GenerationFile {
  return {
    ...envelope(generatedAt),
    dataset: "generation",
    window: { start: iso(windowStart), end: iso(windowEnd) },
    zones: zones.map((z) => ({
      zone: z.zone,
      load: timeSeries(cut(z.load, windowStart), "measured"),
      generation: Object.fromEntries(
        Object.entries(z.generation).map(([fuel, s]) => [
          fuel,
          timeSeries(cut(s as Series, windowStart), "measured"),
        ]),
      ),
    })),
  };
}

export function forecastsFile(
  zones: ZoneSeries<"solar" | "wind_offshore" | "wind_onshore">[],
  windowStart: number,
  windowEnd: number,
  generatedAt: string,
): ForecastsFile {
  return {
    ...envelope(generatedAt),
    dataset: "forecasts",
    window: { start: iso(windowStart), end: iso(windowEnd) },
    zones: zones.map((z) => ({
      zone: z.zone,
      load: timeSeries(z.load, "planned"),
      generation: Object.fromEntries(
        Object.entries(z.generation).map(([kind, s]) => [kind, timeSeries(s as Series, "planned")]),
      ),
    })),
  };
}

// ---------- status ----------

/** End of the newest hour with a measured value, or null. */
export function newestMeasuredAt(file: DataFile): string | null {
  let newest: number | null = null;
  const scan = (s: TimeSeries) => {
    const start = Date.parse(s.start);
    s.states.forEach((st, i) => {
      if (st === "measured") {
        const end = start + (i + 1) * HOUR_MS;
        if (newest === null || end > newest) newest = end;
      }
    });
  };
  if (file.dataset === "flows") file.borders.forEach((b) => scan(b.series));
  if (file.dataset === "generation") {
    for (const z of file.zones) {
      scan(z.load);
      Object.values(z.generation).forEach(scan);
    }
  }
  return newest === null ? null : iso(newest);
}

const KNOWN_PATHS = new Set<string>(Object.values(DATA_PATHS));

export function statusFile(
  written: Record<string, DataFile>,
  generatedAt: string,
  warnings: Warnings,
): StatusFile {
  const files: FileStatus[] = Object.entries(written).map(([path, file]) => {
    if (!KNOWN_PATHS.has(path)) throw new Error(`Unknown data path ${path}`);
    if (file.dataset === "status") throw new Error("status.json cannot list itself");
    return {
      path,
      dataset: file.dataset,
      updated_at: generatedAt,
      newest_measured_at: newestMeasuredAt(file),
      ok: true,
    };
  });
  return {
    ...envelope(generatedAt),
    dataset: "status",
    files,
    sources: [
      {
        id: "entsoe",
        name: "ENTSO-E Transparency Platform",
        last_success_at: generatedAt,
        last_attempt_at: generatedAt,
        ok: true,
        ...(warnings.size > 0 ? { message: `${warnings.size} warning type(s) in this run` } : {}),
      },
    ],
  };
}
