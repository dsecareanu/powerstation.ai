// Builds v1/meta/zones.json from three reference files:
// - reference/zones.ts: candidate zones and EIC codes (ENTSO-E area list).
// - reference/borders.json: directed zone pairs with published physical flows,
//   written by scripts/discover-borders.ts from ENTSO-E data.
// - reference/centroids.json: one label point per zone, written by
//   scripts/compute-centroids.ts from Natural Earth.
// A candidate zone without any published flow is left out.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, type Zone, type ZonesFile } from "@powerstation/schema";
import { COUNTRY_NAMES, ZONE_REFERENCE } from "../reference/zones";

const referenceDir = join(dirname(fileURLToPath(import.meta.url)), "..", "reference");

export interface BordersReference {
  checked_at: string;
  window: { start: string; end: string };
  method: string;
  /** Directed pairs (zone ids) with at least one published hour of physical flow. */
  directed: { from: string; to: string; hours_with_data: number }[];
}

export interface CentroidsReference {
  method: string;
  source: string;
  centroids: Record<string, { lat: number; lon: number }>;
}

function readJson<T>(name: string): T {
  const path = join(referenceDir, name);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    throw new Error(
      `Cannot read ${path}: ${(err as Error).message}. ` +
        (name === "borders.json"
          ? "Run scripts/discover-borders.ts first (needs ENTSOE_TOKEN)."
          : "Run scripts/compute-centroids.ts first."),
      { cause: err },
    );
  }
}

export const readBorders = () => readJson<BordersReference>("borders.json");
export const readCentroids = () => readJson<CentroidsReference>("centroids.json");

/** Undirected neighbour pairs [a, b] with a < b, from the borders reference. */
export function neighbourPairs(borders: BordersReference): [string, string][] {
  const keys = new Set<string>();
  for (const d of borders.directed) {
    if (d.hours_with_data > 0 && d.from !== d.to) keys.add([d.from, d.to].sort().join("|"));
  }
  return [...keys].sort().map((k) => k.split("|") as [string, string]);
}

export function buildZonesFile(
  generatedAt: string,
  borders: BordersReference = readBorders(),
  centroids: CentroidsReference = readCentroids(),
): ZonesFile {
  const pairs = neighbourPairs(borders);
  const neighbours = new Map<string, Set<string>>();
  for (const [a, b] of pairs) {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a)!.add(b);
    neighbours.get(b)!.add(a);
  }
  const zones: Zone[] = ZONE_REFERENCE.filter((z) => neighbours.has(z.id)).map((z) => {
    const centroid = centroids.centroids[z.id];
    if (!centroid) throw new Error(`No centroid for zone ${z.id} in reference/centroids.json`);
    return {
      id: z.id,
      name: z.name,
      eic: z.eic,
      countries: z.countries,
      centroid,
      neighbours: [...neighbours.get(z.id)!].sort(),
    };
  });
  const unknown = [...neighbours.keys()].filter((id) => !ZONE_REFERENCE.some((z) => z.id === id));
  if (unknown.length > 0) throw new Error(`borders.json has unknown zones: ${unknown.join(", ")}`);

  const countryCodes = [...new Set(zones.flatMap((z) => z.countries))].sort();
  const countries = countryCodes.map((code) => {
    const name = COUNTRY_NAMES[code];
    if (!name) throw new Error(`No country name for ${code} in reference/zones.ts`);
    const ids = zones.filter((z) => z.countries.includes(code)).map((z) => z.id);
    return { code, name, zones: ids as [string, ...string[]] };
  });

  return {
    schema_version: SCHEMA_VERSION,
    dataset: "zones",
    generated_at: generatedAt,
    mock: false,
    source:
      "ENTSO-E Transparency Platform (EIC codes; borders from published physical flows); Natural Earth (centroids)",
    source_url: "https://transparency.entsoe.eu/",
    license: "AGPL-3.0-only",
    attribution: `Bidding zones and borders: ENTSO-E Transparency Platform (borders checked ${borders.checked_at.slice(0, 10)}). Zone label points: computed from Natural Earth (public domain).`,
    zones,
    countries,
  };
}
