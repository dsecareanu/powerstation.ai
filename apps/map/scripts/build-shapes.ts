// Builds public/countries.geojson from Natural Earth 1:50m admin-0 countries (public domain).
// Clips to Europe, keeps only the ISO code and the name, simplifies, rounds coordinates.
// Run: pnpm --filter @powerstation/map shapes
import { execFileSync } from "node:child_process";
import { geoArea } from "d3-geo";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pinned to a commit so the output is reproducible. Natural Earth version 5.1.x.
const COMMIT = "9380cca83db5f9aef52d5e762765100745f84b27";
const URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${COMMIT}/geojson/ne_50m_admin_0_countries.geojson`;
const BBOX = "-25,34,45,72"; // lon/lat: Iceland to the Urals' west, North Africa coast to North Cape
const app = join(import.meta.dirname, "..");
const out = join(app, "public", "countries.geojson");

const dir = mkdtempSync(join(tmpdir(), "ne-"));
const input = join(dir, "ne.geojson");
const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${URL}`);
writeFileSync(input, Buffer.from(await res.arrayBuffer()));

execFileSync(
  join(app, "node_modules", ".bin", "mapshaper"),
  [
    input,
    "-clip",
    `bbox=${BBOX}`,
    // ISO_A2 is -99 for France, Norway and Kosovo in Natural Earth; ISO_A2_EH has the code.
    "-filter-fields",
    "ISO_A2_EH,NAME",
    "-rename-fields",
    "code=ISO_A2_EH,name=NAME",
    "-simplify",
    "15%",
    "keep-shapes",
    "-o",
    out,
    "precision=0.001",
    "format=geojson",
  ],
  { stdio: "inherit" },
);

// mapshaper writes RFC 7946 winding (outer rings counter-clockwise). d3-geo needs the
// opposite (clockwise), or each country covers the whole globe. Reverse inverted features.
type Geo = FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>;
const geo = JSON.parse(readFileSync(out, "utf8")) as Geo;
for (const f of geo.features) {
  if (geoArea(f) <= 2 * Math.PI) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) ring.reverse();
}
writeFileSync(out, JSON.stringify(geo));
console.log(
  `${geo.features.length} countries: ${geo.features.map((f) => f.properties.code).join(" ")}`,
);
