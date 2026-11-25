// Plain-English labels for screen readers, tooltips and panels.
import type { DataState } from "@powerstation/schema";
import type { FlowAt } from "../data/metrics";
import type { Model } from "../model";
import { formatPower } from "@powerstation/ui";

export function stateText(state: DataState): string {
  switch (state) {
    case "measured":
      return "measured";
    case "planned":
      return "planned trade, not measured";
    case "modelled":
      return "modelled (estimated)";
    case "missing":
      return "no data";
  }
}

/** "France to Spain: 1.2 GW, measured." */
export function flowLabel(m: Model, f: FlowAt): string {
  const a = m.index.byId.get(f.from)!.name;
  const b = m.index.byId.get(f.to)!.name;
  const v = f.point.value;
  if (v === null) return `Border ${a} – ${b}: no data for this hour.`;
  const [src, dst] = v < 0 ? [b, a] : [a, b];
  const what = f.kind === "scheduled" ? "planned trade" : "flow";
  const method = f.point.method ? ` Method: ${f.point.method}` : "";
  return `${src} to ${dst}: ${formatPower(Math.abs(v))} ${what}, ${stateText(f.point.state)}.${method}`;
}
