// Plain-text summary for the "Copy result" button. Pure function.
import { formatPower } from "@powerstation/ui";
import type { CalcResult, ExtraSource } from "../calc/types";
import {
  GENERATION_MISSING_REASON,
  describePeakPressure,
  directionLabel,
  formatInt,
  formatShare,
  formatUtc,
  fuelLabel,
  hours,
} from "../format";

const SOURCE_LABEL: Record<ExtraSource, string> = {
  gas: "gas",
  hard_coal: "hard coal",
  lignite: "lignite",
  oil: "oil",
  hydro_reservoir: "reservoir hydro",
  imports: "imports",
};
export const sourceLabel = (s: ExtraSource): string => SOURCE_LABEL[s];

export interface SummaryZone {
  name: string;
  result: CalcResult;
  /** Homes comparison from @powerstation/ui, e.g. "about as much as 2.8 million homes in Germany use on average". */
  homesText: string;
  /** Unit of the emission factors, from the factors file. */
  carbonUnit?: string;
}

export function summariseZone(z: SummaryZone): string {
  const r = z.result;
  const lines: string[] = [];
  lines.push(`A ${formatPower(r.sizeMw)} data center in ${z.name} (${z.homesText}):`);
  if (r.generationMissing) {
    lines.push(
      `- Share of load, imports, carbon intensity and likely extra source: no data. ${GENERATION_MISSING_REASON}`,
    );
  }
  if (r.load) {
    lines.push(
      `- Share of load: ${formatShare(r.load.shareOfMean)} of the average load, ` +
        `${formatShare(r.load.shareOfMax)} of the peak load.`,
    );
  }
  if (r.imports) {
    lines.push(
      `- Imports: the zone would need imports in ${hours(r.imports.hoursWith)} of ` +
        `${formatInt(r.validHours)} (${hours(r.imports.hoursWithout)} without the data center).`,
    );
  }
  if (r.pressure?.available && r.pressure.maxPressure !== null) {
    lines.push(
      `- Interconnectors: above ${Math.round(r.pressure.threshold * 100)}% of planned import capacity in ` +
        `${hours(r.pressure.hoursAboveThreshold)}${describePeakPressure(r.pressure.maxPressure)}.`,
    );
  } else if (r.pressure && !r.pressure.available) {
    const list = r.pressure.missingDirections.map(directionLabel).join(", ");
    lines.push(`- Interconnectors: not calculated. Capacity is not published for ${list}.`);
  }
  if (r.carbon && r.carbon.mean !== null) {
    const unit = z.carbonUnit ?? "gCO2eq/kWh";
    const left =
      r.carbon.noFactor.fuels.length > 0
        ? ` ${r.carbon.noFactor.fuels.map((f) => fuelLabel(f.fuel).toLowerCase()).join(", ")} ` +
          `(${formatShare(r.carbon.noFactor.share)} of generation) have no emission factor and are left out.`
        : "";
    lines.push(
      `- Carbon intensity of the zone's own power plants: about ${formatInt(r.carbon.mean)} ${unit} on average (life-cycle). Imports are not included.${left}`,
    );
  }
  const top = [...r.extraSource].sort((a, b) => b.hours - a.hours)[0];
  if (top) {
    lines.push(
      `- Likely extra source: ${sourceLabel(top.source)} (${formatShare(top.share)} of hours).`,
    );
  }
  if (r.dataWindow) {
    lines.push(
      `- Data: ${formatUtc(r.dataWindow.firstValidHour)} to ${formatUtc(r.dataWindow.lastValidHour)}; ` +
        `${hours(r.hoursWithoutData)} without data.`,
    );
  }
  return lines.join("\n");
}

export function summarise(
  zones: SummaryZone[],
  link: string,
  period: string,
  mock: boolean,
): string {
  const parts = zones.map(summariseZone);
  const note = `Modelled estimate from past data (${period}), flat load, zone level.`;
  const demo = mock ? "\nDemo data: these numbers are not real." : "";
  return `${parts.join("\n\n")}\n\n${note}${demo}\n${link}`;
}
