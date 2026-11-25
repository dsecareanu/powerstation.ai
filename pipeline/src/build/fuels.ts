// Maps ENTSO-E production types (psrType) to our fuel types and builds fuel series.
import type { FuelType } from "@powerstation/schema";
import { mergeSteps, type ParsedTimeSeries, type StepMap } from "../entsoe/parse";
import { sumHourly, diffHourly, toHourly, type Hourly } from "./hourly";
import type { Warnings } from "./warnings";

export const PSR_TO_FUEL: Record<string, FuelType> = {
  B01: "biomass",
  B02: "lignite",
  B03: "other", // coal-derived gas
  B04: "gas",
  B05: "hard_coal",
  B06: "oil",
  B07: "other", // oil shale
  B08: "other", // peat
  B09: "geothermal",
  B10: "hydro_pumped_storage",
  B11: "hydro_run_of_river",
  B12: "hydro_reservoir",
  B13: "other_renewable", // marine
  B14: "nuclear",
  B15: "other_renewable",
  B16: "solar",
  B17: "waste",
  B18: "wind_offshore",
  B19: "wind_onshore",
  B20: "other",
  B25: "other", // energy storage
};

/** Production types where pumping or charging is subtracted (net generation). */
const NET_PSR = new Set(["B10", "B25"]);

/** Wind and solar forecast types. */
export const FORECAST_PSR: Record<string, "solar" | "wind_offshore" | "wind_onshore"> = {
  B16: "solar",
  B18: "wind_offshore",
  B19: "wind_onshore",
};

function groupByPsr(
  list: ParsedTimeSeries[],
  warnings: Warnings,
  label: string,
): Map<string, StepMap> {
  const out = new Map<string, StepMap>();
  for (const s of list) {
    const psr = s.psrType ?? "";
    let m = out.get(psr);
    if (!m) out.set(psr, (m = new Map()));
    mergeSteps(m, s.steps, warnings, `${label} ${psr}`);
  }
  return out;
}

/** Fuel series for one zone, from a generation document. Hours in [startMs, endMs). */
export function buildFuelSeries(
  series: ParsedTimeSeries[],
  startMs: number,
  endMs: number,
  warnings: Warnings,
  zoneId: string,
): Partial<Record<FuelType, Hourly>> {
  // Consumption (pumping, charging) has only outBiddingZone_Domain.
  const isConsumption = (s: ParsedTimeSeries) =>
    s.outBiddingZone !== undefined && s.inBiddingZone === undefined;
  const generation = groupByPsr(
    series.filter((s) => !isConsumption(s)),
    warnings,
    `${zoneId} generation`,
  );
  const consumption = groupByPsr(
    series.filter(isConsumption),
    warnings,
    `${zoneId} consumption`,
  );

  const parts = new Map<FuelType, Hourly[]>();
  for (const [psr, steps] of generation) {
    const fuel = PSR_TO_FUEL[psr];
    if (!fuel) {
      warnings.add(`unknown-psr:${psr}`, `Unknown production type "${psr}": skipped`);
      continue;
    }
    let hourly = toHourly(steps, startMs, endMs);
    const cons = consumption.get(psr);
    if (NET_PSR.has(psr) && cons) {
      hourly = diffHourly(hourly, toHourly(cons, startMs, endMs));
    }
    const list = parts.get(fuel) ?? [];
    list.push(hourly);
    parts.set(fuel, list);
  }
  for (const psr of consumption.keys()) {
    if (!NET_PSR.has(psr) || !generation.has(psr)) {
      warnings.add(
        `ignored-consumption:${psr}`,
        `Consumption series of production type "${psr}" ignored`,
      );
    }
  }
  const out: Partial<Record<FuelType, Hourly>> = {};
  for (const [fuel, list] of parts) out[fuel] = sumHourly(list);
  return out;
}

/** Wind and solar forecast series for one zone. */
export function buildForecastGeneration(
  series: ParsedTimeSeries[],
  startMs: number,
  endMs: number,
  warnings: Warnings,
  zoneId: string,
): Partial<Record<"solar" | "wind_offshore" | "wind_onshore", Hourly>> {
  const out: Partial<Record<"solar" | "wind_offshore" | "wind_onshore", Hourly>> = {};
  for (const [psr, steps] of groupByPsr(series, warnings, `${zoneId} wind/solar forecast`)) {
    const kind = FORECAST_PSR[psr];
    if (!kind) {
      warnings.add(`forecast-psr:${psr}`, `Forecast production type "${psr}" ignored`);
      continue;
    }
    out[kind] = toHourly(steps, startMs, endMs);
  }
  return out;
}
