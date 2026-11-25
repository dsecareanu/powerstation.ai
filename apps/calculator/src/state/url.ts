// All inputs live in the URL: ?zone=FR&country=FR&size=500&period=7d&compare=PL
import type { ZonesFile } from "@powerstation/schema";

export type Period = "7d" | "30d";

export interface UrlState {
  zone: string;
  country: string;
  size: number;
  period: Period;
  /** Second zone for comparison mode. */
  compare?: { zone: string; country: string };
}

export const DEFAULT_SIZE_MW = 500;
export const MIN_SIZE_MW = 1;
export const MAX_SIZE_MW = 10000;

export function parseSize(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return DEFAULT_SIZE_MW;
  const n = Number(raw);
  return n >= MIN_SIZE_MW && n <= MAX_SIZE_MW ? n : DEFAULT_SIZE_MW;
}

/** Pick a valid zone + country pair. Falls back step by step. */
export function resolvePlace(
  zones: ZonesFile,
  zoneParam: string | null,
  countryParam: string | null,
): { zone: string; country: string } | null {
  const zone = zones.zones.find((z) => z.id === zoneParam);
  const country = zones.countries.find((c) => c.code === countryParam);
  if (zone && country && country.zones.includes(zone.id)) {
    return { zone: zone.id, country: country.code };
  }
  if (zone) return { zone: zone.id, country: zone.countries[0] };
  if (country) return { zone: country.zones[0], country: country.code };
  return null;
}

export function parseUrlState(search: string, zones: ZonesFile): UrlState {
  const q = new URLSearchParams(search);
  const first = zones.zones[0];
  const fallback = first
    ? { zone: first.id, country: first.countries[0] }
    : { zone: "", country: "" };
  const place = resolvePlace(zones, q.get("zone"), q.get("country")) ?? fallback;
  const period: Period = q.get("period") === "30d" ? "30d" : "7d";
  const state: UrlState = { ...place, size: parseSize(q.get("size")), period };
  const compareZone = q.get("compare");
  if (compareZone !== null) {
    const cmp = resolvePlace(zones, compareZone, q.get("compareCountry"));
    if (cmp && cmp.zone === compareZone && cmp.zone !== state.zone) state.compare = cmp;
  }
  return state;
}

/** Query string for a state. `compareCountry` is written only when it is not the zone's first country. */
export function buildSearch(state: UrlState, zones: ZonesFile): string {
  const q = new URLSearchParams();
  q.set("zone", state.zone);
  q.set("country", state.country);
  q.set("size", String(state.size));
  q.set("period", state.period);
  if (state.compare) {
    q.set("compare", state.compare.zone);
    const firstCountry = zones.zones.find((z) => z.id === state.compare?.zone)?.countries[0];
    if (firstCountry !== state.compare.country) q.set("compareCountry", state.compare.country);
  }
  return "?" + q.toString();
}
