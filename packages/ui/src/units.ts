/**
 * Everyday units. Data is in MW (hourly average) and MWh. The UI shows the
 * value plus a plain comparison in homes.
 *
 * The only household figure lives here, with its source. Do not copy it.
 */
export const HOUSEHOLD_ELECTRICITY = {
  /** Average electricity use of one dwelling per year, in MWh. */
  mwhPerYear: 3.6,
  scope: "EU average, electricity use per dwelling (all uses)",
  source: "Odyssee-Mure, “Electricity consumption per dwelling”",
  sourceUrl:
    "https://www.odyssee-mure.eu/publications/efficiency-by-sector/households/electricity-consumption-dwelling.html",
  /** "Last update" date shown on the source page. */
  sourceUpdated: "2025-11",
  accessed: "2026-11-25",
} as const;

const HOURS_PER_YEAR = 8760;

/** Average power of one home in MW (about 0.41 kW). */
export const HOME_AVERAGE_MW = HOUSEHOLD_ELECTRICITY.mwhPerYear / HOURS_PER_YEAR;

const LOCALE = "en-GB";

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** Rounds to `digits` significant figures, to avoid false precision. */
function roundSignificant(value: number, digits = 2): number {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (magnitude - digits + 1);
  return Math.round(value / factor) * factor;
}

function scaled(value: number, units: readonly [string, number][]): string {
  const abs = Math.abs(value);
  for (const [unit, size] of units) {
    if (abs >= size) {
      const v = value / size;
      return `${formatNumber(v, Math.abs(v) < 10 ? 1 : 0)} ${unit}`;
    }
  }
  const [unit, size] = units[units.length - 1]!;
  return `${formatNumber(value / size, 1)} ${unit}`;
}

/** 950 → "950 MW", 1200 → "1.2 GW", 0.4 → "0.4 MW". Input in MW. */
export function formatPower(mw: number): string {
  return scaled(mw, [
    ["GW", 1000],
    ["MW", 1],
  ]);
}

/** 3600 → "3.6 GWh", 2_500_000 → "2.5 TWh". Input in MWh. */
export function formatEnergy(mwh: number): string {
  return scaled(mwh, [
    ["TWh", 1_000_000],
    ["GWh", 1000],
    ["MWh", 1],
  ]);
}

/** Number of homes with the same average power use. Input in MW. */
export function homesForPower(mw: number): number {
  return mw / HOME_AVERAGE_MW;
}

/** Number of homes that use this much energy in one year. Input in MWh. */
export function homesForEnergyPerYear(mwh: number): number {
  return mwh / HOUSEHOLD_ELECTRICITY.mwhPerYear;
}

/** 2_433_333 → "2.4 million", 12_345 → "12,000", 7 → "7". Two significant figures. */
export function formatCount(n: number): string {
  const r = roundSignificant(Math.abs(n));
  const sign = n < 0 ? "-" : "";
  if (r >= 1_000_000_000) return `${sign}${formatNumber(r / 1_000_000_000, 1)} billion`;
  if (r >= 1_000_000) return `${sign}${formatNumber(r / 1_000_000, 1)} million`;
  return `${sign}${formatNumber(r, 0)}`;
}

function homesUse(n: number): string {
  return roundSignificant(Math.abs(n)) === 1 ? "home uses" : "homes use";
}

/** 1000 → "about as much as 2.4 million homes use on average". Input in MW. */
export function describePowerInHomes(mw: number): string {
  const n = homesForPower(Math.abs(mw));
  return `about as much as ${formatCount(n)} ${homesUse(n)} on average`;
}

/** 3600 → "about what 1,000 homes use in a year". Input in MWh. */
export function describeEnergyInHomes(mwh: number): string {
  const n = homesForEnergyPerYear(Math.abs(mwh));
  return `about what ${formatCount(n)} ${homesUse(n)} in a year`;
}
