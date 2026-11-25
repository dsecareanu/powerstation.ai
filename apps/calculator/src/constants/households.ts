// TODO(D): remove when @powerstation/ui has the household table (PR #5).
// Average yearly electricity use of one household, per country.
// One place for the conversion factor and its source (CLAUDE.md data rule 4).

export interface HouseholdFigure {
  /** Electricity use of an average household, in kWh per year. */
  kwhPerYear: number;
  /** Year the figure refers to. */
  year: number;
}

export const HOUSEHOLD_SOURCE = {
  name: "Eurostat",
  url: "https://ec.europa.eu/eurostat/databrowser/view/nrg_bal_c/default/table",
  dataset:
    "nrg_bal_c (final energy consumption, households, electricity, GWh) divided by lfst_hhnhtych (number of private households)",
  retrieved: "2026-11-25",
};

// Year 2024. kWh per household = household electricity use (nrg_bal_c: nrg_bal=FC_OTH_HH_E,
// siec=E7000, unit=GWH) x 1e6 / number of private households (lfst_hhnhtych: all household
// types, unit=THS_HH) / 1e3. Eurostat API, retrieved 2026-11-25; rounded to whole kWh.
// Eurostat uses "EL" for Greece; it is stored here as ISO "GR". Countries without both figures
// (e.g. CH) are left out, so the UI hides the homes comparison for them.
// Key: ISO 3166-1 alpha-2 country code, e.g. "DE".
export const HOUSEHOLD_KWH_PER_YEAR: Record<string, HouseholdFigure> = {
  AT: { kwhPerYear: 5_219, year: 2024 },
  BA: { kwhPerYear: 3_857, year: 2024 },
  BE: { kwhPerYear: 3_137, year: 2024 },
  BG: { kwhPerYear: 4_523, year: 2024 },
  CY: { kwhPerYear: 4_877, year: 2024 },
  CZ: { kwhPerYear: 3_436, year: 2024 },
  DE: { kwhPerYear: 3_176, year: 2024 },
  DK: { kwhPerYear: 3_308, year: 2024 },
  EE: { kwhPerYear: 3_190, year: 2024 },
  ES: { kwhPerYear: 3_853, year: 2024 },
  FI: { kwhPerYear: 7_469, year: 2024 },
  FR: { kwhPerYear: 4_694, year: 2024 },
  GR: { kwhPerYear: 4_233, year: 2024 },
  HR: { kwhPerYear: 4_632, year: 2024 },
  HU: { kwhPerYear: 3_184, year: 2024 },
  IE: { kwhPerYear: 3_775, year: 2024 },
  IT: { kwhPerYear: 2_502, year: 2024 },
  LT: { kwhPerYear: 1_956, year: 2024 },
  LU: { kwhPerYear: 3_108, year: 2024 },
  LV: { kwhPerYear: 1_972, year: 2024 },
  MK: { kwhPerYear: 5_288, year: 2024 },
  MT: { kwhPerYear: 4_617, year: 2024 },
  NL: { kwhPerYear: 2_506, year: 2024 },
  NO: { kwhPerYear: 14_595, year: 2024 },
  PL: { kwhPerYear: 2_089, year: 2024 },
  PT: { kwhPerYear: 3_301, year: 2024 },
  RO: { kwhPerYear: 1_838, year: 2024 },
  RS: { kwhPerYear: 5_159, year: 2024 },
  SE: { kwhPerYear: 8_273, year: 2024 },
  SI: { kwhPerYear: 4_912, year: 2024 },
  SK: { kwhPerYear: 3_338, year: 2024 },
  TR: { kwhPerYear: 2_787, year: 2024 },
};

const HOURS_PER_YEAR = 8760;

/** Yearly kWh of one household in this country, or undefined if we have no sourced figure. */
export function annualKwhPerHousehold(
  country: string,
  table: Record<string, HouseholdFigure> = HOUSEHOLD_KWH_PER_YEAR,
): number | undefined {
  return table[country]?.kwhPerYear;
}

/** Homes that use as much electricity in a year as a flat load of `sizeMw`. */
export function homesEquivalent(sizeMw: number, kwhPerYear: number | undefined): number | null {
  if (kwhPerYear === undefined || !(kwhPerYear > 0)) return null;
  return (sizeMw * HOURS_PER_YEAR * 1000) / kwhPerYear;
}
