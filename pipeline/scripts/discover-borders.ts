// Finds which zone pairs have published physical flows and writes reference/borders.json.
// Usage: tsx scripts/discover-borders.ts [--now <ISO>] [--fresh] [--concurrency <n>]
// Needs ENTSOE_TOKEN. One request per ordered pair (about 2,350). It can be resumed:
// finished pairs are cached in out/discover-cache.json. --fresh ignores the cache.
// Up to --concurrency requests (default 3) wait for a response at the same time.
// The client keeps the rate limit (2 per second, 120 per minute; ENTSO-E allows 400 per minute).
// After a second HTTP 429 the client stops; the script exits with code 2 and keeps the cache.
// A progress line is written every 100 pairs, and a heartbeat line after 60 s of silence.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { iso } from "../src/build/files";
import { toHourly } from "../src/build/hourly";
import { Warnings } from "../src/build/warnings";
import { EntsoeClient, RateLimitStop } from "../src/entsoe/client";
import { loadDotEnv, requireEnv } from "../src/entsoe/env";
import { HOUR_MS, mergeSeries } from "../src/entsoe/parse";
import { physicalFlowQuery } from "../src/entsoe/queries";
import { runPool } from "../src/pool";
import { Progress } from "../src/progress";
import { ZONE_REFERENCE } from "../reference/zones";
import type { BordersReference } from "../src/zones";

loadDotEnv();
const { values: args } = parseArgs({
  options: {
    now: { type: "string" },
    fresh: { type: "boolean", default: false },
    concurrency: { type: "string", default: "3" },
  },
});
const concurrency = Number(args.concurrency);
const token = requireEnv("ENTSOE_TOKEN");

const here = dirname(fileURLToPath(import.meta.url));
const cacheFile = join(here, "..", "out", "discover-cache.json");
const bordersFile = join(here, "..", "reference", "borders.json");
const DAY_MS = 24 * HOUR_MS;

interface Cache {
  checked_at: string;
  window: { start: string; end: string };
  results: Record<string, number>;
}

// Reuse the cache window if the cache is under 24 hours old, so a rerun can resume.
let cache: Cache | undefined;
if (!args.fresh && !args.now && existsSync(cacheFile)) {
  const c = JSON.parse(readFileSync(cacheFile, "utf8")) as Cache;
  if (Date.now() - Date.parse(c.checked_at) < DAY_MS) cache = c;
  else console.log("Cache is older than 24 hours: starting again.");
}
const nowMs = cache
  ? Date.parse(cache.window.end)
  : Math.floor((args.now ? Date.parse(args.now) : Date.now()) / HOUR_MS) * HOUR_MS;
if (Number.isNaN(nowMs)) throw new Error("--now is not a valid date");
const startMs = nowMs - 7 * DAY_MS;
cache ??= {
  checked_at: iso(Math.floor(Date.now() / 1000) * 1000),
  window: { start: iso(startMs), end: iso(nowMs) },
  results: {},
};
const saveCache = () => {
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache) + "\n");
};

const client = new EntsoeClient({ token, log: (m) => console.log(m) });
const warnings = new Warnings();
const pairs = ZONE_REFERENCE.flatMap((a) =>
  ZONE_REFERENCE.filter((b) => b.id !== a.id).map((b) => ({ a, b })),
);
console.log(
  `Discover borders: ${pairs.length} pairs, window ${cache.window.start} to ${cache.window.end}`,
);

const todo = pairs.filter(({ a, b }) => !(`${a.id}>${b.id}` in cache.results));
const progress = new Progress({
  total: pairs.length,
  details: () => {
    const avg = client.averageResponseMs();
    return (
      `${client.requestCount} requests, ${client.requestsLastMinute()} req/min (last minute)` +
      (avg === null ? "" : `, avg response ${Math.round(avg)} ms`)
    );
  },
});
const cachedWithData = Object.values(cache.results).filter((h) => h > 0).length;
progress.skip(pairs.length - todo.length, cachedWithData);
console.log(
  `${pairs.length - todo.length} pairs from the cache, ${todo.length} to query, ${concurrency} at a time.`,
);
progress.start();
try {
  await runPool(todo, concurrency, async ({ a, b }) => {
    const key = `${a.id}>${b.id}`;
    const doc = await client.fetchDocument(physicalFlowQuery(a.eic, b.eic, startMs, nowMs));
    const series = doc.series.filter(
      (s) =>
        (s.outDomain === undefined || s.outDomain === a.eic) &&
        (s.inDomain === undefined || s.inDomain === b.eic),
    );
    const hours = toHourly(mergeSeries(series, warnings, key), startMs, nowMs).filter(
      (v) => v !== null,
    ).length;
    cache.results[key] = hours;
    saveCache();
    if (hours > 0) console.log(`${key}: ${hours} hours`);
    progress.tick(hours > 0);
  });
} catch (err) {
  if (!(err instanceof RateLimitStop)) throw err;
  console.error(
    `\n${err.message}\n${Object.keys(cache.results).length} of ${pairs.length} pairs are in the cache. ` +
      "borders.json was not written. Run again later; the run resumes from the cache.",
  );
  process.exit(2);
} finally {
  progress.stop();
}

const directed = Object.entries(cache.results)
  .map(([key, hours]) => {
    const [from, to] = key.split(">") as [string, string];
    return { from, to, hours_with_data: hours };
  })
  .filter((d) => d.hours_with_data > 0)
  .sort((x, y) =>
    x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : x.to > y.to ? 1 : 0,
  );

const borders: BordersReference = {
  checked_at: cache.checked_at,
  window: cache.window,
  method:
    "For every ordered pair of candidate zones, one ENTSO-E request for physical flows (document type A11) " +
    "for the 7 days before the check. The data is aggregated to hours. A pair is kept if at least one " +
    "hour has a value.",
  directed,
};
writeFileSync(bordersFile, JSON.stringify(borders, null, 2) + "\n");

const withFlows = new Set(directed.flatMap((d) => [d.from, d.to]));
const without = ZONE_REFERENCE.filter((z) => !withFlows.has(z.id)).map((z) => z.id);
console.log(
  `\nWrote ${bordersFile}: ${directed.length} directed pairs, ${withFlows.size} zones with flows.`,
);
console.log(`Zones with no flows at all (${without.length}): ${without.join(", ") || "none"}`);
