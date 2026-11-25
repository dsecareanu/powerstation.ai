// Monthly job: builds v1/datacenters/datacenters.json from Epoch AI and writes
// it, with the current zones.json and an updated status.json, to <out>/v1/...
// It does not upload (scripts/upload.ts does).
// Usage: tsx scripts/datacenters.ts [--out <dir>]
// Needs the R2 settings (read access): it reads zones.json and status.json from R2,
// so the hourly job must have run once.
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DATA_PATHS, type DataFile, type StatusFile, type ZonesFile } from "@powerstation/schema";
import { iso } from "../src/build/files";
import { parseExisting } from "../src/build/merge";
import { validateAll, writeFiles } from "../src/build/output";
import { mergeStatus } from "../src/build/status-merge";
import { buildDatacenters, EPOCH_CSV_URL, parseCsv, type ZoneShapes } from "../src/datacenters";
import { loadDotEnv, requireSecrets } from "../src/entsoe/env";
import { downloadFile, readR2Config } from "../src/r2";

const log = (m: string) => console.log(m);
const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  loadDotEnv();
  const { values: args } = parseArgs({ options: { out: { type: "string" } } });
  requireSecrets(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]);
  const r2 = readR2Config();
  const outDir = resolve(
    process.env["INIT_CWD"] ?? process.cwd(),
    args.out ?? join(here, "..", "out", "monthly"),
  );
  const runAt = new Date();
  runAt.setMilliseconds(0);
  const generatedAt = iso(runAt.getTime());

  const zones = parseExisting<ZonesFile>(
    await downloadFile(r2, DATA_PATHS.zones),
    "zones",
    DATA_PATHS.zones,
    log,
  );
  if (!zones)
    throw new Error(`${DATA_PATHS.zones} is missing or invalid on R2. Run the hourly job first.`);
  const oldStatus = parseExisting<StatusFile>(
    await downloadFile(r2, DATA_PATHS.status),
    "status",
    DATA_PATHS.status,
    log,
  );

  log(`Downloading ${EPOCH_CSV_URL}`);
  const res = await fetch(EPOCH_CSV_URL);
  if (!res.ok) throw new Error(`Epoch AI download failed: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  if (rows.length === 0 || !("latitude" in rows[0]!) || !("Power Capacity (MW)" in rows[0]!)) {
    throw new Error("Epoch AI CSV has no rows or its columns changed. Check the source.");
  }
  const shapes = (
    JSON.parse(readFileSync(join(here, "..", "reference", "zone-shapes.json"), "utf8")) as {
      shapes: ZoneShapes;
    }
  ).shapes;
  const { file, dropped } = buildDatacenters(
    rows,
    zones,
    generatedAt,
    generatedAt.slice(0, 10),
    shapes,
  );
  log(`${file.datacenters.length} data center(s) kept from ${rows.length} rows.`);
  for (const [why, n] of Object.entries(dropped)) log(`  ${why}: ${n}`);
  if (file.datacenters.length === 0) throw new Error("No data centers kept. Not writing files.");

  const fresh: StatusFile = {
    schema_version: file.schema_version,
    dataset: "status",
    generated_at: generatedAt,
    mock: false,
    source: "powerstation.ai pipeline",
    source_url: "https://github.com/dsecareanu/powerstation.ai",
    license: "AGPL-3.0-only",
    attribution: "Update status of the powerstation.ai data files.",
    files: [
      {
        path: DATA_PATHS.datacenters,
        dataset: "datacenters",
        updated_at: generatedAt,
        newest_measured_at: null,
        ok: true,
      },
    ],
    sources: [
      {
        id: "epoch-ai",
        name: "Epoch AI, AI supercomputers",
        last_success_at: generatedAt,
        last_attempt_at: generatedAt,
        ok: true,
      },
    ],
  };
  const files: Record<string, DataFile> = {
    [DATA_PATHS.zones]: zones,
    [DATA_PATHS.datacenters]: file,
    [DATA_PATHS.status]: mergeStatus(fresh, oldStatus),
  };
  const errors = validateAll(files, zones);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    throw new Error("Validation failed. No files were written.");
  }
  rmSync(join(outDir, "v1"), { recursive: true, force: true });
  writeFiles(files, outDir, log);
  log(`Files written to ${outDir}.`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
