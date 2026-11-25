// Parses ENTSO-E XML documents into step series.
// A step series is a map: step start (ms, UTC) -> value and step length.
// A step that is not in the map is missing.
// Bad content inside a TimeSeries never throws: a Point without a usable quantity or
// position, or a Period or TimeSeries with an unsupported resolution, curve type or unit,
// leaves its steps out (missing) and is listed in `problems`. No value is invented.
import { XMLParser } from "fast-xml-parser";
import type { Warnings } from "../build/warnings";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

export interface Step {
  value: number;
  /** Step length in ms. */
  res: number;
}
export type StepMap = Map<number, Step>;

export interface ParsedTimeSeries {
  inDomain?: string;
  outDomain?: string;
  inBiddingZone?: string;
  outBiddingZone?: string;
  contractType?: string;
  psrType?: string;
  steps: StepMap;
  /** Content that was left out (missing steps). Empty when the series is clean. */
  problems: string[];
}

export interface ParsedDocument {
  /** True when ENTSO-E answered "no data" (Acknowledgement, reason code 999). */
  empty: boolean;
  series: ParsedTimeSeries[];
}

const RESOLUTIONS: Record<string, number> = {
  PT15M: 15 * MINUTE_MS,
  PT30M: 30 * MINUTE_MS,
  PT60M: HOUR_MS,
};

const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => name === "TimeSeries" || name === "Period" || name === "Point",
});

type Node = Record<string, unknown>;

const asArray = (x: unknown): unknown[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const text = (x: unknown): string | undefined =>
  typeof x === "string" ? x : typeof x === "number" ? String(x) : undefined;

function parseTime(value: unknown, what: string): number {
  const t = text(value);
  const ms = t === undefined ? NaN : Date.parse(t);
  if (Number.isNaN(ms)) throw new Error(`Bad ${what} in ENTSO-E XML: ${JSON.stringify(value)}`);
  return ms;
}

function expandPeriod(period: Node, curveType: string, steps: StepMap, problems: string[]): void {
  const interval = period["timeInterval"] as Node | undefined;
  const start = parseTime(interval?.["start"], "Period start");
  const end = parseTime(interval?.["end"], "Period end");
  const resText = text(period["resolution"]) ?? "";
  const res = RESOLUTIONS[resText];
  if (res === undefined) {
    problems.push(`Period with unsupported resolution ${JSON.stringify(resText)} left out`);
    return;
  }
  const stepCount = Math.floor((end - start) / res);
  let badPositions = 0;
  let badQuantities = 0;
  const points: { position: number; value: number | null }[] = [];
  for (const p of asArray(period["Point"])) {
    const pt = p as Node;
    const position = Number(text(pt["position"]));
    if (!Number.isInteger(position) || position < 1) {
      badPositions++;
      continue;
    }
    const raw = text(pt["quantity"]);
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(value)) badQuantities++;
    // A Point without a usable quantity stays in the list as a gap, so with A03 the
    // previous value does not run on into its steps.
    points.push({ position, value: Number.isFinite(value) ? value : null });
  }
  if (badPositions > 0) problems.push(`${badPositions} Point(s) without a valid position left out`);
  if (badQuantities > 0) problems.push(`${badQuantities} Point(s) without a quantity left out`);
  points.sort((a, b) => a.position - b.position);

  points.forEach((p, i) => {
    if (p.value === null) return;
    // A01: one step per point. A03: the value holds until the next point.
    const next = points[i + 1];
    const lastPosition = curveType === "A03" ? (next ? next.position - 1 : stepCount) : p.position;
    for (let pos = p.position; pos <= lastPosition; pos++) {
      if (pos > stepCount) break;
      steps.set(start + res * (pos - 1), { value: p.value, res });
    }
  });
}

function parseTimeSeries(ts: Node): ParsedTimeSeries {
  const steps: StepMap = new Map();
  const problems: string[] = [];
  const curveType = text(ts["curveType"]) ?? "A01";
  const unit = text(ts["quantity_Measure_Unit.name"]);
  if (curveType !== "A01" && curveType !== "A03") {
    problems.push(`unsupported curveType ${JSON.stringify(curveType)}; series left out`);
  } else if (unit !== undefined && unit !== "MAW") {
    problems.push(`unsupported unit ${JSON.stringify(unit)}; series left out`);
  } else {
    for (const p of asArray(ts["Period"])) expandPeriod(p as Node, curveType, steps, problems);
  }
  const psr = (ts["MktPSRType"] as Node | undefined)?.["psrType"];
  return {
    inDomain: text(ts["in_Domain.mRID"]),
    outDomain: text(ts["out_Domain.mRID"]),
    inBiddingZone: text(ts["inBiddingZone_Domain.mRID"]),
    outBiddingZone: text(ts["outBiddingZone_Domain.mRID"]),
    contractType: text(ts["contract_MarketAgreement.type"]),
    psrType: text(psr),
    steps,
    problems,
  };
}

/** Parses one ENTSO-E response body. Throws on an error acknowledgement. */
export function parseDocument(xml: string): ParsedDocument {
  const doc = parser.parse(xml) as Node;
  const rootName = Object.keys(doc).find((k) => !k.startsWith("?"));
  const root = rootName ? (doc[rootName] as Node | undefined) : undefined;
  if (!rootName || !root || typeof root !== "object") {
    throw new Error("ENTSO-E response is not a known XML document");
  }
  if (rootName === "Acknowledgement_MarketDocument") {
    const reasons = asArray(root["Reason"]).map((r) => r as Node);
    const code = reasons.map((r) => text(r["code"])).find((c) => c !== undefined);
    if (code === "999") return { empty: true, series: [] };
    const msg = reasons
      .map((r) => `${text(r["code"]) ?? "?"}: ${text(r["text"]) ?? ""}`)
      .join("; ");
    throw new Error(`ENTSO-E acknowledgement: ${msg}`);
  }
  const series = asArray(root["TimeSeries"]).map((t) => parseTimeSeries(t as Node));
  return { empty: series.length === 0, series };
}

/** Merges steps into target. On a different value for the same step, the later one wins. */
export function mergeSteps(
  target: StepMap,
  source: StepMap,
  warnings: Warnings,
  label: string,
): void {
  for (const [start, step] of source) {
    const old = target.get(start);
    if (old && old.value !== step.value) {
      warnings.add(
        `conflict:${label}`,
        `Different values for the same step in ${label}; kept the later one`,
      );
    }
    target.set(start, step);
  }
}

/** Merges all given series into one step map. */
export function mergeSeries(list: ParsedTimeSeries[], warnings: Warnings, label: string): StepMap {
  const out: StepMap = new Map();
  for (const s of list) mergeSteps(out, s.steps, warnings, label);
  return out;
}
