// Generates src/generated.ts from the JSON Schema files in json/.
// Usage: tsx scripts/generate-types.ts [--check]
// --check fails if src/generated.ts is not up to date (used in CI).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonDir = join(root, "json");
const outFile = join(root, "src", "generated.ts");
const DATASETS = ["status", "zones", "flows", "generation", "forecasts", "datacenters"];

// One root schema that references every file schema, so shared definitions
// are emitted once.
const rootSchema = {
  title: "AllDataFiles",
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(DATASETS.map((name) => [name, { $ref: `${name}.schema.json` }])),
} as JSONSchema;

const banner = `/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: schema/json/*.schema.json. Regenerate with: pnpm schema:types
 */`;

const ts = await compile(rootSchema, "AllDataFiles", {
  cwd: jsonDir,
  bannerComment: banner,
  additionalProperties: false,
  unreachableDefinitions: false,
  style: { singleQuote: false, printWidth: 100 },
});

if (process.argv.includes("--check")) {
  const current = readFileSync(outFile, "utf8");
  if (current !== ts) {
    console.error("src/generated.ts is out of date. Run: pnpm schema:types");
    process.exit(1);
  }
  console.log("src/generated.ts is up to date.");
} else {
  writeFileSync(outFile, ts);
  console.log(`Wrote ${outFile}`);
}
// Keep the schema files and DATASETS in sync.
for (const name of DATASETS) readFileSync(join(jsonDir, `${name}.schema.json`));
