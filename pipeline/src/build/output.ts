// Validates the built files and writes them to disk as compact JSON.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import type { DataFile, ZonesFile } from "@powerstation/schema";
import { checkZoneReferences, validateDataFile } from "@powerstation/schema/validate";

/** Datasets that never refer to zones. */
export const ZONE_FREE: ReadonlySet<string> = new Set(["news", "emission_factors"]);

/**
 * Returns a list of problems. An empty list means all files are valid.
 * zones = null skips the zone checks; only allowed when no file refers to zones.
 */
export function validateAll(files: Record<string, DataFile>, zones: ZonesFile | null): string[] {
  const errors: string[] = [];
  for (const [path, file] of Object.entries(files)) {
    if ((file as { mock?: unknown }).mock !== false) errors.push(`${path}: mock is not false`);
    const result = validateDataFile(file);
    if (!result.ok) {
      errors.push(...result.errors.slice(0, 20).map((e) => `${path}: ${e}`));
      continue;
    }
    if (zones) errors.push(...checkZoneReferences(file, zones).map((e) => `${path}: ${e}`));
    else if (!ZONE_FREE.has(file.dataset)) errors.push(`${path}: needs zones.json to check`);
  }
  return errors;
}

/** JSON with arrays of numbers and strings on one line, so long series stay readable. */
export function stringify(value: unknown, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) return JSON.stringify(value);
    const inner = indent + "  ";
    return `[\n${value.map((v) => inner + stringify(v, inner)).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const inner = indent + "  ";
    const entries = Object.entries(value).map(
      ([k, v]) => `${inner}${JSON.stringify(k)}: ${stringify(v, inner)}`,
    );
    return `{\n${entries.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

export interface OutputFile {
  path: string;
  text: string;
}

/** Writes each file under outDir and prints a size table. Returns the texts. */
export function writeFiles(
  files: Record<string, DataFile>,
  outDir: string,
  print: (line: string) => void,
): OutputFile[] {
  const out: OutputFile[] = [];
  for (const [path, data] of Object.entries(files)) {
    const file = join(outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    const text = stringify(data) + "\n";
    writeFileSync(file, text);
    const kb = (n: number) => (n / 1024).toFixed(1).padStart(7);
    print(`${kb(Buffer.byteLength(text))} KB raw ${kb(gzipSync(text).length)} KB gzip  ${path}`);
    out.push({ path, text });
  }
  return out;
}
