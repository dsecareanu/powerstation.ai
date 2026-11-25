// Plain-text summary for the "Copy result" button. Pure function.
import type { CalcResult, ExtraSource } from "../calc/types";
import { formatHomes, formatInt, formatMw, formatShare, formatUtc, hours } from "../format";

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
  /** Homes equivalent of the data center size, or null if no sourced figure. */
  homes: number | null;
}

export function summariseZone(z: SummaryZone): string {
  const r = z.result;
  const lines: string[] = [];
  const homes = z.homes === null ? "" : ` (about ${formatHomes(z.homes)} homes)`;
  lines.push(`A ${formatMw(r.sizeMw)} data center in ${z.name}${homes}:`);
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
  if (r.pressure && r.pressure.maxPressure !== null) {
    lines.push(
      `- Interconnectors: above ${Math.round(r.pressure.threshold * 100)}% of capacity in ` +
        `${hours(r.pressure.hoursAboveThreshold)}, at most ${formatShare(r.pressure.maxPressure)}.`,
    );
  }
  if (r.carbon && r.carbon.mean !== null) {
    lines.push(
      `- Carbon intensity of the zone's own power plants: about ${formatInt(r.carbon.mean)} gCO2/kWh on average. Imports are not included.`,
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
