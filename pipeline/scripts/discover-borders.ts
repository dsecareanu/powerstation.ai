// Finds which zone pairs have published physical flows and writes reference/borders.json.
// Usage: tsx scripts/discover-borders.ts [--now <ISO>] [--fresh]
// Needs ENTSOE_TOKEN. One request per ordered pair (about 2,350). It can be resumed:
// finished pairs are cached in out/discover-cache.json. --fresh ignores the cache.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { iso } from "../src/build/files";
import { toHourly } from "../src/build/hourly";
import { Warnings } from "../src/build/warnings";
import { EntsoeClient } from "../src/entsoe/client";
import { loadDotEnv, requireEnv } from "../src/entsoe/env";
import { HOUR_MS, mergeSeries } from "../src/entsoe/parse";
import { physicalFlowQuery } from "../src/entsoe/queries";
import { ZONE_REFERENCE } from "../reference/zones";
import type { BordersReference } from "../src/zones";

loadDotEnv();
const { values: args } = parseArgs({
  options: { now: { type: "string" }, fresh: { type: "boolean", default: false } },
});
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

let done = 0;
for (const { a, b } of pairs) {
  const key = `${a.id}>${b.id}`;
  done++;
  if (key in cache.results) continue;
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
  if (done % 50 === 0 || hours > 0) console.log(`[${done}/${pairs.length}] ${key}: ${hours} hours`);
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
