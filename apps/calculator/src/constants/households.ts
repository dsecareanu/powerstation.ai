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
  url: "https://ec.europa.eu/eurostat",
  dataset: "TODO(B): name the Eurostat dataset code",
  retrieved: "TODO(B): date retrieved (YYYY-MM-DD)",
};

// TODO(B): fill from Eurostat. The lead session adds sourced values. Never invent numbers.
// Key: ISO 3166-1 alpha-2 country code, e.g. "DE".
export const HOUSEHOLD_KWH_PER_YEAR: Record<string, HouseholdFigure> = {};

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
