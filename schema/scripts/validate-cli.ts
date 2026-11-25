// Validates data files against the schema.
// Usage: tsx scripts/validate-cli.ts [--deploy] <file-or-folder>...
// Folders are searched for *.json files. If exactly one zones file is found,
// the other files are also checked against it.
// --deploy also fails on any file with "mock": true (use it in the deploy step).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { DataFile, ZonesFile } from "../src/index";
import { checkZoneReferences, validateDataFile } from "../src/validate";

const args = process.argv.slice(2);
const deploy = args.includes("--deploy");
const targets = args.filter((a) => a !== "--deploy");
if (targets.length === 0) {
  console.error("Usage: validate [--deploy] <file-or-folder>...");
  process.exit(2);
}

// pnpm runs package scripts in the package folder; resolve paths from where
// the user started the command.
const cwd = process.env.INIT_CWD ?? process.cwd();

function collect(path: string): string[] {
  if (statSync(path).isDirectory()) {
    return readdirSync(path)
      .sort()
      .flatMap((name) => collect(join(path, name)));
  }
  return path.endsWith(".json") ? [path] : [];
}

const files = targets.flatMap((t) => collect(resolve(cwd, t)));
if (files.length === 0) {
  console.error("No .json files found.");
  process.exit(2);
}

const valid: { path: string; data: DataFile }[] = [];
let failed = 0;

function report(path: string, errors: string[]): void {
  const shown = errors.slice(0, 20);
  console.error(`FAIL ${relative(cwd, path)}`);
  for (const e of shown) console.error(`  ${e}`);
  if (errors.length > shown.length) console.error(`  ... and ${errors.length - shown.length} more`);
  failed++;
}

for (const path of files) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    report(path, [`not valid JSON: ${(err as Error).message}`]);
    continue;
  }
  const result = validateDataFile(data);
  const errors = [...result.errors];
  if (deploy && (data as { mock?: unknown }).mock !== false) {
    errors.push(`/mock: must be false to deploy`);
  }
  if (errors.length > 0) report(path, errors);
  else valid.push({ path, data: data as DataFile });
}

const zonesFiles = valid.filter((f) => f.data.dataset === "zones");
if (zonesFiles.length === 1) {
  const zones = zonesFiles[0]!.data as ZonesFile;
  for (const f of valid) {
    const errors = checkZoneReferences(f.data, zones);
    if (errors.length > 0) report(f.path, errors);
  }
} else if (zonesFiles.length > 1) {
  console.warn("More than one zones file: zone references were not checked.");
}

const passed = files.length - failed;
console.log(`${passed} of ${files.length} file(s) valid${deploy ? " (deploy mode)" : ""}.`);
process.exit(failed > 0 ? 1 : 0);
