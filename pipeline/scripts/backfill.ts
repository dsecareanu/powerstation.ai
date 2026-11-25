// Fetches ENTSO-E data for the last N days and builds the v1 data files.
// Usage: tsx scripts/backfill.ts [--now <ISO>] [--days 30] [--include-restricted]
//                                [--upload] [--out <dir>]
// Needs ENTSOE_TOKEN. With --upload it also needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY and R2_BUCKET. See pipeline/README.md.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DATA_PATHS } from "@powerstation/schema";
import { iso } from "../src/build/files";
import { runBackfill } from "../src/build/run";
import { validateAll, writeFiles } from "../src/build/output";
import { EntsoeClient } from "../src/entsoe/client";
import { loadDotEnv, requireEnv } from "../src/entsoe/env";
import { HOUR_MS } from "../src/entsoe/parse";
import { assertPublishAllowed, readR2Config, uploadFiles } from "../src/r2";
import { buildZonesFile, neighbourPairs, readBorders, readCentroids } from "../src/zones";

loadDotEnv();
const { values: args } = parseArgs({
  options: {
    now: { type: "string" },
    days: { type: "string", default: "30" },
    "include-restricted": { type: "boolean", default: false },
    upload: { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const days = Number(args.days);
if (!Number.isInteger(days) || days < 1 || days > 32) throw new Error("--days must be 1 to 32");
const nowInput = args.now ? Date.parse(args.now) : Date.now();
if (Number.isNaN(nowInput)) throw new Error("--now is not a valid date");
const nowMs = Math.floor(nowInput / HOUR_MS) * HOUR_MS;
const includeRestricted = args["include-restricted"] === true;
const upload = args.upload === true;

// Checks before any ENTSO-E request.
if (upload) assertPublishAllowed(includeRestricted);
const r2 = upload ? readR2Config() : undefined;
const token = requireEnv("ENTSOE_TOKEN");

const here = dirname(fileURLToPath(import.meta.url));
const outBase = resolve(
  process.env["INIT_CWD"] ?? process.cwd(),
  args.out ?? join(here, "..", "out"),
);
const runAt = new Date();
runAt.setMilliseconds(0);
const generatedAt = iso(runAt.getTime());
const outDir = join(outBase, generatedAt.replace(/[-:]/g, ""));

const borders = readBorders();
const zones = buildZonesFile(generatedAt, borders, readCentroids());
const pairs = neighbourPairs(borders);

const client = new EntsoeClient({ token, log: (m) => console.log(m) });
console.log(
  `Backfill: now=${iso(nowMs)} days=${days} zones=${zones.zones.length} borders=${pairs.length} ` +
    `restricted=${includeRestricted ? "included" : "excluded"} upload=${upload}`,
);
const { files, warnings } = await runBackfill({
  client,
  zones,
  pairs,
  nowMs,
  days,
  includeRestricted,
  generatedAt,
  log: (m) => console.log(m),
});

const errors = validateAll(files, zones);
if (errors.length > 0) {
  console.error("Validation failed. Nothing was uploaded:");
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const written = writeFiles(files, outDir, (line) => console.log(line));
const warningList = warnings.list();
writeFileSync(
  join(outDir, "warnings.json"),
  JSON.stringify({ generated_at: generatedAt, now: iso(nowMs), warnings: warningList }, null, 2) +
    "\n",
);
console.log(`Files written to ${outDir} (${client.requestCount} ENTSO-E requests).`);
if (warningList.length > 0) {
  console.log(`\n${warningList.length} warning(s):`);
  for (const w of warningList)
    console.log(`  - ${w.message}${w.count > 1 ? ` (x${w.count})` : ""}`);
}

if (r2) {
  // status.json goes last, so the UI never sees a status newer than its data.
  const status = DATA_PATHS.status;
  const ordered = [
    ...written.filter((f) => f.path !== status),
    ...written.filter((f) => f.path === status),
  ];
  await uploadFiles(
    ordered.map((f) => ({ key: f.path, body: f.text })),
    r2,
    undefined,
    (m) => console.log(m),
  );
  console.log("Upload done.");
}
