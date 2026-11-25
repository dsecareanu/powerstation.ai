import type { DataState, FuelType } from "@powerstation/schema";

/** CSS variable that holds the color of a data state. */
export function stateColorVar(state: DataState): string {
  return `--ps-state-${state}`;
}

/** CSS variable that holds the color of a fuel type, e.g. --ps-fuel-hard-coal. */
export function fuelColorVar(fuel: FuelType): string {
  return `--ps-fuel-${fuel.replaceAll("_", "-")}`;
}

/**
 * Reads the current value of a CSS variable, e.g. for MapLibre paint
 * properties, which cannot use var(). Read it again when the theme changes.
 * Returns "" outside a browser.
 */
export function readToken(name: string, element?: Element): string {
  if (typeof document === "undefined") return "";
  const el = element ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue(name).trim();
}
