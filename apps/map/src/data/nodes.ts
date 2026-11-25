// Zone → map node aggregation.
//
// Data is stored per bidding zone; the map shows countries. A "node" is the smallest group of
// countries and zones that can be shown without splitting data:
// - one country with one zone (FR) → node "FR";
// - one country with several zones (IT, NO) → one node; flows between its zones are ignored;
// - one zone in several countries (DE-LU) → one node for Germany and Luxembourg together.
import type {
  BorderSeries,
  CountryCode,
  FlowsFile,
  LatLon,
  TimeSeries,
  ZoneId,
  ZonesFile,
} from "@powerstation/schema";
import { sumSeries } from "./series";

export interface MapNode {
  /** Country codes joined with "+", sorted, e.g. "DE+LU". */
  id: string;
  /** Display name, e.g. "Germany & Luxembourg". */
  name: string;
  countries: CountryCode[];
  zones: ZoneId[];
  /** Mean of the zone centroids. [Inference] Good enough to anchor arrows. */
  centroid: LatLon;
}

export interface NodeIndex {
  nodes: MapNode[];
  byId: Map<string, MapNode>;
  nodeOfZone: Map<ZoneId, string>;
  nodeOfCountry: Map<CountryCode, string>;
}

export function buildNodes(file: ZonesFile): NodeIndex {
  // Union-find over countries: two countries join when they share a zone.
  const parent = new Map<CountryCode, CountryCode>();
  const find = (c: CountryCode): CountryCode => {
    let r = c;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(c, r);
    return r;
  };
  for (const c of file.countries) parent.set(c.code, c.code);
  for (const z of file.zones) {
    for (const c of z.countries) if (!parent.has(c)) parent.set(c, c);
    const [first, ...rest] = z.countries;
    for (const c of rest) parent.set(find(c), find(first));
  }

  const countryName = new Map(file.countries.map((c) => [c.code, c.name]));
  const groups = new Map<CountryCode, { countries: Set<CountryCode>; zones: Set<ZoneId> }>();
  const group = (c: CountryCode) => {
    const root = find(c);
    let g = groups.get(root);
    if (!g) groups.set(root, (g = { countries: new Set(), zones: new Set() }));
    return g;
  };
  for (const c of file.countries) group(c.code).countries.add(c.code);
  for (const z of file.zones) {
    const g = group(z.countries[0]);
    g.zones.add(z.id);
    for (const c of z.countries) g.countries.add(c);
  }

  const zoneById = new Map(file.zones.map((z) => [z.id, z]));
  const nodes: MapNode[] = [];
  for (const g of groups.values()) {
    if (g.zones.size === 0) continue; // a country with no zone in the file has no data
    const countries = [...g.countries].sort();
    const zones = [...g.zones].sort();
    const centroids = zones.map((id) => zoneById.get(id)!.centroid);
    nodes.push({
      id: countries.join("+"),
      name: countries.map((c) => countryName.get(c) ?? c).join(" & "),
      countries,
      zones,
      centroid: {
        lat: mean(centroids.map((p) => p.lat)),
        lon: mean(centroids.map((p) => p.lon)),
      },
    });
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  const nodeOfZone = new Map<ZoneId, string>();
  const nodeOfCountry = new Map<CountryCode, string>();
  for (const n of nodes) {
    for (const z of n.zones) nodeOfZone.set(z, n.id);
    for (const c of n.countries) nodeOfCountry.set(c, n.id);
  }
  return { nodes, byId: new Map(nodes.map((n) => [n.id, n])), nodeOfZone, nodeOfCountry };
}

/** Flows between two nodes, summed over all zone borders between them. */
export interface NodeBorder {
  /** `${from}>${to}>${kind}` */
  key: string;
  /** from < to (string order). Positive = flow from `from` to `to`. */
  from: string;
  to: string;
  kind: BorderSeries["kind"];
  series: TimeSeries;
  /** Zone borders that make up this node border. */
  parts: { from_zone: ZoneId; to_zone: ZoneId }[];
}

export function aggregateBorders(flows: FlowsFile, index: NodeIndex): NodeBorder[] {
  const acc = new Map<
    string,
    Omit<NodeBorder, "series"> & { inputs: { series: TimeSeries; sign: 1 | -1 }[] }
  >();
  for (const b of flows.borders) {
    const a = index.nodeOfZone.get(b.from_zone);
    const z = index.nodeOfZone.get(b.to_zone);
    if (!a || !z || a === z) continue; // unknown zone, or a border inside one node
    const [from, to, sign] = a < z ? [a, z, 1 as const] : [z, a, -1 as const];
    const key = `${from}>${to}>${b.kind}`;
    let e = acc.get(key);
    if (!e) acc.set(key, (e = { key, from, to, kind: b.kind, parts: [], inputs: [] }));
    e.parts.push({ from_zone: b.from_zone, to_zone: b.to_zone });
    e.inputs.push({ series: b.series, sign });
  }
  return [...acc.values()].map(({ inputs, ...rest }) => ({ ...rest, series: sumSeries(inputs) }));
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
