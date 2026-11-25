/**
 * Everyday units. Data is in MW (hourly average) and MWh. The UI shows the
 * value plus a plain comparison in homes.
 *
 * The only household figures live here, with their source. Do not copy them.
 */

export interface HouseholdFigure {
  /** Electricity use of one average household, in MWh per year. */
  mwhPerYear: number;
  /** Year the figure refers to. */
  year: number;
}

export const HOUSEHOLD_SOURCE = {
  name: "Eurostat",
  url: "https://ec.europa.eu/eurostat/databrowser/view/nrg_bal_c/default/table",
  license: "CC-BY-4.0",
  /** The figure is our ratio of two Eurostat datasets. */
  method:
    "Electricity used by households in a country in one year, divided by the number of private households in that country, both from Eurostat.",
  datasets: [
    {
      code: "nrg_bal_c",
      title: "Complete energy balances",
      filters: "nrg_bal=FC_OTH_HH_E, siec=E7000, unit=GWH",
    },
    {
      code: "lfst_hhnhtych",
      title: "Private households by household composition",
      filters: "phhcomp=TOTAL, n_child=TOTAL, agechild=TOTAL, unit=THS_HH",
    },
  ],
  dataYear: 2024,
  retrieved: "2026-11-25",
  attribution:
    "Electricity use per household: powerstation.ai calculation from Eurostat data (nrg_bal_c, lfst_hhnhtych), 2024. Eurostat is not responsible for this use of its data.",
} as const;

/**
 * MWh per household per year, by ISO 3166-1 alpha-2 country code.
 * kWh = nrg_bal_c (GWh) x 1e6 / lfst_hhnhtych (thousand households) / 1e3, rounded to whole kWh.
 * Eurostat API, data year 2024, retrieved 2026-11-25. Eurostat "EL" (Greece) is stored as "GR".
 * Countries without both figures (e.g. CH) are left out and use the EU value.
 */
export const HOUSEHOLD_MWH_PER_YEAR: Readonly<Record<string, HouseholdFigure>> = {
  AT: { mwhPerYear: 5.219, year: 2024 },
  BA: { mwhPerYear: 3.857, year: 2024 },
  BE: { mwhPerYear: 3.137, year: 2024 },
  BG: { mwhPerYear: 4.523, year: 2024 },
  CY: { mwhPerYear: 4.877, year: 2024 },
  CZ: { mwhPerYear: 3.436, year: 2024 },
  DE: { mwhPerYear: 3.176, year: 2024 },
  DK: { mwhPerYear: 3.308, year: 2024 },
  EE: { mwhPerYear: 3.19, year: 2024 },
  ES: { mwhPerYear: 3.853, year: 2024 },
  FI: { mwhPerYear: 7.469, year: 2024 },
  FR: { mwhPerYear: 4.694, year: 2024 },
  GR: { mwhPerYear: 4.233, year: 2024 },
  HR: { mwhPerYear: 4.632, year: 2024 },
  HU: { mwhPerYear: 3.184, year: 2024 },
  IE: { mwhPerYear: 3.775, year: 2024 },
  IT: { mwhPerYear: 2.502, year: 2024 },
  LT: { mwhPerYear: 1.956, year: 2024 },
  LU: { mwhPerYear: 3.108, year: 2024 },
  LV: { mwhPerYear: 1.972, year: 2024 },
  MK: { mwhPerYear: 5.288, year: 2024 },
  MT: { mwhPerYear: 4.617, year: 2024 },
  NL: { mwhPerYear: 2.506, year: 2024 },
  NO: { mwhPerYear: 14.595, year: 2024 },
  PL: { mwhPerYear: 2.089, year: 2024 },
  PT: { mwhPerYear: 3.301, year: 2024 },
  RO: { mwhPerYear: 1.838, year: 2024 },
  RS: { mwhPerYear: 5.159, year: 2024 },
  SE: { mwhPerYear: 8.273, year: 2024 },
  SI: { mwhPerYear: 4.912, year: 2024 },
  SK: { mwhPerYear: 3.338, year: 2024 },
  TR: { mwhPerYear: 2.787, year: 2024 },
};

/** EU27_2020 from the same datasets and year. Fallback for countries not in the table. */
export const HOUSEHOLD_EU: HouseholdFigure = { mwhPerYear: 3.525, year: 2024 };

export interface HouseholdLookup extends HouseholdFigure {
  /** Country the figure is for, or "EU" when the EU value was used. */
  area: string;
  /** true if the requested country has no figure (or none was given) and the EU value was used. */
  isFallback: boolean;
}

/** Household figure for a country (ISO alpha-2; "EL" is read as "GR"). Falls back to the EU value. */
export function householdsFor(countryCode?: string | null): HouseholdLookup {
  const code = countryCode?.trim().toUpperCase();
  const key = code === "EL" ? "GR" : code;
  const figure = key ? HOUSEHOLD_MWH_PER_YEAR[key] : undefined;
  return figure
    ? { ...figure, area: key!, isFallback: false }
    : { ...HOUSEHOLD_EU, area: "EU", isFallback: true };
}

const HOURS_PER_YEAR = 8760;

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

/** Display rounding: 1 decimal below 10, whole numbers from 10. */
function roundDisplay(v: number): number {
  return Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
}

/** `units` from largest to smallest. Moves up a unit when rounding reaches it (999.6 MW → 1 GW). */
function scaled(value: number, units: readonly [string, number][]): string {
  for (let i = units.length - 1; i >= 0; i--) {
    const [unit, size] = units[i]!;
    const rounded = roundDisplay(value / size);
    const bigger = units[i - 1];
    if (!bigger || Math.abs(rounded) * size < bigger[1]) {
      return `${formatNumber(rounded, 1)} ${unit}`;
    }
  }
  throw new Error("units must not be empty");
}

/** 950 → "950 MW", 999.6 → "1 GW", 1200 → "1.2 GW", 0.4 → "0.4 MW". Input in MW. */
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

/** Number of homes with the same average power use. Input in MW. Without a known country: EU homes. */
export function homesForPower(mw: number, countryCode?: string | null): number {
  return (mw * HOURS_PER_YEAR) / householdsFor(countryCode).mwhPerYear;
}

/** Number of homes that use this much energy in one year. Input in MWh. */
export function homesForEnergyPerYear(mwh: number, countryCode?: string | null): number {
  return mwh / householdsFor(countryCode).mwhPerYear;
}

/**
 * 2_433_333 → "2.4 million", 12_345 → "12,000", 7 → "7", 0.3 → "less than 1".
 * Two significant figures.
 */
export function formatCount(n: number): string {
  if (n !== 0 && Math.abs(n) < 1) return "less than 1";
  const r = roundSignificant(Math.abs(n));
  const sign = n < 0 ? "-" : "";
  if (r >= 1_000_000_000) return `${sign}${formatNumber(r / 1_000_000_000, 1)} billion`;
  if (r >= 1_000_000) return `${sign}${formatNumber(r / 1_000_000, 1)} million`;
  return `${sign}${formatNumber(r, 0)}`;
}

export interface HomesTextOptions {
  /** ISO alpha-2 code of the country. Without a figure for it, the text says "EU homes". */
  countryCode?: string | null;
  /** Country name for the text, e.g. "Germany". Without it: "homes in this country". */
  countryName?: string;
}

function isTiny(n: number): boolean {
  return n > 0 && n < 1;
}

/** "2.8 million homes in Germany use", "1 EU home uses", "one home in Germany uses" (tiny case). */
function homesPhrase(n: number, options: HomesTextOptions): string {
  const { isFallback } = householdsFor(options.countryCode);
  const singular = isTiny(n) || roundSignificant(n) === 1;
  const noun = singular ? "home" : "homes";
  const verb = singular ? "uses" : "use";
  const where = isFallback ? `EU ${noun}` : `${noun} in ${options.countryName ?? "this country"}`;
  return `${isTiny(n) ? "one" : formatCount(n)} ${where} ${verb}`;
}

/**
 * 1000, { countryCode: "DE", countryName: "Germany" } →
 * "about as much as 2.8 million homes in Germany use on average".
 * Unknown country → "... EU homes use on average".
 * Less than one home → "less than one home in Germany uses on average". Input in MW.
 */
export function describePowerInHomes(mw: number, options: HomesTextOptions = {}): string {
  const n = homesForPower(Math.abs(mw), options.countryCode);
  const lead = isTiny(n) ? "less than" : "about as much as";
  return `${lead} ${homesPhrase(n, options)} on average`;
}

/**
 * 3525 → "about what 1,000 EU homes use in a year".
 * Less than one home → "less than what one EU home uses in a year". Input in MWh.
 */
export function describeEnergyInHomes(mwh: number, options: HomesTextOptions = {}): string {
  const n = homesForEnergyPerYear(Math.abs(mwh), options.countryCode);
  const lead = isTiny(n) ? "less than what" : "about what";
  return `${lead} ${homesPhrase(n, options)} in a year`;
}
