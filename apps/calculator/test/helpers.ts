import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FUEL_TYPES,
  type BorderSeries,
  type DataState,
  type DirectedCapacity,
  type EmissionFactorsFile,
  type FuelType,
  type TimeSeries,
  type ZoneGeneration,
} from "@powerstation/schema";

export const fixtureDir = join(import.meta.dirname, "..", "..", "..", "fixtures", "v1");
export const readFixture = <T>(path: string): T =>
  JSON.parse(readFileSync(join(fixtureDir, path), "utf8")) as T;

export const T0 = "2026-01-01T00:00:00Z";

/** Series from values. null = missing. `modelled` lists indexes that are modelled. */
export function series(
  values: (number | null)[],
  modelled: number[] = [],
  start: string = T0,
): TimeSeries {
  const states: DataState[] = values.map((v, i) =>
    v === null ? "missing" : modelled.includes(i) ? "modelled" : "measured",
  );
  const s: TimeSeries = { start, resolution: "PT1H", unit: "MW", values, states };
  if (modelled.length) s.method = "test method";
  return s;
}

export function zoneGen(
  load: (number | null)[],
  generation: ZoneGeneration["generation"],
  zone = "XX",
): ZoneGeneration {
  return { zone, load: series(load), generation };
}

export function border(
  from: string,
  to: string,
  values: (number | null)[],
  kind: "physical" | "scheduled" = "physical",
  modelled: number[] = [],
): BorderSeries {
  return { from_zone: from, to_zone: to, kind, series: series(values, modelled) };
}

export const windowOf = (hours: number, start: string = T0) => ({
  start,
  end: new Date(Date.parse(start) + hours * 3_600_000).toISOString().replace(".000Z", "Z"),
});

/** Capacity for one direction. null = missing. */
export function dir(from: string, to: string, values: (number | null)[]): DirectedCapacity {
  const s = series(values);
  return {
    from_zone: from,
    to_zone: to,
    series: { ...s, states: s.states.map((x) => (x === "missing" ? x : "planned")) },
  };
}

type Factor = EmissionFactorsFile["factors"][FuelType];

/** All 16 fuels as "no factor", with the given factors set. Number = direct, object = custom. */
export function factorTable(
  set: Partial<Record<FuelType, number | Partial<Factor>>>,
): EmissionFactorsFile["factors"] {
  const table = {} as Record<FuelType, Factor>;
  for (const fuel of FUEL_TYPES) {
    const v = set[fuel];
    table[fuel] =
      v === undefined
        ? {
            value: null,
            match: "none",
            source_id: null,
            table: null,
            row: null,
            note: "No factor.",
          }
        : typeof v === "number"
          ? { value: v, match: "direct", source_id: "s", table: "T", row: "R" }
          : ({
              value: 0,
              match: "direct",
              source_id: "s",
              table: "T",
              row: "R",
              ...v,
            } as Factor);
  }
  return table;
}
