// Runs all ENTSO-E queries for one backfill and builds the data files.
import { DATA_PATHS, type DataFile, type FuelType, type ZonesFile } from "@powerstation/schema";
import { mergeSeries, HOUR_MS, type ParsedDocument, type ParsedTimeSeries } from "../entsoe/parse";
import {
  capacityQuery,
  generationQuery,
  loadForecastQuery,
  loadQuery,
  physicalFlowQuery,
  scheduledQuery,
  windSolarForecastQuery,
  type Params,
} from "../entsoe/queries";
import {
  capacityFile,
  flowsFile,
  forecastsFile,
  generationFile,
  netBorder,
  statusFile,
  type DirectedCapacitySeries,
  type FlowBorder,
  type Series,
  type ZoneSeries,
} from "./files";
import { buildForecastGeneration, buildFuelSeries } from "./fuels";
import { toHourly } from "./hourly";
import { Warnings } from "./warnings";

export interface RunOptions {
  client: { fetchDocument(params: Params): Promise<ParsedDocument> };
  zones: ZonesFile;
  /** Undirected neighbour pairs [a, b] with a < b. */
  pairs: [string, string][];
  /** Current UTC hour, in ms. */
  nowMs: number;
  days: number;
  includeRestricted: boolean;
  generatedAt: string;
  log?: (message: string) => void;
}

export interface RunResult {
  files: Record<string, DataFile>;
  warnings: Warnings;
}

const DAY_MS = 24 * HOUR_MS;

export async function runBackfill(opts: RunOptions): Promise<RunResult> {
  const { client, zones, pairs, nowMs, includeRestricted, generatedAt } = opts;
  const log = opts.log ?? (() => {});
  const warnings = new Warnings();
  const start30 = nowMs - opts.days * DAY_MS;
  const start7 = Math.max(nowMs - 7 * DAY_MS, start30);
  const end24 = nowMs + DAY_MS;
  const eic = new Map(zones.zones.map((z) => [z.id, z.eic]));
  const eicOf = (id: string): string => {
    const e = eic.get(id);
    if (!e) throw new Error(`Zone ${id} is not in zones.json`);
    return e;
  };

  const perPair = 2 * (2 + (includeRestricted ? 1 : 0));
  const perZone = 1 + (includeRestricted ? 3 : 0);
  const total = pairs.length * perPair + zones.zones.length * perZone;
  let n = 0;
  const request = (dataset: string, label: string, params: Params) => {
    log(`[${++n}/${total}] ${dataset} ${label}`);
    return client.fetchDocument(params);
  };

  /** One direction of a border: hourly values, or null if ENTSO-E published nothing. */
  async function direction(
    dataset: string,
    from: string,
    to: string,
    query: (out: string, inn: string, s: number, e: number) => Params,
    endMs: number,
    keep: (s: ParsedTimeSeries) => boolean,
  ) {
    const out = eicOf(from);
    const inn = eicOf(to);
    const doc = await request(dataset, `${from} -> ${to}`, query(out, inn, start30, endMs));
    const kept = doc.series.filter((s) => {
      const rightPair =
        (s.outDomain === undefined || s.outDomain === out) &&
        (s.inDomain === undefined || s.inDomain === inn);
      if (!rightPair)
        warnings.add(`wrong-domain:${dataset}`, `${dataset}: series for another zone pair dropped`);
      return rightPair && keep(s);
    });
    const steps = mergeSeries(kept, warnings, `${dataset} ${from}->${to}`);
    return steps.size === 0 ? null : toHourly(steps, start30, endMs);
  }

  // ---------- flows ----------
  const flowBorders: FlowBorder[] = [];
  const kinds = [
    { kind: "physical" as const, query: physicalFlowQuery, end: nowMs, keep: () => true },
    {
      kind: "scheduled" as const,
      query: scheduledQuery,
      end: end24,
      keep: (s: ParsedTimeSeries) => {
        if (s.contractType !== "A01") {
          warnings.add("sched-contract", "scheduled: series that are not day-ahead (A01) dropped");
          return false;
        }
        return true;
      },
    },
  ].filter((k) => k.kind === "physical" || includeRestricted);
  for (const k of kinds) {
    for (const [a, b] of pairs) {
      const ab = await direction(k.kind, a, b, k.query, k.end, k.keep);
      const ba = await direction(k.kind, b, a, k.query, k.end, k.keep);
      const net = netBorder(ab, ba);
      if (!net) {
        warnings.add(
          `no-data:${k.kind}:${a}|${b}`,
          `${k.kind} ${a}-${b}: no data in either direction; border left out`,
        );
        continue;
      }
      if (net.oneSided) {
        const missing = net.oneSided === "a_to_b" ? `${b} -> ${a}` : `${a} -> ${b}`;
        warnings.add(
          `one-direction:${k.kind}:${a}|${b}`,
          `${k.kind} ${a}-${b}: direction ${missing} not published; used the other direction alone`,
        );
      }
      flowBorders.push({
        from: a,
        to: b,
        kind: k.kind,
        series: { start: start30, values: net.values },
      });
    }
  }

  // ---------- capacity ----------
  const capacity: DirectedCapacitySeries[] = [];
  for (const [a, b] of pairs) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const values = await direction(
        "capacity",
        from,
        to,
        capacityQuery,
        end24,
        (s) => s.contractType === undefined || s.contractType === "A01",
      );
      if (values) capacity.push({ from, to, series: { start: start30, values } });
    }
  }

  // ---------- generation and load (restricted) ----------
  const generation: ZoneSeries<FuelType>[] = [];
  const forecasts: ZoneSeries<"solar" | "wind_offshore" | "wind_onshore">[] = [];
  for (const z of zones.zones) {
    if (includeRestricted) {
      const gen = await request("generation", z.id, generationQuery(eicOf(z.id), start30, nowMs));
      const load = await request("load", z.id, loadQuery(eicOf(z.id), start30, nowMs));
      if (gen.series.length > 0 || load.series.length > 0) {
        const loadSteps = mergeSeries(load.series, warnings, `${z.id} load`);
        const fuels = buildFuelSeries(gen.series, start30, nowMs, warnings, z.id);
        generation.push({
          zone: z.id,
          load: { start: start30, values: toHourly(loadSteps, start30, nowMs) },
          generation: Object.fromEntries(
            Object.entries(fuels).map(([f, values]) => [f, { start: start30, values }]),
          ),
        });
      }
    }
    // Forecasts: load is open data. Wind and solar are restricted.
    const lf = await request("load forecast", z.id, loadForecastQuery(eicOf(z.id), nowMs, end24));
    const ws = includeRestricted
      ? await request(
          "wind/solar forecast",
          z.id,
          windSolarForecastQuery(eicOf(z.id), nowMs, end24),
        )
      : { empty: true, series: [] as ParsedTimeSeries[] };
    if (lf.series.length > 0 || ws.series.length > 0) {
      const loadSteps = mergeSeries(lf.series, warnings, `${z.id} load forecast`);
      const gens = buildForecastGeneration(ws.series, nowMs, end24, warnings, z.id);
      forecasts.push({
        zone: z.id,
        load: { start: nowMs, values: toHourly(loadSteps, nowMs, end24) },
        generation: Object.fromEntries(
          Object.entries(gens).map(([k, values]) => [k, { start: nowMs, values } as Series]),
        ),
      });
    }
  }

  // ---------- files ----------
  const files: Record<string, DataFile> = {};
  files[DATA_PATHS.zones] = zones;
  const flowsEnd = includeRestricted ? end24 : nowMs;
  files[DATA_PATHS.flows7d] = flowsFile(flowBorders, start7, flowsEnd, generatedAt);
  files[DATA_PATHS.flows30d] = flowsFile(flowBorders, start30, flowsEnd, generatedAt);
  files[DATA_PATHS.capacity30d] = capacityFile(capacity, start30, end24, generatedAt);
  files[DATA_PATHS.forecasts24h] = forecastsFile(forecasts, nowMs, end24, generatedAt);
  if (includeRestricted) {
    files[DATA_PATHS.generation7d] = generationFile(generation, start7, nowMs, generatedAt);
    files[DATA_PATHS.generation30d] = generationFile(generation, start30, nowMs, generatedAt);
  }
  files[DATA_PATHS.status] = statusFile(files, generatedAt, warnings);
  return { files, warnings };
}
