import type { Datacenter, FuelType } from "@powerstation/schema";

// TODO(A): replace with schema 1.1.0 capacity file
/** Total import capacity of one zone, in MW. */
export type ImportCapacity = { zone: string; mw: number };

// TODO(A): replace with schema 1.1.0 emission factors
/** Emission factor per fuel type, in gCO2 per kWh. */
export type EmissionFactors = Partial<Record<FuelType, number>>;

/** Where the extra load is likely met. */
export type ExtraSource = "gas" | "hard_coal" | "lignite" | "oil" | "hydro_reservoir" | "imports";

/** Merit order, first to last. "imports" is the fallback. */
export const MERIT_ORDER: readonly ExtraSource[] = [
  "gas",
  "hard_coal",
  "lignite",
  "oil",
  "hydro_reservoir",
  "imports",
];

export interface CalcResult {
  zone: string;
  sizeMw: number;
  /** Hours in the data window (generation file). */
  totalHours: number;
  /** Hours used in the results. */
  validHours: number;
  /** Hours left out because load or a fuel series is missing. */
  hoursWithoutData: number;
  /** Used hours where at least one input value is modelled. */
  modelledInputHours: number;
  /** Start of the first and last used hour, UTC ISO 8601. Null if no hour is usable. */
  dataWindow: { firstValidHour: string; lastValidHour: string } | null;
  load: {
    meanMw: number;
    maxMw: number;
    /** size / mean load, a ratio (0.1 = 10%). */
    shareOfMean: number;
    shareOfMax: number;
  } | null;
  imports: {
    /** Hours that need imports with the data center. */
    hoursWith: number;
    /** Hours that need imports without it. */
    hoursWithout: number;
  } | null;
  /** Null when capacity data is not available. */
  pressure: {
    capacityMw: number;
    /** Hours with a pressure value. */
    hoursCounted: number;
    /** Used hours left out of pressure because a border is missing. */
    hoursWithoutBorderData: number;
    hoursAboveThreshold: number;
    maxPressure: number | null;
    threshold: number;
  } | null;
  /** Null when emission factors are not available. */
  carbon: {
    /** gCO2/kWh per hour, one entry per hour with a value. */
    hourly: { hour: string; gPerKwh: number }[];
    mean: number | null;
    min: number | null;
    max: number | null;
    /** Used hours left out (no factor for a running fuel, or no generation). */
    excludedHours: number;
  } | null;
  /** Share of used hours per likely extra source (0..1). Only sources with hours are listed. */
  extraSource: { source: ExtraSource; hours: number; share: number }[];
  datacenters: {
    withKnownPower: number;
    knownPowerMw: number;
    unknownPower: number;
    records: Datacenter[];
  };
}
