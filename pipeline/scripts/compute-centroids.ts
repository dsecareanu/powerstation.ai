// Computes one label point (centroid) per candidate zone from Natural Earth
// and writes pipeline/reference/centroids.json.
// Usage: tsx scripts/compute-centroids.ts
//
// Source: Natural Earth 1:10m admin-0 countries and admin-1 states/provinces,
// release v5.1.2 (public domain). Files are downloaded once to pipeline/out/ne/
// and checked against fixed SHA-256 hashes.
//
// Method:
// 1. A zone is a set of countries (admin-0) or regions (admin-1), see ZONE_PARTS.
// 2. Polygon parts outside Europe (overseas territories, Svalbard) are dropped.
// 3. The point is the area-weighted centroid of all parts, in a local
//    equirectangular projection. If that point is not inside the zone (for
//    example a bent shape like Norway or Croatia), the point inside the largest
//    part that is furthest from its edge is used instead.
// 4. Values are rounded to 2 decimals (about 1 km).
//
// The regions per zone for IT, NO, SE and DK follow the zones only roughly.
// NO and SE zone borders do not follow county borders. The points are for map
// labels and arrows, not for analysis.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZONE_REFERENCE } from "../reference/zones";

type Ring = [number, number][];
type Polygon = Ring[]; // first ring = outer, others = holes
interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", "out", "ne");
const outFile = join(here, "..", "reference", "centroids.json");
const RELEASE = "v5.1.2";
const FILES = {
  admin0: {
    name: "ne_10m_admin_0_countries.geojson",
    sha256: "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255",
  },
  admin1: {
    name: "ne_10m_admin_1_states_provinces.geojson",
    sha256: "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5",
  },
};
const baseUrl = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${RELEASE}/geojson`;

/** Parts of each zone: admin-0 ISO codes, or admin-1 rows of one country. */
type Part =
  { admin0: string } | { admin1: string; field: "name" | "region" | "geonunit"; values: string[] };
const ZONE_PARTS: Record<string, Part[]> = {
  "DE-LU": [{ admin0: "DE" }, { admin0: "LU" }],
  DK1: [{ admin1: "DK", field: "name", values: ["Nordjylland", "Midtjylland", "Syddanmark"] }],
  DK2: [{ admin1: "DK", field: "name", values: ["Hovedstaden", "Sjaælland"] }],
  GB: [{ admin1: "GB", field: "geonunit", values: ["England", "Scotland", "Wales"] }],
  "IE-SEM": [{ admin0: "IE" }, { admin1: "GB", field: "geonunit", values: ["Northern Ireland"] }],
  // [Unverified] Italian regions per zone, from Terna's zone configuration since 2021.
  "IT-North": [
    {
      admin1: "IT",
      field: "region",
      values: [
        "Valle d'Aosta",
        "Piemonte",
        "Liguria",
        "Lombardia",
        "Trentino-Alto Adige",
        "Veneto",
        "Friuli-Venezia Giulia",
        "Emilia-Romagna",
      ],
    },
  ],
  "IT-Centre-North": [{ admin1: "IT", field: "region", values: ["Toscana", "Marche"] }],
  "IT-Centre-South": [
    { admin1: "IT", field: "region", values: ["Umbria", "Lazio", "Abruzzo", "Campania"] },
  ],
  "IT-South": [{ admin1: "IT", field: "region", values: ["Molise", "Apulia", "Basilicata"] }],
  "IT-Calabria": [{ admin1: "IT", field: "region", values: ["Calabria"] }],
  "IT-Sicily": [{ admin1: "IT", field: "region", values: ["Sicily"] }],
  "IT-Sardinia": [{ admin1: "IT", field: "region", values: ["Sardegna"] }],
  // Approximate: Norwegian zone borders do not follow county borders.
  NO1: [
    {
      admin1: "NO",
      field: "name",
      values: ["Oslo", "Akershus", "Østfold", "Buskerud", "Hedmark", "Oppland", "Vestfold"],
    },
  ],
  NO2: [
    { admin1: "NO", field: "name", values: ["Telemark", "Aust-Agder", "Vest-Agder", "Rogaland"] },
  ],
  NO3: [
    {
      admin1: "NO",
      field: "name",
      values: ["Møre og Romsdal", "Sør-Trøndelag", "Nord-Trøndelag"],
    },
  ],
  NO4: [{ admin1: "NO", field: "name", values: ["Nordland", "Troms", "Finnmark"] }],
  NO5: [{ admin1: "NO", field: "name", values: ["Hordaland", "Sogn og Fjordane"] }],
  // Approximate: Swedish zone borders do not follow county borders.
  SE1: [{ admin1: "SE", field: "name", values: ["Norrbotten"] }],
  SE2: [{ admin1: "SE", field: "name", values: ["Västerbotten", "Jämtland", "Västernorrland"] }],
  SE3: [
    {
      admin1: "SE",
      field: "name",
      values: [
        "Gävleborg",
        "Dalarna",
        "Värmland",
        "Uppsala",
        "Västmanland",
        "Stockholm",
        "Orebro",
        "Södermanland",
        "Östergötland",
        "Västra Götaland",
        "Jönköping",
        "Kalmar",
        "Gotland",
      ],
    },
  ],
  SE4: [{ admin1: "SE", field: "name", values: ["Skåne", "Blekinge", "Kronoberg", "Halland"] }],
};

async function load(file: { name: string; sha256: string }): Promise<Feature[]> {
  mkdirSync(cacheDir, { recursive: true });
  const path = join(cacheDir, file.name);
  if (!existsSync(path)) {
    console.log(`Downloading ${file.name} (${RELEASE})...`);
    const res = await fetch(`${baseUrl}/${file.name}`);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${file.name}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const buf = readFileSync(path);
  const hash = createHash("sha256").update(buf).digest("hex");
  if (hash !== file.sha256) throw new Error(`SHA-256 mismatch for ${file.name}: ${hash}`);
  return (JSON.parse(buf.toString("utf8")) as { features: Feature[] }).features;
}

function polygons(f: Feature): Polygon[] {
  const c = f.geometry.coordinates;
  return f.geometry.type === "Polygon" ? [c as Polygon] : (c as Polygon[]);
}

// Keep parts whose bounding-box centre is in Europe (drops overseas parts and Svalbard).
function inEurope(p: Polygon): boolean {
  const xs = p[0]!.map((q) => q[0]);
  const ys = p[0]!.map((q) => q[1]);
  const lon = (Math.min(...xs) + Math.max(...xs)) / 2;
  const lat = (Math.min(...ys) + Math.max(...ys)) / 2;
  return lon > -25 && lon < 45 && lat > 34 && lat < 72;
}

// Signed area and centroid of a ring in projected (x = lon * k, y = lat) units.
function ringStats(r: Ring, k: number): { a: number; cx: number; cy: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x0, y0] = [r[j]![0] * k, r[j]![1]];
    const [x1, y1] = [r[i]![0] * k, r[i]![1]];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  return { a, cx: a === 0 ? 0 : cx / (6 * a), cy: a === 0 ? 0 : cy / (6 * a) };
}

function inRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (x: number, y: number, p: Polygon) =>
  inRing(x, y, p[0]!) && !p.slice(1).some((h) => inRing(x, y, h));

function distToRing(x: number, y: number, r: Ring, k: number): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const ax = r[j]![0] * k;
    const ay = r[j]![1];
    const bx = r[i]![0] * k;
    const by = r[i]![1];
    const px = x * k;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// Point inside the polygon furthest from its edge, by grid search (deterministic).
function interiorPoint(p: Polygon, k: number): [number, number] {
  const xs = p[0]!.map((q) => q[0]);
  const ys = p[0]!.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const N = 120;
  let best: [number, number] = [p[0]![0]![0], p[0]![0]![1]];
  let bestD = -1;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = y0 + ((y1 - y0) * j) / N;
      if (!inPolygon(x, y, p)) continue;
      const d = Math.min(...p.map((r) => distToRing(x, y, r, k)));
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  return best;
}

function labelPoint(parts: Polygon[]): { lat: number; lon: number } {
  const lat0 = parts[0]![0]![0]![1];
  const k = Math.cos((lat0 * Math.PI) / 180);
  let A = 0;
  let X = 0;
  let Y = 0;
  let largest = parts[0]!;
  let largestA = 0;
  for (const p of parts) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (const [i, r] of p.entries()) {
      const s = ringStats(r, k);
      const sign = i === 0 ? 1 : -1; // holes subtract
      a += sign * Math.abs(s.a);
      cx += sign * Math.abs(s.a) * s.cx;
      cy += sign * Math.abs(s.a) * s.cy;
    }
    A += a;
    X += cx;
    Y += cy;
    if (a > largestA) {
      largestA = a;
      largest = p;
    }
  }
  let lon = X / A / k;
  let lat = Y / A;
  if (!parts.some((p) => inPolygon(lon, lat, p))) [lon, lat] = interiorPoint(largest, k);
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

const admin0 = await load(FILES.admin0);
const admin1 = await load(FILES.admin1);

function partsFor(zoneId: string, countries: string[]): Polygon[] {
  const spec: Part[] = ZONE_PARTS[zoneId] ?? countries.map((c) => ({ admin0: c }));
  const out: Polygon[] = [];
  for (const s of spec) {
    const feats =
      "admin0" in s
        ? admin0.filter((f) => f.properties.ISO_A2_EH === s.admin0)
        : admin1.filter(
            (f) =>
              f.properties.iso_a2 === s.admin1 && s.values.includes(String(f.properties[s.field])),
          );
    const want = "admin0" in s ? 1 : s.values.length;
    const found =
      "admin0" in s ? feats.length : new Set(feats.map((f) => f.properties[s.field])).size;
    if (found < want)
      throw new Error(`${zoneId}: Natural Earth rows not found for ${JSON.stringify(s)}`);
    out.push(...feats.flatMap(polygons).filter(inEurope));
  }
  if (out.length === 0) throw new Error(`${zoneId}: no polygons in Europe`);
  return out;
}

const centroids: Record<string, { lat: number; lon: number }> = {};
for (const z of ZONE_REFERENCE) {
  centroids[z.id] = labelPoint(partsFor(z.id, z.countries));
  console.log(
    `${z.id.padEnd(16)} ${centroids[z.id]!.lat.toFixed(2)}, ${centroids[z.id]!.lon.toFixed(2)}`,
  );
}

const result = {
  method:
    "Area-weighted centroid of the zone's European land parts (local equirectangular projection); if that point is outside the zone, the interior point furthest from the edge of the largest part. Zones in IT, NO, SE and DK are built from admin-1 regions; for NO and SE the regions follow the zone borders only roughly. For map labels and arrows only.",
  source: `Natural Earth 1:10m admin-0 countries and admin-1 states/provinces, release ${RELEASE} (public domain), https://www.naturalearthdata.com/`,
  centroids,
};
writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote ${outFile}`);

// ---------- simplified shapes for zones in countries with several zones ----------
// Used to place a point (for example a data center) in the right zone.
// Douglas-Peucker with a 0.02 degree tolerance; parts under 0.005 square degrees
// are dropped; outer rings only.
function simplify(r: Ring, tol: number): Ring {
  if (r.length < 4) return r;
  const keep = new Array<boolean>(r.length).fill(false);
  keep[0] = keep[r.length - 1] = true;
  const stack: [number, number][] = [[0, r.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = r[a]!;
    const [bx, by] = r[b]!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = r[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return r
    .filter((_, i) => keep[i])
    .map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number]);
}

const zonesPerCountry = new Map<string, number>();
for (const z of ZONE_REFERENCE)
  for (const c of z.countries) zonesPerCountry.set(c, (zonesPerCountry.get(c) ?? 0) + 1);
const shapes: Record<string, Ring[]> = {};
for (const z of ZONE_REFERENCE) {
  if (!z.countries.some((c) => (zonesPerCountry.get(c) ?? 0) > 1)) continue;
  shapes[z.id] = partsFor(z.id, z.countries)
    .filter((p) => Math.abs(ringStats(p[0]!, 1).a) >= 0.005)
    .map((p) => simplify(p[0]!, 0.02))
    .filter((r) => r.length >= 4);
}
const shapesFile = join(here, "..", "reference", "zone-shapes.json");
writeFileSync(
  shapesFile,
  JSON.stringify({
    method:
      "Outer rings of the zone's land parts from the Natural Earth admin-1 regions listed in compute-centroids.ts, Douglas-Peucker 0.02 degrees, rounded to 0.01 degrees, parts under 0.005 square degrees dropped. Only zones in countries with several zones. Approximate; for placing points in a zone.",
    source: `Natural Earth 1:10m admin-1 states/provinces, release ${RELEASE} (public domain)`,
    shapes,
  }) + "\n",
);
console.log(`Wrote ${shapesFile}`);
