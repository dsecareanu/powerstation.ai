// Parses ENTSO-E XML documents into step series.
// A step series is a map: step start (ms, UTC) -> value and step length.
// A step that is not in the map is missing.
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

function expandPeriod(period: Node, curveType: string, steps: StepMap): void {
  const interval = period["timeInterval"] as Node | undefined;
  const start = parseTime(interval?.["start"], "Period start");
  const end = parseTime(interval?.["end"], "Period end");
  const resText = text(period["resolution"]) ?? "";
  const res = RESOLUTIONS[resText];
  if (res === undefined) {
    throw new Error(
      `Unsupported resolution ${JSON.stringify(resText)} (allowed: PT15M, PT30M, PT60M)`,
    );
  }
  const stepCount = Math.floor((end - start) / res);
  const points = asArray(period["Point"])
    .map((p) => {
      const pt = p as Node;
      const position = Number(text(pt["position"]));
      const value = Number(text(pt["quantity"]));
      if (!Number.isInteger(position) || position < 1) {
        throw new Error(`Bad Point position ${JSON.stringify(pt["position"])}`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Bad Point quantity ${JSON.stringify(pt["quantity"])}`);
      }
      return { position, value };
    })
    .sort((a, b) => a.position - b.position);

  points.forEach((p, i) => {
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
  const curveType = text(ts["curveType"]) ?? "A01";
  if (curveType !== "A01" && curveType !== "A03") {
    throw new Error(`Unsupported curveType ${JSON.stringify(curveType)} (allowed: A01, A03)`);
  }
  const unit = text(ts["quantity_Measure_Unit.name"]);
  if (unit !== undefined && unit !== "MAW") {
    throw new Error(`Unsupported unit ${JSON.stringify(unit)} (expected MAW)`);
  }
  const steps: StepMap = new Map();
  for (const p of asArray(ts["Period"])) expandPeriod(p as Node, curveType, steps);
  const psr = (ts["MktPSRType"] as Node | undefined)?.["psrType"];
  return {
    inDomain: text(ts["in_Domain.mRID"]),
    outDomain: text(ts["out_Domain.mRID"]),
    inBiddingZone: text(ts["inBiddingZone_Domain.mRID"]),
    outBiddingZone: text(ts["outBiddingZone_Domain.mRID"]),
    contractType: text(ts["contract_MarketAgreement.type"]),
    psrType: text(psr),
    steps,
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
