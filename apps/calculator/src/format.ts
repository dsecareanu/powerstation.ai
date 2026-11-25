// Number and text formatting for the page. Pure functions.
import type { FuelType } from "@powerstation/schema";
import { describePowerInHomes, householdsFor } from "@powerstation/ui";
const nf = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const utc = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatInt = (n: number): string => nf.format(n);

/** A ratio (0.05) as a percent text ("5.0%"). */
export function formatShare(ratio: number): string {
  const pct = ratio * 100;
  if (pct > 0 && pct < 0.1) return "less than 0.1%";
  return pct < 10 ? `${pct.toFixed(1)}%` : `${nf.format(pct)}%`;
}

/** Peak pressure text. Zero or less means the zone still exports in every counted hour. */
export function describePeakPressure(maxPressure: number | null): string {
  if (maxPressure === null) return "";
  if (maxPressure <= 0) return ". Even with the data center, the zone still exports in every hour";
  return `, at most ${formatShare(maxPressure)}`;
}

export function formatUtc(iso: string): string {
  return `${utc.format(new Date(iso)).replace(",", "")} UTC`;
}

export const plural = (n: number, word: string): string =>
  `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;

/** "1 hour", "3 hours". */
export const hours = (n: number): string => plural(n, "hour");

const FUEL_LABEL: Record<FuelType, string> = {
  nuclear: "Nuclear",
  lignite: "Lignite",
  hard_coal: "Hard coal",
  gas: "Gas",
  oil: "Oil",
  biomass: "Biomass",
  waste: "Waste",
  geothermal: "Geothermal",
  hydro_run_of_river: "Run-of-river hydro",
  hydro_reservoir: "Reservoir hydro",
  hydro_pumped_storage: "Pumped storage",
  wind_onshore: "Onshore wind",
  wind_offshore: "Offshore wind",
  solar: "Solar",
  other_renewable: "Other renewable",
  other: "Other",
};
export const fuelLabel = (f: FuelType): string => FUEL_LABEL[f];

/** "DE-LU → FR" (a border direction). */
export const directionLabel = (d: { from: string; to: string }): string => `${d.from} → ${d.to}`;

/** Homes comparison for a flat load. Uses the shared household table in @powerstation/ui. */
export function homesInfo(
  sizeMw: number,
  countryCode: string,
  countryName: string,
): { text: string; isFallback: boolean } {
  return {
    text: describePowerInHomes(sizeMw, { countryCode, countryName }),
    isFallback: householdsFor(countryCode).isFallback,
  };
}

/** Plain reasons shown with the "No data" state when an optional file is not available. */
export const GENERATION_MISSING_REASON = "Generation mix is not published yet.";
export const DATACENTERS_MISSING_REASON = "The data center list is not published yet.";
