// Hourly update: fetches recent ENTSO-E data, merges it into the rolling files
// that are now on R2, and writes the result to <out>/v1/... It does not upload.
// Usage: tsx scripts/update.ts [--now <ISO>] [--recent-hours 48] [--include-restricted]
//                              [--out <dir>]
// Needs ENTSOE_TOKEN and the R2 settings (read access). See pipeline/README.md.
// If the 30-day file of a dataset is absent on R2 (first run), it fetches all 30 days for it.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DATA_PATHS,
  type CapacityFile,
  type DataFile,
  type FlowsFile,
  type GenerationFile,
  type StatusFile,
} from "@powerstation/schema";
import { iso, statusFile } from "../src/build/files";
import {
  cutFlows,
  cutGeneration,
  mergeCapacity,
  mergeFlows,
  mergeGeneration,
  parseExisting,
} from "../src/build/merge";
import { validateAll, writeFiles } from "../src/build/output";
import { mergeStatus } from "../src/build/status-merge";
import { runBackfill, type Dataset } from "../src/build/run";
import { Warnings } from "../src/build/warnings";
import { EntsoeClient } from "../src/entsoe/client";
import { loadDotEnv, requireSecrets } from "../src/entsoe/env";
import { HOUR_MS } from "../src/entsoe/parse";
import { downloadFile, readR2Config } from "../src/r2";
import { buildZonesFile, neighbourPairs, readBorders, readCentroids } from "../src/zones";

const DAY_MS = 24 * HOUR_MS;
const log = (m: string) => console.log(m);

async function main(): Promise<void> {
  loadDotEnv();
  const { values: args } = parseArgs({
    options: {
      now: { type: "string" },
      "recent-hours": { type: "string", default: "48" },
      "include-restricted": { type: "boolean", default: false },
      out: { type: "string" },
    },
  });
  requireSecrets([
    "ENTSOE_TOKEN",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ]);
  const recentHours = Number(args["recent-hours"]);
  if (!Number.isInteger(recentHours) || recentHours < 1 || recentHours > 24 * 30) {
    throw new Error("--recent-hours must be a whole number from 1 to 720");
  }
  const nowInput = args.now ? Date.parse(args.now) : Date.now();
  if (Number.isNaN(nowInput)) throw new Error("--now is not a valid date");
  const nowMs = Math.floor(nowInput / HOUR_MS) * HOUR_MS;
  const includeRestricted = args["include-restricted"] === true;
  const r2 = readR2Config();
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(
    process.env["INIT_CWD"] ?? process.cwd(),
    args.out ?? join(here, "..", "out", "run"),
  );
  const generatedAt = iso(Math.floor(Date.now() / 1000) * 1000);

  const borders = readBorders();
  const zones = buildZonesFile(generatedAt, borders, readCentroids());
  const pairs = neighbourPairs(borders);

  // Existing rolling files on R2. A missing or unusable file means "fetch all 30 days".
  const oldFlows = parseExisting<FlowsFile>(
    await downloadFile(r2, DATA_PATHS.flows30d),
    "flows",
    DATA_PATHS.flows30d,
    log,
  );
  const oldCapacity = parseExisting<CapacityFile>(
    await downloadFile(r2, DATA_PATHS.capacity30d),
    "capacity",
    DATA_PATHS.capacity30d,
    log,
  );
  const oldGeneration = includeRestricted
    ? parseExisting<GenerationFile>(
        await downloadFile(r2, DATA_PATHS.generation30d),
        "generation",
        DATA_PATHS.generation30d,
        log,
      )
    : null;

  const wanted: [Dataset, unknown][] = [
    ["flows", oldFlows],
    ["capacity", oldCapacity],
    ...(includeRestricted ? ([["generation", oldGeneration]] as [Dataset, unknown][]) : []),
  ];
  const recent = wanted.filter(([, old]) => old !== null).map(([d]) => d);
  const full = wanted.filter(([, old]) => old === null).map(([d]) => d);
  if (full.length > 0) log(`No usable 30-day file for: ${full.join(", ")}. Fetching 30 days.`);

  const client = new EntsoeClient({ token: process.env["ENTSOE_TOKEN"]!, log });
  const base = { client, zones, pairs, nowMs, includeRestricted, generatedAt, log };
  // The forecasts are always fresh, so they come with the recent run.
  const recentRun = await runBackfill({
    ...base,
    days: 30,
    hours: recentHours,
    only: [...recent, "forecasts"],
  });
  const fullRun =
    full.length > 0 ? await runBackfill({ ...base, days: 30, only: full }) : undefined;
  const warnings = new Warnings();
  warnings.addFrom(recentRun.warnings);
  if (fullRun) warnings.addFrom(fullRun.warnings);
  const fresh = (path: string) => (fullRun?.files[path] ?? recentRun.files[path]) as DataFile;

  const ctx = { startMs: nowMs - 30 * DAY_MS, nowMs, zones, log };
  const start7 = nowMs - 7 * DAY_MS;
  const files: Record<string, DataFile> = {};
  files[DATA_PATHS.zones] = zones;
  const flows30 = mergeFlows(oldFlows, fresh(DATA_PATHS.flows30d) as FlowsFile, ctx);
  files[DATA_PATHS.flows7d] = cutFlows(flows30, start7);
  files[DATA_PATHS.flows30d] = flows30;
  files[DATA_PATHS.capacity30d] = mergeCapacity(
    oldCapacity,
    fresh(DATA_PATHS.capacity30d) as CapacityFile,
    ctx,
  );
  files[DATA_PATHS.forecasts24h] = recentRun.files[DATA_PATHS.forecasts24h]!;
  if (includeRestricted) {
    const gen30 = mergeGeneration(
      oldGeneration,
      fresh(DATA_PATHS.generation30d) as GenerationFile,
      ctx,
    );
    files[DATA_PATHS.generation7d] = cutGeneration(gen30, start7);
    files[DATA_PATHS.generation30d] = gen30;
  }
  // Keep entries of files this job does not write (e.g. data centers, monthly job).
  const oldStatus = parseExisting<StatusFile>(
    await downloadFile(r2, DATA_PATHS.status),
    "status",
    DATA_PATHS.status,
    log,
  );
  files[DATA_PATHS.status] = mergeStatus(statusFile(files, generatedAt, warnings), oldStatus);

  const errors = validateAll(files, zones);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    throw new Error("Validation failed. No files were written.");
  }

  // Clear old output first, so a file from an earlier run is never uploaded by mistake.
  rmSync(join(outDir, DATA_PATHS.status.split("/")[0]!), { recursive: true, force: true });
  writeFiles(files, outDir, log);
  const warningList = warnings.list();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "warnings.json"),
    JSON.stringify({ generated_at: generatedAt, now: iso(nowMs), warnings: warningList }, null, 2) +
      "\n",
  );
  log(`Files written to ${outDir} (${client.requestCount} ENTSO-E requests).`);
  if (warningList.length > 0) {
    log(`\n${warningList.length} warning(s):`);
    for (const w of warningList) log(`  - ${w.message}${w.count > 1 ? ` (x${w.count})` : ""}`);
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
