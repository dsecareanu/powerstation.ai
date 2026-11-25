// Hourly series helpers: align by time, sum with data states, read one hour.
import type { DataState, TimeSeries } from "@powerstation/schema";

export const HOUR_MS = 3_600_000;

/** A value with its data state at one hour. */
export interface Point {
  value: number | null;
  state: DataState;
  /** Set when state is modelled. */
  method?: string;
}

export const MISSING: Point = { value: null, state: "missing" };

export const toMs = (iso: string): number => Date.parse(iso);
export const toIso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/** End of the series (exclusive), in ms. */
export const seriesEndMs = (s: TimeSeries): number => toMs(s.start) + s.values.length * HOUR_MS;

/** Value and state of a series for the hour that starts at `hourMs`. Outside the series: missing. */
export function pointAt(s: TimeSeries, hourMs: number): Point {
  const i = (hourMs - toMs(s.start)) / HOUR_MS;
  if (!Number.isInteger(i) || i < 0 || i >= s.values.length) return MISSING;
  const state = s.states[i] ?? "missing";
  const value = s.values[i] ?? null;
  if (state === "missing" || value === null) return MISSING;
  return state === "modelled" && s.method ? { value, state, method: s.method } : { value, state };
}

/**
 * Combine the states of the parts of a sum.
 * Rule: any part missing → missing (we do not show a partial sum as a total).
 * Else any modelled → modelled. Else any planned → planned. Else measured.
 */
export function combine(points: Point[]): Point {
  if (points.length === 0) return MISSING;
  let sum = 0;
  let state: DataState = "measured";
  const methods = new Set<string>();
  for (const p of points) {
    if (p.state === "missing" || p.value === null) return MISSING;
    sum += p.value;
    if (p.state === "modelled") {
      state = "modelled";
      if (p.method) methods.add(p.method);
    } else if (p.state === "planned" && state === "measured") {
      state = "planned";
    }
  }
  if (state !== "modelled") return { value: sum, state };
  return methods.size
    ? { value: sum, state, method: [...methods].join(" ") }
    : { value: sum, state };
}

/**
 * Sum several hourly series, each multiplied by its sign. The result covers the union of the
 * input ranges. An hour that one input does not cover is missing in the result.
 */
export function sumSeries(parts: { series: TimeSeries; sign: 1 | -1 }[]): TimeSeries {
  if (parts.length === 0) throw new Error("sumSeries needs at least one series");
  const start = Math.min(...parts.map((p) => toMs(p.series.start)));
  const end = Math.max(...parts.map((p) => seriesEndMs(p.series)));
  const values: (number | null)[] = [];
  const states: DataState[] = [];
  const methods = new Set<string>();
  for (let t = start; t < end; t += HOUR_MS) {
    const p = combine(
      parts.map(({ series, sign }) => {
        const q = pointAt(series, t);
        return q.value === null ? q : { ...q, value: sign * q.value };
      }),
    );
    values.push(p.value === null ? null : round(p.value));
    states.push(p.state);
    if (p.method) methods.add(p.method);
  }
  const out: TimeSeries = { start: toIso(start), resolution: "PT1H", unit: "MW", values, states };
  if (methods.size) out.method = [...methods].join(" ");
  return out;
}

/** Round to 0.1 MW so float noise does not show. */
const round = (x: number): number => Math.round(x * 10) / 10;
