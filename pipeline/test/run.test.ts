// End to end: the real client with a fake fetch that returns synthetic XML.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DATA_PATHS,
  type DataFile,
  type FlowsFile,
  type GenerationFile,
} from "@powerstation/schema";
import { iso } from "../src/build/files";
import { validateAll } from "../src/build/output";
import { runBackfill, type RunOptions } from "../src/build/run";
import { EntsoeClient, type FetchFn } from "../src/entsoe/client";
import { ZONE_REFERENCE } from "../reference/zones";
import {
  buildZonesFile,
  neighbourPairs,
  type BordersReference,
  type CentroidsReference,
} from "../src/zones";
import { ackXml, docXml, hourlyPeriod, parsePeriodParam, type SeriesSpec } from "./helpers";

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 25, 12, 0);
const eic = (id: string) => ZONE_REFERENCE.find((z) => z.id === id)!.eic;
const idOf = (e: string) => ZONE_REFERENCE.find((z) => z.eic === e)!.id;

const borders: BordersReference = {
  checked_at: "2026-11-25T00:00:00Z",
  window: { start: "2026-11-18T00:00:00Z", end: "2026-11-25T00:00:00Z" },
  method: "test",
  directed: [
    { from: "BE", to: "FR", hours_with_data: 5 },
    { from: "FR", to: "BE", hours_with_data: 5 },
    { from: "BE", to: "NL", hours_with_data: 5 },
  ],
};
const centroids: CentroidsReference = {
  method: "test",
  source: "test",
  centroids: {
    BE: { lat: 50.6, lon: 4.6 },
    FR: { lat: 46.6, lon: 2.4 },
    NL: { lat: 52.2, lon: 5.5 },
  },
};
const zones = buildZonesFile("2026-11-25T12:30:00Z", borders, centroids);
const pairs = neighbourPairs(borders);

// What the fake ENTSO-E has. Missing entries answer "no data" (999).
const FLOW: Record<string, number> = { "FR>BE": 100, "BE>FR": 40, "BE>NL": 50 };
const SCHEDULED: Record<string, number> = { "FR>BE": 70, "BE>FR": 20 };
const CAPACITY: Record<string, number> = { "FR>BE": 1000, "BE>FR": 900, "BE>NL": 500 };

function respond(p: URLSearchParams): string {
  const s = parsePeriodParam(p.get("periodStart")!);
  const e = parsePeriodParam(p.get("periodEnd")!);
  const period = (v: number) => hourlyPeriod(s, e, () => v);
  const out = p.get("out_Domain");
  const inn = p.get("in_Domain");
  const key = out && inn ? `${idOf(out)}>${idOf(inn)}` : "";
  const direction = (v: number | undefined, extra: Partial<SeriesSpec> = {}) =>
    v === undefined
      ? ackXml("999")
      : docXml([{ outDomain: out!, inDomain: inn!, periods: [period(v)], ...extra }]);
  switch (p.get("documentType")) {
    case "A11":
      return direction(FLOW[key]);
    case "A09": {
      const v = SCHEDULED[key];
      if (v === undefined) return ackXml("999");
      return docXml([
        { outDomain: out!, inDomain: inn!, contract: "A01", periods: [period(v)] },
        { outDomain: out!, inDomain: inn!, contract: "A05", periods: [period(999)] },
      ]);
    }
    case "A61":
      return direction(CAPACITY[key], { contract: "A01" });
    case "A75": {
      if (inn !== eic("FR") && inn !== eic("BE")) return ackXml("999");
      return docXml(
        [
          { inBz: inn!, psr: "B16", periods: [period(10)] },
          { inBz: inn!, psr: "B10", periods: [period(60)] },
          { outBz: inn!, psr: "B10", periods: [period(20)] },
        ],
        "GL_MarketDocument",
      );
    }
    case "A65": {
      const zone = p.get("outBiddingZone_Domain")!;
      if (p.get("processType") === "A16" && zone === eic("NL")) return ackXml("999");
      const value = p.get("processType") === "A16" ? 1000 : 900;
      return docXml([{ outBz: zone, periods: [period(value)] }], "GL_MarketDocument");
    }
    case "A69":
      return inn === eic("FR")
        ? docXml([{ inBz: inn, psr: "B19", periods: [period(30)] }], "GL_MarketDocument")
        : ackXml("999");
    default:
      throw new Error(`unexpected query ${p.toString()}`);
  }
}

async function run(includeRestricted: boolean, extra: Partial<RunOptions> = {}) {
  const fetchFn: FetchFn = async (url) => ({
    status: 200,
    text: async () => respond(new URL(url).searchParams),
  });
  const client = new EntsoeClient({
    token: "t",
    fetchFn,
    sleep: async () => {},
    clock: () => 0,
    maxPerSecond: 1e9,
    maxPerMinute: 1e9,
  });
  const result = await runBackfill({
    client,
    zones,
    pairs,
    nowMs: NOW,
    days: 30,
    includeRestricted,
    generatedAt: "2026-11-25T12:30:00Z",
    ...extra,
  });
  return { ...result, requests: client.requestCount };
}

const get = <T extends DataFile>(files: Record<string, DataFile>, path: string) => files[path] as T;

test("default run: open data only, files are valid", async () => {
  const { files, warnings, requests } = await run(false);
  assert.deepEqual(
    Object.keys(files).sort(),
    [
      DATA_PATHS.capacity30d,
      DATA_PATHS.flows30d,
      DATA_PATHS.flows7d,
      DATA_PATHS.forecasts24h,
      DATA_PATHS.status,
      DATA_PATHS.zones,
    ].sort(),
  );
  assert.deepEqual(validateAll(files, zones), []);
  // 2 pairs x 2 directions x (physical + capacity) + 3 zones x load forecast
  assert.equal(requests, 11);

  const flows = get<FlowsFile>(files, DATA_PATHS.flows30d);
  assert.ok(flows.borders.every((b) => b.kind === "physical"));
  assert.equal(flows.window.start, iso(NOW - 30 * 24 * H));
  assert.equal(flows.window.end, iso(NOW));
  const bf = flows.borders.find((b) => b.from_zone === "BE" && b.to_zone === "FR")!;
  assert.equal(bf.series.values.length, 30 * 24);
  assert.ok(bf.series.values.every((v) => v === -60));
  assert.ok(bf.series.states.every((s) => s === "measured"));
  // One direction not published: the other direction is used alone, with a warning.
  const bn = flows.borders.find((b) => b.to_zone === "NL")!;
  assert.ok(bn.series.values.every((v) => v === 50));
  assert.ok(
    warnings.list().some((w) => w.message.includes("BE-NL") && w.message.includes("NL -> BE")),
  );
  assert.equal(get<FlowsFile>(files, DATA_PATHS.flows7d).borders[0]!.series.values.length, 7 * 24);

  const capacity = get(
    files,
    DATA_PATHS.capacity30d,
  ) as import("@powerstation/schema").CapacityFile;
  assert.equal(capacity.borders.length, 3); // NL -> BE has no data and is left out
  assert.equal(capacity.borders[0]!.series.values.length, 30 * 24 + 24);

  const forecasts = get(
    files,
    DATA_PATHS.forecasts24h,
  ) as import("@powerstation/schema").ForecastsFile;
  assert.equal(forecasts.zones.length, 3);
  assert.ok(forecasts.zones.every((z) => Object.keys(z.generation).length === 0));
  assert.equal(forecasts.zones[0]!.load.values.length, 24);

  const status = get(files, DATA_PATHS.status) as import("@powerstation/schema").StatusFile;
  assert.equal(
    status.files.some((f) => f.dataset === "generation"),
    false,
  );
  assert.equal(
    status.files.find((f) => f.path === DATA_PATHS.flows7d)!.newest_measured_at,
    iso(NOW),
  );
  assert.equal(
    status.files.find((f) => f.path === DATA_PATHS.forecasts24h)!.newest_measured_at,
    null,
  );
  assert.equal(status.sources[0]!.id, "entsoe");
});

test("restricted run: generation, load, scheduled exchanges and wind/solar are added", async () => {
  const { files, requests } = await run(true);
  assert.deepEqual(validateAll(files, zones), []);
  // 2 pairs x 2 directions x 3 + 3 zones x 4
  assert.equal(requests, 24);

  const flows = get<FlowsFile>(files, DATA_PATHS.flows30d);
  const sched = flows.borders.filter((b) => b.kind === "scheduled");
  assert.equal(sched.length, 1); // BE-NL has no scheduled data in either direction
  assert.ok(sched[0]!.series.values.every((v) => v === -50)); // only A01 (20 - 70)
  assert.equal(sched[0]!.series.values.length, 30 * 24 + 24);
  assert.ok(sched[0]!.series.states.every((s) => s === "planned"));
  assert.equal(flows.window.end, iso(NOW + 24 * H));

  const gen = get<GenerationFile>(files, DATA_PATHS.generation30d);
  assert.deepEqual(gen.zones.map((z) => z.zone).sort(), ["BE", "FR"]); // NL has no data at all
  const fr = gen.zones.find((z) => z.zone === "FR")!;
  assert.ok(fr.load.values.every((v) => v === 1000));
  assert.ok(fr.generation.solar!.values.every((v) => v === 10));
  assert.ok(fr.generation.hydro_pumped_storage!.values.every((v) => v === 40));
  assert.equal(
    get<GenerationFile>(files, DATA_PATHS.generation7d).zones[0]!.load.values.length,
    7 * 24,
  );

  const forecasts = get(
    files,
    DATA_PATHS.forecasts24h,
  ) as import("@powerstation/schema").ForecastsFile;
  const frF = forecasts.zones.find((z) => z.zone === "FR")!;
  assert.ok(frF.generation.wind_onshore!.values.every((v) => v === 30));
});

test("validation catches a mock file", async () => {
  const { files } = await run(false);
  const bad = {
    ...files,
    [DATA_PATHS.flows7d]: { ...files[DATA_PATHS.flows7d]!, mock: true },
  } as Record<string, DataFile>;
  assert.ok(validateAll(bad, zones).some((e) => e.includes("mock")));
});

test("hours and only: a short window for chosen datasets", async () => {
  const { files, requests } = await run(false, { hours: 48, only: ["flows", "forecasts"] });
  assert.deepEqual(
    Object.keys(files).sort(),
    [
      DATA_PATHS.flows30d,
      DATA_PATHS.flows7d,
      DATA_PATHS.forecasts24h,
      DATA_PATHS.status,
      DATA_PATHS.zones,
    ].sort(),
  );
  // 2 pairs x 2 directions x physical + 3 zones x load forecast
  assert.equal(requests, 7);
  const flows = get<FlowsFile>(files, DATA_PATHS.flows30d);
  assert.equal(flows.window.start, iso(NOW - 48 * H));
  assert.equal(flows.borders[0]!.series.values.length, 48);
  assert.deepEqual(validateAll(files, zones), []);
});

// ---------- fault isolation ----------
/** Runs with a fetch that answers HTTP 400 for the listed "documentType key" requests. */
async function runWithFaults(failing: (doc: string, key: string) => boolean, logs: string[]) {
  const fetchFn: FetchFn = async (url) => {
    const p = new URL(url).searchParams;
    const out = p.get("out_Domain");
    const inn = p.get("in_Domain");
    const key = out && inn ? `${idOf(out)}>${idOf(inn)}` : (p.get("outBiddingZone_Domain") ?? "");
    if (failing(p.get("documentType")!, key)) {
      return { status: 400, text: async () => "<html>bad request</html>" };
    }
    return { status: 200, text: async () => respond(p) };
  };
  const client = new EntsoeClient({
    token: "t",
    fetchFn,
    sleep: async () => {},
    clock: () => 0,
    maxPerSecond: 1e9,
    maxPerMinute: 1e9,
  });
  return runBackfill({
    client,
    zones,
    pairs,
    nowMs: NOW,
    days: 30,
    includeRestricted: false,
    generatedAt: "2026-11-25T12:30:00Z",
    log: (m) => logs.push(m),
  });
}

test("one failed request: that border is left out of the run, the rest is built", async () => {
  const logs: string[] = [];
  const r = await runWithFaults((doc, key) => doc === "A11" && key === "FR>BE", logs);
  assert.equal(r.failedRequests, 1);
  assert.equal(r.requests, 11);
  assert.deepEqual(validateAll(r.files, zones), []);
  const flows = get<FlowsFile>(r.files, DATA_PATHS.flows30d);
  // BE-FR is not netted from one direction: it is left out, so the merge keeps old values.
  assert.equal(
    flows.borders.find((b) => b.to_zone === "FR"),
    undefined,
  );
  assert.ok(flows.borders.find((b) => b.to_zone === "NL"));
  assert.ok(r.warnings.list().some((w) => w.message.includes("physical BE-FR: a request failed")));
  assert.ok(logs.some((l) => l.startsWith("Request failed: physical FR -> BE")));
  assert.ok(
    logs.some((l) => l.startsWith("[11/11] requests with data: 8, ") && l.includes("1 failed")),
  );
});

test("more than half of the requests fail: the run fails", async () => {
  await assert.rejects(
    runWithFaults((doc) => doc === "A11" || doc === "A61", []),
    /8 of 11 ENTSO-E requests failed/,
  );
});

test("a Point without a quantity in a response: missing hour and a warning, no crash", async () => {
  const logs: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    const p = new URL(url).searchParams;
    let body = respond(p);
    // Remove the quantity of the first Point of the physical flow BE -> NL.
    if (
      p.get("documentType") === "A11" &&
      p.get("out_Domain") === eic("BE") &&
      p.get("in_Domain") === eic("NL")
    ) {
      body = body.replace(/<quantity>50<\/quantity>/, "");
    }
    return { status: 200, text: async () => body };
  };
  const client = new EntsoeClient({
    token: "t",
    fetchFn,
    sleep: async () => {},
    clock: () => 0,
    maxPerSecond: 1e9,
    maxPerMinute: 1e9,
  });
  const r = await runBackfill({
    client,
    zones,
    pairs,
    nowMs: NOW,
    days: 30,
    includeRestricted: false,
    generatedAt: "2026-11-25T12:30:00Z",
    log: (m) => logs.push(m),
  });
  assert.equal(r.failedRequests, 0);
  assert.deepEqual(validateAll(r.files, zones), []);
  const bn = get<FlowsFile>(r.files, DATA_PATHS.flows30d).borders.find((b) => b.to_zone === "NL")!;
  assert.equal(bn.series.values[0], null);
  assert.equal(bn.series.states[0], "missing");
  assert.equal(bn.series.values[1], 50);
  assert.equal(logs.filter((l) => l.startsWith("Warning: physical BE -> NL")).length, 1);
});
