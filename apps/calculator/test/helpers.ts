import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BorderSeries, DataState, TimeSeries, ZoneGeneration } from "@powerstation/schema";

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
