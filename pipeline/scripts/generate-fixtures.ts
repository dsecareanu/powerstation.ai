// Generates mock data files in /fixtures that follow the schema.
// The output is deterministic: a fixed random seed and a fixed "now".
// Usage: tsx scripts/generate-fixtures.ts [--now 2026-11-25T12:00:00Z] [--out ../fixtures]
// Every file has "mock": true. The deploy step refuses such files.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  DATA_PATHS,
  SCHEMA_VERSION,
  type BorderSeries,
  type Datacenter,
  type DataState,
  type FuelType,
  type TimeSeries,
  type Zone,
  type ZoneForecast,
  type ZoneGeneration,
} from "@powerstation/schema";

// ---------- options ----------
const HOUR = 3_600_000;
const DEFAULT_NOW = "2026-11-25T12:00:00Z";
const argValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const nowMs = Math.floor(Date.parse(argValue("--now") ?? DEFAULT_NOW) / HOUR) * HOUR;
if (Number.isNaN(nowMs)) throw new Error("--now is not a valid date");
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(
  process.env.INIT_CWD ?? process.cwd(),
  argValue("--out") ?? join(here, "..", "..", "fixtures"),
);
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const NOW = iso(nowMs);

// ---------- deterministic random numbers (mulberry32) ----------
let seed = 20261125;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = (amp: number) => (rand() * 2 - 1) * amp;

// ---------- common envelope ----------
const envelope = {
  schema_version: SCHEMA_VERSION,
  generated_at: NOW,
  mock: true,
  source: "powerstation.ai mock data generator",
  license: "AGPL-3.0-only",
  attribution: "Mock data for development and tests. This is not real grid data.",
} as const;

// ---------- zones (real neighbour relations between the zones in this file) ----------
// EIC codes and centroids are approximate. [Unverified] Session A replaces them with checked values.
const ZONES: Zone[] = [
  {
    id: "DE-LU",
    name: "Germany–Luxembourg",
    eic: "10Y1001A1001A82H",
    countries: ["DE", "LU"],
    centroid: { lat: 51.1, lon: 10.4 },
    neighbours: ["FR", "NL", "BE", "PL", "CZ", "AT"],
  },
  {
    id: "FR",
    name: "France",
    eic: "10YFR-RTE------C",
    countries: ["FR"],
    centroid: { lat: 46.6, lon: 2.4 },
    neighbours: ["DE-LU", "BE", "ES"],
  },
  {
    id: "NL",
    name: "Netherlands",
    eic: "10YNL----------L",
    countries: ["NL"],
    centroid: { lat: 52.2, lon: 5.5 },
    neighbours: ["DE-LU", "BE"],
  },
  {
    id: "BE",
    name: "Belgium",
    eic: "10YBE----------2",
    countries: ["BE"],
    centroid: { lat: 50.6, lon: 4.6 },
    neighbours: ["DE-LU", "FR", "NL"],
  },
  {
    id: "PL",
    name: "Poland",
    eic: "10YPL-AREA-----S",
    countries: ["PL"],
    centroid: { lat: 52.0, lon: 19.4 },
    neighbours: ["DE-LU", "CZ"],
  },
  {
    id: "CZ",
    name: "Czechia",
    eic: "10YCZ-CEPS-----N",
    countries: ["CZ"],
    centroid: { lat: 49.8, lon: 15.5 },
    neighbours: ["DE-LU", "PL", "AT"],
  },
  {
    id: "AT",
    name: "Austria",
    eic: "10YAT-APG------L",
    countries: ["AT"],
    centroid: { lat: 47.6, lon: 14.1 },
    neighbours: ["DE-LU", "CZ", "HU"],
  },
  {
    id: "HU",
    name: "Hungary",
    eic: "10YHU-MAVIR----U",
    countries: ["HU"],
    centroid: { lat: 47.2, lon: 19.4 },
    neighbours: ["AT", "RO"],
  },
  {
    id: "RO",
    name: "Romania",
    eic: "10YRO-TEL------P",
    countries: ["RO"],
    centroid: { lat: 45.9, lon: 24.9 },
    neighbours: ["HU"],
  },
  {
    id: "ES",
    name: "Spain",
    eic: "10YES-REE------0",
    countries: ["ES"],
    centroid: { lat: 40.2, lon: -3.6 },
    neighbours: ["FR", "PT"],
  },
  {
    id: "PT",
    name: "Portugal",
    eic: "10YPT-REN------W",
    countries: ["PT"],
    centroid: { lat: 39.6, lon: -8.0 },
    neighbours: ["ES"],
  },
];
const COUNTRY_NAMES: Record<string, string> = {
  DE: "Germany",
  LU: "Luxembourg",
  FR: "France",
  NL: "Netherlands",
  BE: "Belgium",
  PL: "Poland",
  CZ: "Czechia",
  AT: "Austria",
  HU: "Hungary",
  RO: "Romania",
  ES: "Spain",
  PT: "Portugal",
};
const COUNTRIES = Object.entries(COUNTRY_NAMES).map(([code, name]) => ({
  code,
  name,
  zones: ZONES.filter((z) => z.countries.includes(code)).map((z) => z.id) as [string, ...string[]],
}));

// ---------- zone profiles (mock values, roughly the right size) ----------
// avgLoad in MW. fixed = near-constant output in MW. solar/wind = peak MW.
interface Profile {
  avgLoad: number;
  fixed: Partial<Record<FuelType, number>>;
  solar: number;
  windOn: number;
  windOff: number;
}
const PROFILES: Record<string, Profile> = {
  "DE-LU": {
    avgLoad: 58000,
    fixed: {
      lignite: 9000,
      hard_coal: 4000,
      biomass: 4500,
      hydro_run_of_river: 1500,
      waste: 700,
      other: 800,
    },
    solar: 22000,
    windOn: 30000,
    windOff: 6000,
  },
  FR: {
    avgLoad: 55000,
    fixed: {
      nuclear: 45000,
      hydro_run_of_river: 4000,
      hydro_reservoir: 2500,
      biomass: 900,
      other: 300,
    },
    solar: 9000,
    windOn: 12000,
    windOff: 1000,
  },
  NL: {
    avgLoad: 13000,
    fixed: { biomass: 600, waste: 400, nuclear: 480, other: 300 },
    solar: 9000,
    windOn: 4500,
    windOff: 3500,
  },
  BE: {
    avgLoad: 10000,
    fixed: { nuclear: 3500, biomass: 400, waste: 250 },
    solar: 4000,
    windOn: 2000,
    windOff: 1800,
  },
  PL: {
    avgLoad: 19000,
    fixed: { hard_coal: 7000, lignite: 4500, biomass: 600, other_renewable: 100 },
    solar: 7000,
    windOn: 7000,
    windOff: 0,
  },
  CZ: {
    avgLoad: 7500,
    fixed: { nuclear: 3800, lignite: 2600, biomass: 450, hydro_run_of_river: 150 },
    solar: 1500,
    windOn: 250,
    windOff: 0,
  },
  AT: {
    avgLoad: 7500,
    fixed: { hydro_run_of_river: 2500, hydro_reservoir: 900, biomass: 350 },
    solar: 2000,
    windOn: 2500,
    windOff: 0,
  },
  HU: {
    avgLoad: 5000,
    fixed: { nuclear: 1900, lignite: 250, biomass: 250 },
    solar: 3000,
    windOn: 300,
    windOff: 0,
  },
  RO: {
    avgLoad: 6500,
    fixed: { nuclear: 1300, lignite: 1300, hydro_run_of_river: 900, hydro_reservoir: 700 },
    solar: 1500,
    windOn: 2500,
    windOff: 0,
  },
  ES: {
    avgLoad: 30000,
    fixed: {
      nuclear: 6500,
      hydro_reservoir: 3500,
      hydro_run_of_river: 1000,
      biomass: 600,
      other_renewable: 200,
    },
    solar: 18000,
    windOn: 20000,
    windOff: 0,
  },
  PT: {
    avgLoad: 6000,
    fixed: { hydro_reservoir: 1300, hydro_run_of_river: 600, biomass: 450 },
    solar: 2500,
    windOn: 4000,
    windOff: 0,
  },
};

// ---------- shapes ----------
const localHour = (ms: number, lon: number) =>
  (((new Date(ms).getUTCHours() + lon / 15) % 24) + 24) % 24;
function solarShape(ms: number, lon: number): number {
  // Late-November day: light from about 08:00 to 16:30 local solar time.
  const h = localHour(ms, lon) + 0.5;
  if (h < 8 || h > 16.5) return 0;
  return Math.sin(((h - 8) / 8.5) * Math.PI) ** 1.5;
}
function loadShape(ms: number, lon: number): number {
  // Morning ramp, midday plateau, evening peak around 18:00, low at night. Lower on weekends.
  const h = localHour(ms, lon);
  const base =
    0.78 + 0.12 * Math.exp(-(((h - 10) / 3) ** 2)) + 0.25 * Math.exp(-(((h - 18) / 2) ** 2));
  const day = new Date(ms).getUTCDay();
  return base * (day === 0 || day === 6 ? 0.9 : 1);
}
function windWalk(hours: number, peak: number): number[] {
  // Smoothed random walk between 5% and 85% of peak.
  const out: number[] = [];
  let x = 0.3 + rand() * 0.3;
  for (let i = 0; i < hours; i++) {
    x = Math.min(0.85, Math.max(0.05, x + noise(0.04)));
    out.push(x * peak);
  }
  return out;
}

// ---------- series helpers ----------
function series(
  startMs: number,
  values: number[],
  state: DataState,
  gaps: [number, number][] = [],
): TimeSeries {
  const vals: (number | null)[] = values.map((v) => Math.round(v));
  const states: DataState[] = values.map(() => state);
  for (const [from, len] of gaps) {
    for (let i = from; i < Math.min(from + len, vals.length); i++) {
      vals[i] = null;
      states[i] = "missing";
    }
  }
  return { start: iso(startMs), resolution: "PT1H", unit: "MW", values: vals, states };
}
// A random gap (start index, length) in the past part of a series, or none.
function maybeGap(length: number, chance: number): [number, number][] {
  if (rand() > chance) return [];
  return [[Math.floor(rand() * (length - 12)), 2 + Math.floor(rand() * 6)]];
}
// Turn one gap into modelled values ("same hour last week" baseline) to show the modelled state.
function modelGap(s: TimeSeries, from: number, len: number): TimeSeries {
  const values = [...s.values];
  const states = [...s.states];
  for (let i = from; i < from + len; i++) {
    const lastWeek = values[i - 168];
    values[i] = lastWeek ?? null;
    states[i] = lastWeek == null ? "missing" : "modelled";
  }
  return {
    ...s,
    values,
    states,
    method: "Gap filled with the value from the same hour one week earlier.",
  };
}

// ---------- time windows ----------
const DAYS_30 = 30 * 24;
const AHEAD = 24;
const start30 = nowMs - DAYS_30 * HOUR;
const start7 = nowMs - 7 * 24 * HOUR;
const hoursPast = DAYS_30; // measured data ends at "now"
const hoursAll = DAYS_30 + AHEAD;
const timeAt = (startMs: number, i: number) => startMs + i * HOUR;

// ---------- generation and load (30 days back) ----------
const generation30: ZoneGeneration[] = ZONES.map((z) => {
  const p = PROFILES[z.id]!;
  const lon = z.centroid.lon;
  const load = Array.from(
    { length: hoursPast },
    (_, i) => p.avgLoad * loadShape(timeAt(start30, i), lon) * (1 + noise(0.02)),
  );
  const solar = Array.from(
    { length: hoursPast },
    (_, i) => p.solar * solarShape(timeAt(start30, i), lon) * (0.4 + 0.6 * rand()),
  );
  const windOn = windWalk(hoursPast, p.windOn);
  const windOff = windWalk(hoursPast, p.windOff);
  const fixed = Object.entries(p.fixed).map(
    ([fuel, mw]) =>
      [fuel, Array.from({ length: hoursPast }, () => mw * (1 + noise(0.03)))] as const,
  );
  // Gas (and pumped storage) cover the rest of the load. Not a real dispatch model.
  const gas = load.map((l, i) => {
    const other =
      fixed.reduce((sum, [, v]) => sum + v[i]!, 0) + solar[i]! + windOn[i]! + windOff[i]!;
    return Math.max(300, (l - other) * 0.85);
  });
  const gen: ZoneGeneration["generation"] = {};
  for (const [fuel, v] of fixed)
    gen[fuel as FuelType] = series(start30, v, "measured", maybeGap(hoursPast, 0.15));
  gen.gas = series(start30, gas, "measured");
  if (p.solar > 0) gen.solar = series(start30, solar, "measured", maybeGap(hoursPast, 0.3));
  if (p.windOn > 0)
    gen.wind_onshore = series(start30, windOn, "measured", maybeGap(hoursPast, 0.3));
  if (p.windOff > 0) gen.wind_offshore = series(start30, windOff, "measured");
  if (["AT", "DE-LU", "ES", "PT", "FR", "BE"].includes(z.id)) {
    const ps = load.map((_, i) => {
      const h = localHour(timeAt(start30, i), lon);
      return (
        (h >= 17 && h <= 20 ? 1 : h >= 11 && h <= 14 ? -0.7 : 0) * p.avgLoad * 0.03 + noise(50)
      );
    });
    gen.hydro_pumped_storage = series(start30, ps, "measured");
  }
  return {
    zone: z.id,
    load: series(start30, load, "measured", maybeGap(hoursPast, 0.4)),
    generation: gen,
  };
});

// ---------- forecasts (next 24 hours) ----------
const forecasts: ZoneForecast[] = ZONES.map((z) => {
  const p = PROFILES[z.id]!;
  const lon = z.centroid.lon;
  const load = Array.from(
    { length: AHEAD },
    (_, i) => p.avgLoad * loadShape(timeAt(nowMs, i), lon),
  );
  const gen: ZoneForecast["generation"] = {};
  if (p.solar > 0)
    gen.solar = series(
      nowMs,
      Array.from({ length: AHEAD }, (_, i) => p.solar * 0.7 * solarShape(timeAt(nowMs, i), lon)),
      "planned",
    );
  if (p.windOn > 0) gen.wind_onshore = series(nowMs, windWalk(AHEAD, p.windOn), "planned");
  if (p.windOff > 0) gen.wind_offshore = series(nowMs, windWalk(AHEAD, p.windOff), "planned");
  return { zone: z.id, load: series(nowMs, load, "planned"), generation: gen };
});
// One zone has no load forecast for the last hours (published late).
const roForecast = forecasts.find((f) => f.zone === "RO")!;
roForecast.load = series(
  nowMs,
  roForecast.load.values.map((v) => v ?? 0),
  "planned",
  [[AHEAD - 6, 6]],
);

// ---------- flows ----------
// [from, to, typical MW in the from -> to direction, daily swing in MW]
const BORDERS: [string, string, number, number][] = [
  ["DE-LU", "FR", -1200, 2500],
  ["DE-LU", "NL", 1500, 1500],
  ["DE-LU", "BE", 300, 600],
  ["DE-LU", "PL", 600, 900],
  ["DE-LU", "CZ", -800, 900],
  ["DE-LU", "AT", 2000, 1500],
  ["FR", "BE", 1500, 1000],
  ["FR", "ES", 1200, 1500],
  ["NL", "BE", 600, 700],
  ["CZ", "PL", 300, 500],
  ["CZ", "AT", 900, 600],
  ["AT", "HU", 700, 500],
  ["HU", "RO", -300, 600],
  ["ES", "PT", 800, 1200],
];
const flows30: BorderSeries[] = BORDERS.flatMap(([from, to, typical, swing]) => {
  const lon =
    (ZONES.find((z) => z.id === from)!.centroid.lon +
      ZONES.find((z) => z.id === to)!.centroid.lon) /
    2;
  const drift = windWalk(hoursAll, 1).map((w) => (w - 0.45) * swing);
  const planned = Array.from(
    { length: hoursAll },
    (_, i) => typical + swing * 0.5 * (solarShape(timeAt(start30, i), lon) - 0.3) + drift[i]!,
  );
  // Physical flow = planned trade plus loop flows and noise, measured until "now".
  const physical = planned.slice(0, hoursPast).map((v) => v + noise(swing * 0.25) + swing * 0.1);
  let phys = series(start30, physical, "measured", maybeGap(hoursPast, 0.5));
  if (from === "DE-LU" && to === "FR") {
    // A 4-hour gap two days ago, filled with modelled values, and a 3-hour gap left missing.
    phys = series(start30, physical, "measured", [
      [hoursPast - 48, 4],
      [hoursPast - 30, 3],
    ]);
    phys = modelGap(phys, hoursPast - 48, 4);
  }
  return [
    { from_zone: from, to_zone: to, kind: "physical", series: phys },
    {
      from_zone: from,
      to_zone: to,
      kind: "scheduled",
      series: series(start30, planned, "planned", maybeGap(hoursAll, 0.2)),
    },
  ];
});

// ---------- cut a 30-day series to 7 days ----------
function cut(s: TimeSeries, fromMs: number): TimeSeries {
  const skip = (fromMs - Date.parse(s.start)) / HOUR;
  if (skip <= 0) return s;
  return { ...s, start: iso(fromMs), values: s.values.slice(skip), states: s.states.slice(skip) };
}
const flows7 = flows30.map((b) => ({ ...b, series: cut(b.series, start7) }));
const generation7 = generation30.map((z) => ({
  zone: z.zone,
  load: cut(z.load, start7),
  generation: Object.fromEntries(Object.entries(z.generation).map(([f, s]) => [f, cut(s, start7)])),
}));

// ---------- data centers (fictional) ----------
const dc = (d: Omit<Datacenter, "source" | "license" | "as_of">): Datacenter => ({
  ...d,
  source: "powerstation.ai mock data generator",
  license: "AGPL-3.0-only",
  as_of: NOW.slice(0, 10),
});
const DATACENTERS: Datacenter[] = [
  dc({
    id: "mock-frankfurt-1",
    name: "Mock DC Frankfurt 1",
    operator: "Example Cloud",
    lat: 50.11,
    lon: 8.68,
    zone: "DE-LU",
    country: "DE",
    power_mw: 180,
    power_state: "measured",
    status: "operating",
  }),
  dc({
    id: "mock-paris-1",
    name: "Mock DC Paris North",
    operator: "Example Hosting",
    lat: 48.95,
    lon: 2.35,
    zone: "FR",
    country: "FR",
    power_mw: 120,
    power_state: "measured",
    status: "operating",
  }),
  dc({
    id: "mock-amsterdam-1",
    name: "Mock DC Amsterdam",
    operator: "Example Cloud",
    lat: 52.3,
    lon: 4.76,
    zone: "NL",
    country: "NL",
    power_mw: 250,
    power_state: "measured",
    status: "operating",
  }),
  dc({
    id: "mock-warsaw-1",
    name: "Mock DC Warsaw",
    operator: null,
    lat: 52.23,
    lon: 21.01,
    zone: "PL",
    country: "PL",
    power_mw: 60,
    power_state: "modelled",
    status: "under_construction",
  }),
  dc({
    id: "mock-bucharest-1",
    name: "Mock DC Bucharest",
    operator: "Example AI Lab",
    lat: 44.43,
    lon: 26.1,
    zone: "RO",
    country: "RO",
    power_mw: 500,
    power_state: "measured",
    status: "planned",
  }),
  dc({
    id: "mock-madrid-1",
    name: "Mock DC Madrid",
    operator: "Example Hosting",
    lat: 40.42,
    lon: -3.7,
    zone: "ES",
    country: "ES",
    power_mw: 1000,
    power_state: "measured",
    status: "planned",
  }),
  dc({
    id: "mock-luxembourg-1",
    name: "Mock DC Luxembourg",
    operator: "Example Cloud",
    lat: 49.61,
    lon: 6.13,
    zone: "DE-LU",
    country: "LU",
    power_mw: null,
    power_state: "missing",
    status: "unknown",
  }),
  dc({
    id: "mock-budapest-1",
    name: "Mock DC Budapest",
    operator: "Example Hosting",
    lat: 47.5,
    lon: 19.04,
    zone: "HU",
    country: "HU",
    power_mw: 40,
    power_state: "measured",
    status: "cancelled",
  }),
];

// ---------- files ----------
const window30 = { start: iso(start30), end: iso(nowMs + AHEAD * HOUR) };
const window7 = { start: iso(start7), end: iso(nowMs + AHEAD * HOUR) };
const windowGen30 = { start: iso(start30), end: NOW };
const windowGen7 = { start: iso(start7), end: NOW };
const windowFc = { start: NOW, end: iso(nowMs + AHEAD * HOUR) };

const out: Record<string, object> = {
  [DATA_PATHS.zones]: { ...envelope, dataset: "zones", zones: ZONES, countries: COUNTRIES },
  [DATA_PATHS.flows7d]: { ...envelope, dataset: "flows", window: window7, borders: flows7 },
  [DATA_PATHS.flows30d]: { ...envelope, dataset: "flows", window: window30, borders: flows30 },
  [DATA_PATHS.generation7d]: {
    ...envelope,
    dataset: "generation",
    window: windowGen7,
    zones: generation7,
  },
  [DATA_PATHS.generation30d]: {
    ...envelope,
    dataset: "generation",
    window: windowGen30,
    zones: generation30,
  },
  [DATA_PATHS.forecasts24h]: {
    ...envelope,
    dataset: "forecasts",
    window: windowFc,
    zones: forecasts,
  },
  [DATA_PATHS.datacenters]: { ...envelope, dataset: "datacenters", datacenters: DATACENTERS },
};
const fileStatus = (path: string, dataset: string, measured: boolean) => ({
  path,
  dataset,
  updated_at: NOW,
  newest_measured_at: measured ? NOW : null,
  ok: true,
});
out[DATA_PATHS.status] = {
  ...envelope,
  dataset: "status",
  files: [
    fileStatus(DATA_PATHS.zones, "zones", false),
    fileStatus(DATA_PATHS.flows7d, "flows", true),
    fileStatus(DATA_PATHS.flows30d, "flows", true),
    fileStatus(DATA_PATHS.generation7d, "generation", true),
    fileStatus(DATA_PATHS.generation30d, "generation", true),
    fileStatus(DATA_PATHS.forecasts24h, "forecasts", false),
    fileStatus(DATA_PATHS.datacenters, "datacenters", false),
  ],
  sources: [
    {
      id: "entsoe",
      name: "ENTSO-E Transparency Platform",
      last_success_at: NOW,
      last_attempt_at: NOW,
      ok: true,
    },
    {
      id: "mock-datacenters",
      name: "Mock data centers",
      last_success_at: NOW,
      last_attempt_at: NOW,
      ok: true,
    },
  ],
};

// JSON with arrays of numbers/strings on one line, so long series stay readable in diffs.
function stringify(value: unknown, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) return JSON.stringify(value);
    const inner = indent + "  ";
    return `[\n${value.map((v) => inner + stringify(v, inner)).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const inner = indent + "  ";
    const entries = Object.entries(value).map(
      ([k, v]) => `${inner}${JSON.stringify(k)}: ${stringify(v, inner)}`,
    );
    return `{\n${entries.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

for (const [path, data] of Object.entries(out)) {
  const file = join(outDir, path);
  mkdirSync(dirname(file), { recursive: true });
  const text = stringify(data) + "\n";
  writeFileSync(file, text);
  const kb = (n: number) => (n / 1024).toFixed(1).padStart(7);
  console.log(
    `${kb(Buffer.byteLength(text))} KB raw ${kb(gzipSync(text).length)} KB gzip  ${path}`,
  );
}
console.log(`Fixtures written to ${outDir} (now = ${NOW}).`);
