// Display helpers. Data times are UTC; the UI shows the browser's local time.
import type { FuelType } from "@powerstation/schema";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const dayOnly = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" });

export const formatHour = (ms: number): string => dateTime.format(ms);
export const formatDay = (ms: number): string => dayOnly.format(ms);

/** Local midnights to label: every day for a week, every 7th day for longer ranges. */
export function dayTicks(hours: number[]): number[] {
  const days = hours.filter((h) => new Date(h).getHours() === 0);
  const step = days.length > 10 ? 7 : 1;
  return days.filter((_, i) => i % step === 0);
}

export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;

export const FUEL_LABELS: Record<FuelType, string> = {
  nuclear: "Nuclear",
  lignite: "Lignite",
  hard_coal: "Hard coal",
  gas: "Gas",
  oil: "Oil",
  biomass: "Biomass",
  waste: "Waste",
  geothermal: "Geothermal",
  hydro_run_of_river: "Hydro, run of river",
  hydro_reservoir: "Hydro, reservoir",
  hydro_pumped_storage: "Pumped storage (net)",
  wind_onshore: "Wind, onshore",
  wind_offshore: "Wind, offshore",
  solar: "Solar",
  other_renewable: "Other renewable",
  other: "Other",
};
