// Derived data for the views. Built once per loaded data set, then read per hour.
import type { FlowsFile, GenerationFile, ZonesFile } from "@powerstation/schema";
import {
  type BorderPair,
  type FlowAt,
  type GenerationIndex,
  flowAt,
  generationAt,
  generationIndex,
  measuredEndMs,
  netImportAt,
  pairBorders,
  timelineHours,
} from "./data/metrics";
import { type NodeIndex, aggregateBorders, buildNodes } from "./data/nodes";
import { MISSING, type Point, pointAt } from "./data/series";
import type { LayerId } from "./layers";

export interface Model {
  index: NodeIndex;
  pairs: BorderPair[];
  gen: GenerationIndex;
  hours: number[];
  /** Start of the first hour with no measured flow; planned trade from here on. */
  measuredEnd: number;
  /** Largest absolute flow in the window, for stable arrow widths. */
  maxAbsFlow: number;
}

export function buildModel(zones: ZonesFile, flows: FlowsFile, generation: GenerationFile): Model {
  const index = buildNodes(zones);
  const pairs = pairBorders(aggregateBorders(flows, index));
  let maxAbsFlow = 1;
  for (const p of pairs)
    for (const b of [p.physical, p.scheduled])
      for (const v of b?.series.values ?? [])
        if (v !== null) maxAbsFlow = Math.max(maxAbsFlow, Math.abs(v));
  return {
    index,
    pairs,
    gen: generationIndex(generation, index),
    hours: timelineHours(flows.window.start, flows.window.end),
    measuredEnd: measuredEndMs(flows),
    maxAbsFlow,
  };
}

export const flowsAt = (m: Model, hour: number): FlowAt[] =>
  m.pairs.map((p) => flowAt(p, hour, m.measuredEnd));

export function layerValue(
  m: Model,
  layer: LayerId,
  nodeId: string,
  hour: number,
  flows: FlowAt[],
): Point {
  if (layer === "netImport") return netImportAt(nodeId, flows);
  return generationAt(m.gen, nodeId, hour)?.renewableShare ?? MISSING;
}

/** Pair key, e.g. "ES>FR". */
export const pairKey = (p: { from: string; to: string }): string => `${p.from}>${p.to}`;

/**
 * The border where measured flow and planned trade differ most on average (past hours).
 * Used as the default for the "planned vs measured" panel.
 */
export function mostSurprisingPair(m: Model): BorderPair | undefined {
  let best: BorderPair | undefined;
  let bestScore = -1;
  for (const p of m.pairs) {
    if (!p.physical || !p.scheduled) continue;
    let sum = 0;
    let n = 0;
    for (const h of m.hours) {
      if (h >= m.measuredEnd) break;
      const a = pointAt(p.physical.series, h).value;
      const s = pointAt(p.scheduled.series, h).value;
      if (a === null || s === null) continue;
      sum += Math.abs(a - s);
      n++;
    }
    const score = n ? sum / n : -1;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best ?? m.pairs[0];
}
