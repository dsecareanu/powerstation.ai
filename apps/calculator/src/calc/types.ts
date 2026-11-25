import type { Datacenter, EmissionFactorsFile, FuelType } from "@powerstation/schema";

/** Emission factor per fuel type (schema 1.1.0 `factors`). `match: "none"` has `value: null`. */
export type EmissionFactors = EmissionFactorsFile["factors"];

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

/** A border direction (neighbour to zone) used for import capacity. */
export interface Direction {
  from: string;
  to: string;
}

export type PressureResult =
  | {
      available: false;
      /** Import directions of the zone's physical borders that have no published capacity. */
      missingDirections: Direction[];
    }
  | {
      available: true;
      /** Import directions summed into the zone's import capacity. */
      directions: Direction[];
      /** Hours with a pressure value. */
      hoursCounted: number;
      /** Used hours left out of pressure: a capacity value, a flow value or the capacity sum is missing or 0. */
      hoursLeftOut: number;
      hoursAboveThreshold: number;
      maxPressure: number | null;
      /** Mean import capacity (MW) over the counted hours. Null if no hour was counted. */
      meanCapacityMw: number | null;
      threshold: number;
    };

export interface CarbonResult {
  /** gCO2eq/kWh per hour, one entry per hour with a value. */
  hourly: { hour: string; gPerKwh: number }[];
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Used hours left out: no generation that has a factor. */
  excludedHours: number;
  /** Generation (MWh, over used hours) with no emission factor. Left out of the average. */
  noFactor: {
    /** Share of all generation (0..1). */
    share: number;
    /** Fuels with generation and no factor, largest first. */
    fuels: { fuel: FuelType; share: number; note: string | undefined }[];
  };
  /** Fuels that generated and use a proxy factor, with the file's note. */
  proxyFuels: { fuel: FuelType; value: number; note: string | undefined }[];
}

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
  /** Null when the capacity file is not available. */
  pressure: PressureResult | null;
  /** Null when the emission-factors file is not available. */
  carbon: CarbonResult | null;
  /** Share of used hours per likely extra source (0..1). Only sources with hours are listed. */
  extraSource: { source: ExtraSource; hours: number; share: number }[];
  datacenters: {
    withKnownPower: number;
    knownPowerMw: number;
    unknownPower: number;
    records: Datacenter[];
  };
}
