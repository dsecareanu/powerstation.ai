import type { DataState, TimeSeries } from "@powerstation/schema";

export const HOUR_MS = 3_600_000;

export interface Sample {
  value: number | null;
  state: DataState;
}

const MISSING: Sample = { value: null, state: "missing" };

/** Value of the hour that starts at `hourMs`. Hours outside the series count as missing. */
export function sampleAt(series: TimeSeries | undefined, hourMs: number): Sample {
  if (!series) return MISSING;
  const offset = hourMs - Date.parse(series.start);
  if (offset < 0 || offset % HOUR_MS !== 0) return MISSING;
  const i = offset / HOUR_MS;
  const value = series.values[i];
  const state = series.states[i];
  if (value === undefined || value === null || state === undefined || state === "missing") {
    return MISSING;
  }
  return { value, state };
}

export const isoHour = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
