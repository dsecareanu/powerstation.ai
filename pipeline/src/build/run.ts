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
import { RateLimitStop } from "../entsoe/client";
import { runPool } from "../pool";
import { Progress } from "../progress";
import { buildForecastGeneration, buildFuelSeries } from "./fuels";
import { toHourly, type Hourly } from "./hourly";
import { Warnings } from "./warnings";

export interface RunOptions {
  client: {
    fetchDocument(params: Params): Promise<ParsedDocument>;
    /** Requests sent in the last minute, for the progress line. Optional. */
    requestsLastMinute?(): number;
  };
  zones: ZonesFile;
  /** Undirected neighbour pairs [a, b] with a < b. */
  pairs: [string, string][];
  /** Current UTC hour, in ms. */
  nowMs: number;
  days: number;
  /** If set, the window is this many hours (instead of `days`). */
  hours?: number;
  /** Datasets to fetch and build. Default: all. zones.json and status.json are always built. */
  only?: readonly Dataset[];
  includeRestricted: boolean;
  generatedAt: string;
  log?: (message: string) => void;
  /** Requests waiting for a response at the same time. Default 3. The client keeps the rate limit. */
  concurrency?: number;
  /** A progress line every this many requests. Default 50. */
  progressEvery?: number;
}

export type Dataset = "flows" | "capacity" | "generation" | "forecasts";

export interface RunResult {
  files: Record<string, DataFile>;
  warnings: Warnings;
  requests: number;
  failedRequests: number;
}

const DAY_MS = 24 * HOUR_MS;
/** The run fails when more than this share of requests fail. */
export const MAX_FAILED_SHARE = 0.5;

interface Task {
  key: string;
  label: string;
  params: Params;
}

export async function runBackfill(opts: RunOptions): Promise<RunResult> {
  const { client, zones, pairs, nowMs, includeRestricted, generatedAt } = opts;
  const log = opts.log ?? (() => {});
  const warnings = new Warnings();
  const windowMs = opts.hours !== undefined ? opts.hours * HOUR_MS : opts.days * DAY_MS;
  const has = (d: Dataset): boolean => !opts.only || opts.only.includes(d);
  const start30 = nowMs - windowMs;
  const start7 = Math.max(nowMs - 7 * DAY_MS, start30);
  const end24 = nowMs + DAY_MS;
  const eic = new Map(zones.zones.map((z) => [z.id, z.eic]));
  const eicOf = (id: string): string => {
    const e = eic.get(id);
    if (!e) throw new Error(`Zone ${id} is not in zones.json`);
    return e;
  };

  // ---------- 1. list every request ----------
  const flowKinds = [
    { kind: "physical" as const, query: physicalFlowQuery, end: nowMs },
    { kind: "scheduled" as const, query: scheduledQuery, end: end24 },
  ].filter((k) => has("flows") && (k.kind === "physical" || includeRestricted));
  const tasks: Task[] = [];
  const dirKey = (dataset: string, from: string, to: string) => `${dataset} ${from} -> ${to}`;
  const addDirection = (
    dataset: string,
    from: string,
    to: string,
    query: (out: string, inn: string, s: number, e: number) => Params,
    endMs: number,
  ) => {
    const key = dirKey(dataset, from, to);
    tasks.push({ key, label: key, params: query(eicOf(from), eicOf(to), start30, endMs) });
  };
  for (const k of flowKinds) {
    for (const [a, b] of pairs) {
      addDirection(k.kind, a, b, k.query, k.end);
      addDirection(k.kind, b, a, k.query, k.end);
    }
  }
  for (const [a, b] of has("capacity") ? pairs : []) {
    addDirection("capacity", a, b, capacityQuery, end24);
    addDirection("capacity", b, a, capacityQuery, end24);
  }
  for (const z of zones.zones) {
    const id = eicOf(z.id);
    if (includeRestricted && has("generation")) {
      tasks.push({
        key: `generation ${z.id}`,
        label: `generation ${z.id}`,
        params: generationQuery(id, start30, nowMs),
      });
      tasks.push({
        key: `load ${z.id}`,
        label: `load ${z.id}`,
        params: loadQuery(id, start30, nowMs),
      });
    }
    if (has("forecasts")) {
      tasks.push({
        key: `load forecast ${z.id}`,
        label: `load forecast ${z.id}`,
        params: loadForecastQuery(id, nowMs, end24),
      });
      if (includeRestricted) {
        tasks.push({
          key: `wind/solar forecast ${z.id}`,
          label: `wind/solar forecast ${z.id}`,
          params: windSolarForecastQuery(id, nowMs, end24),
        });
      }
    }
  }

  // ---------- 2. run them, a few at a time ----------
  // A request that fails after the client's retries is recorded and the run goes on.
  // RateLimitStop (second HTTP 429 ban) stops the whole run.
  const docs = new Map<string, ParsedDocument>();
  const failed = new Set<string>();
  const progress = new Progress({
    total: tasks.length,
    every: opts.progressEvery ?? 50,
    log,
    withDataLabel: "requests with data",
    details: () => {
      const perMin = client.requestsLastMinute?.();
      return (
        `${failed.size} failed` + (perMin === undefined ? "" : `, ${perMin} req/min (last minute)`)
      );
    },
  });
  log(`${tasks.length} ENTSO-E requests, ${opts.concurrency ?? 3} at a time.`);
  progress.start();
  try {
    await runPool(tasks, opts.concurrency ?? 3, async (task) => {
      try {
        const doc = await client.fetchDocument(task.params);
        docs.set(task.key, doc);
        progress.tick(doc.series.length > 0);
      } catch (err) {
        if (err instanceof RateLimitStop) throw err;
        failed.add(task.key);
        const reason = (err as Error).message;
        log(`Request failed: ${task.label}: ${reason}`);
        warnings.add(
          `request-failed:${task.key}`,
          `${task.label}: request failed (${reason}); hours kept from the previous file or missing`,
        );
        progress.tick(false);
      }
    });
  } finally {
    progress.stop();
  }
  if (tasks.length > 0 && failed.size / tasks.length > MAX_FAILED_SHARE) {
    throw new Error(
      `${failed.size} of ${tasks.length} ENTSO-E requests failed (more than ${MAX_FAILED_SHARE * 100}%). No files built.`,
    );
  }

  /** The parsed document, or "failed". Logs one warning per series with left-out content. */
  const result = (key: string): ParsedDocument | "failed" => {
    if (failed.has(key)) return "failed";
    const doc = docs.get(key)!;
    doc.series.forEach((s, i) => {
      if (s.problems.length === 0) return;
      const message = `${key} (series ${i + 1}): ${s.problems.join("; ")}; those hours are missing`;
      log(`Warning: ${message}`);
      warnings.add(`bad-content:${key}:${i}`, message);
    });
    return doc;
  };

  /** One direction: hourly values, null if ENTSO-E published nothing, or "failed". */
  function direction(
    dataset: string,
    from: string,
    to: string,
    endMs: number,
    keep: (s: ParsedTimeSeries) => boolean,
  ): Hourly | null | "failed" {
    const key = dirKey(dataset, from, to);
    const doc = result(key);
    if (doc === "failed") return "failed";
    const out = eicOf(from);
    const inn = eicOf(to);
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

  // ---------- 3. build the series ----------
  // ---------- flows ----------
  const flowBorders: FlowBorder[] = [];
  const keepOf = (kind: "physical" | "scheduled") =>
    kind === "physical"
      ? () => true
      : (s: ParsedTimeSeries) => {
          if (s.contractType !== "A01") {
            warnings.add(
              "sched-contract",
              "scheduled: series that are not day-ahead (A01) dropped",
            );
            return false;
          }
          return true;
        };
  for (const k of flowKinds) {
    for (const [a, b] of pairs) {
      const ab = direction(k.kind, a, b, k.end, keepOf(k.kind));
      const ba = direction(k.kind, b, a, k.end, keepOf(k.kind));
      if (ab === "failed" || ba === "failed") {
        // Netting one direction alone would give a wrong value: leave the border out of
        // this run. The merge keeps the previous file's values; new hours stay missing.
        warnings.add(
          `failed-border:${k.kind}:${a}|${b}`,
          `${k.kind} ${a}-${b}: a request failed; border not updated in this run`,
        );
        continue;
      }
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
  for (const [a, b] of has("capacity") ? pairs : []) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const values = direction(
        "capacity",
        from,
        to,
        end24,
        (s) => s.contractType === undefined || s.contractType === "A01",
      );
      if (values && values !== "failed")
        capacity.push({ from, to, series: { start: start30, values } });
    }
  }

  // ---------- generation and load (restricted) ----------
  const generation: ZoneSeries<FuelType>[] = [];
  const forecasts: ZoneSeries<"solar" | "wind_offshore" | "wind_onshore">[] = [];
  const EMPTY: ParsedDocument = { empty: true, series: [] };
  for (const z of zones.zones) {
    if (includeRestricted && has("generation")) {
      const gen = result(`generation ${z.id}`);
      const load = result(`load ${z.id}`);
      // A failed request leaves the zone out of this run; the merge keeps old values.
      if (
        gen !== "failed" &&
        load !== "failed" &&
        (gen.series.length > 0 || load.series.length > 0)
      ) {
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
    if (!has("forecasts")) continue;
    const lf = result(`load forecast ${z.id}`);
    const wsRaw = includeRestricted ? result(`wind/solar forecast ${z.id}`) : EMPTY;
    const ws = wsRaw === "failed" ? EMPTY : wsRaw;
    if (lf === "failed") continue; // no forecast for this zone in this run
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
  if (has("flows")) {
    files[DATA_PATHS.flows7d] = flowsFile(flowBorders, start7, flowsEnd, generatedAt);
    files[DATA_PATHS.flows30d] = flowsFile(flowBorders, start30, flowsEnd, generatedAt);
  }
  if (has("capacity")) {
    files[DATA_PATHS.capacity30d] = capacityFile(capacity, start30, end24, generatedAt);
  }
  if (has("forecasts")) {
    files[DATA_PATHS.forecasts24h] = forecastsFile(forecasts, nowMs, end24, generatedAt);
  }
  if (includeRestricted && has("generation")) {
    files[DATA_PATHS.generation7d] = generationFile(generation, start7, nowMs, generatedAt);
    files[DATA_PATHS.generation30d] = generationFile(generation, start30, nowMs, generatedAt);
  }
  files[DATA_PATHS.status] = statusFile(files, generatedAt, warnings);
  return { files, warnings, requests: tasks.length, failedRequests: failed.size };
}
