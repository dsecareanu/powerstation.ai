// Builds v1/datacenters/datacenters.json from Epoch AI's "AI supercomputers"
// dataset (gpu_clusters.csv, CC BY 4.0), filtered to the zones in zones.json.
//
// Why this file and not Epoch's "AI data centers" CSV: that CSV has no
// coordinates and only about 7 European sites. The AI supercomputers CSV has
// latitude, longitude, power and status per site.
import {
  SCHEMA_VERSION,
  type Datacenter,
  type DatacentersFile,
  type ZonesFile,
} from "@powerstation/schema";

export const EPOCH_CSV_URL = "https://epoch.ai/data/gpu_clusters.csv";
export const EPOCH_PAGE_URL = "https://epoch.ai/data/ai-supercomputers";

/** Epoch country names to ISO codes, for the countries v1 covers. */
const COUNTRY_CODES: Record<string, string> = {
  Albania: "AL",
  Austria: "AT",
  "Bosnia and Herzegovina": "BA",
  Belgium: "BE",
  Bulgaria: "BG",
  Switzerland: "CH",
  Czechia: "CZ",
  "Czech Republic": "CZ",
  Germany: "DE",
  Denmark: "DK",
  Estonia: "EE",
  Spain: "ES",
  Finland: "FI",
  France: "FR",
  "United Kingdom": "GB",
  Greece: "GR",
  Croatia: "HR",
  Hungary: "HU",
  Ireland: "IE",
  Italy: "IT",
  Lithuania: "LT",
  Luxembourg: "LU",
  Latvia: "LV",
  Montenegro: "ME",
  "North Macedonia": "MK",
  Malta: "MT",
  Netherlands: "NL",
  Norway: "NO",
  Poland: "PL",
  Portugal: "PT",
  Romania: "RO",
  Serbia: "RS",
  Sweden: "SE",
  Slovenia: "SI",
  Slovakia: "SK",
  Ukraine: "UA",
  Kosovo: "XK",
};

/** Parses RFC 4180 CSV (quoted fields, "" escapes, newlines in quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.replace(/^\uFEFF/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function status(s: string): Datacenter["status"] {
  const v = s.toLowerCase();
  if (v === "existing") return "operating";
  if (v.includes("construction")) return "under_construction";
  if (v.includes("planned")) return "planned";
  if (v.includes("cancel")) return "cancelled";
  return "unknown";
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Zone shapes for countries with several zones: outer rings of [lon, lat]. */
export type ZoneShapes = Record<string, [number, number][][]>;

function inRing(x: number, y: number, r: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface DatacenterBuild {
  file: DatacentersFile;
  dropped: Record<string, number>;
}

/**
 * Filters Epoch rows to the zones in zonesFile and maps them to the schema.
 * Zone: the only zone of the site's country. For countries with several zones,
 * the zone whose shape (reference/zone-shapes.json) contains the site; if no
 * shape or several shapes match, the zone with the nearest label point.
 */
export function buildDatacenters(
  rows: Record<string, string>[],
  zonesFile: ZonesFile,
  generatedAt: string,
  retrievedOn: string,
  shapes: ZoneShapes = {},
): DatacenterBuild {
  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);
  const zonesByCountry = new Map(zonesFile.countries.map((c) => [c.code, c.zones]));
  const zoneById = new Map(zonesFile.zones.map((z) => [z.id, z]));
  // Note: a UK site in Northern Ireland would really be in IE-SEM. We map UK sites
  // to GB only, because IE-SEM lists IE as its country. On 2026-11-25 no UK row in
  // the source was in Northern Ireland (and none had coordinates).
  const candidates = (country: string): string[] => zonesByCountry.get(country) ?? [];

  const out: Datacenter[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    const country = COUNTRY_CODES[r["Country"] ?? ""];
    if (!country) {
      drop("country outside v1");
      continue;
    }
    if (r["Exclude"] || r["Possible Duplicate"]) {
      drop("excluded or possible duplicate in source");
      continue;
    }
    if (r["Superseded by"]) {
      drop("superseded by a later phase");
      continue;
    }
    if (r["Decommissioned Date (if applicable)"]) {
      drop("decommissioned");
      continue;
    }
    const lat = num(r["latitude"]);
    const lon = num(r["longitude"]);
    if (lat === null || lon === null) {
      drop("no coordinates");
      continue;
    }
    const zones = candidates(country);
    if (zones.length === 0) {
      drop("country has no zone in zones.json");
      continue;
    }
    const inside =
      zones.length === 1
        ? zones
        : zones.filter((id) => (shapes[id] ?? []).some((r) => inRing(lon, lat, r)));
    if (zones.length > 1 && inside.length !== 1) drop("zone by nearest label point (kept)");
    const k = Math.cos((lat * Math.PI) / 180);
    const zone = (inside.length === 1 ? inside : zones)
      .map((id) => {
        const c = zoneById.get(id)!.centroid;
        return { id, d: Math.hypot((c.lon - lon) * k, c.lat - lat) };
      })
      .sort((a, b) => a.d - b.d)[0]!.id;
    const power = num(r["Power Capacity (MW)"]);
    let id = slug(r["Name"] ?? "") || "site";
    for (let n = 2; ids.has(id); n++) id = `${slug(r["Name"] ?? "")}-${n}`;
    ids.add(id);
    out.push({
      id,
      name: r["Name"]!,
      operator: r["Owner"] || null,
      lat,
      lon,
      zone,
      country,
      power_mw: power === null ? null : Math.round(power * 10) / 10,
      power_state: power === null ? "missing" : "measured",
      status: status(r["Status"] ?? ""),
      source: "Epoch AI, AI supercomputers",
      source_url: EPOCH_PAGE_URL,
      license: "CC-BY-4.0",
      as_of: retrievedOn,
    });
  }
  out.sort((a, b) => a.zone.localeCompare(b.zone) || a.id.localeCompare(b.id));
  return {
    file: {
      schema_version: SCHEMA_VERSION,
      dataset: "datacenters",
      generated_at: generatedAt,
      mock: false,
      source: "Epoch AI, AI supercomputers",
      source_url: EPOCH_PAGE_URL,
      license: "CC-BY-4.0",
      attribution: `Data centers: Epoch AI, 'AI supercomputers' (epoch.ai), CC BY 4.0, retrieved ${retrievedOn}. Filtered to Europe and assigned to bidding zones by powerstation.ai. Power is as Epoch AI reports or calculates it.`,
      datacenters: out,
    },
    dropped,
  };
}
