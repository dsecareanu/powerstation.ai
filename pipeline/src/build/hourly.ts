// Hourly aggregation and small maths on hourly arrays (null = missing).
import { HOUR_MS, type StepMap } from "../entsoe/parse";

export type Hourly = (number | null)[];

/** Round to an integer MW. Avoids -0. */
const round = (x: number): number => Math.round(x) + 0;

/**
 * Hourly averages for the hours in [startMs, endMs). An hour is valid only if
 * all its sub-steps have a value. Other hours are null. Values are rounded to integers.
 */
export function toHourly(steps: StepMap, startMs: number, endMs: number): Hourly {
  const out: Hourly = [];
  for (let h = startMs; h < endMs; h += HOUR_MS) {
    const first = steps.get(h);
    let value: number | null = null;
    if (first && HOUR_MS % first.res === 0) {
      const n = HOUR_MS / first.res;
      let sum = 0;
      let ok = true;
      for (let k = 0; k < n; k++) {
        const s = steps.get(h + k * first.res);
        if (!s || s.res !== first.res) {
          ok = false;
          break;
        }
        sum += s.value;
      }
      if (ok) value = round(sum / n);
    }
    out.push(value);
  }
  return out;
}

/** Sum of several arrays. An hour is null if any part is null. */
export function sumHourly(parts: Hourly[]): Hourly {
  const n = parts[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => {
    let sum = 0;
    for (const p of parts) {
      const v = p[i];
      if (v === null || v === undefined) return null;
      sum += v;
    }
    return sum;
  });
}

/** a - b. An hour is null if either is null. */
export function diffHourly(a: Hourly, b: Hourly): Hourly {
  return a.map((v, i) => {
    const w = b[i];
    return v === null || w === null || w === undefined ? null : round(v - w);
  });
}

export const negateHourly = (a: Hourly): Hourly => a.map((v) => (v === null ? null : round(-v)));
