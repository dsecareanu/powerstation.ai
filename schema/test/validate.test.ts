// Checks that the validator accepts the fixtures and rejects broken files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { FlowsFile, ZonesFile } from "../src/index";
import { checkZoneReferences, validateDataFile } from "../src/validate";

const fixtures = join(import.meta.dirname, "..", "..", "fixtures", "v1");
const load = <T>(path: string): T => JSON.parse(readFileSync(join(fixtures, path), "utf8")) as T;
const flows = () => load<FlowsFile>("flows/rolling-7d.json");
const firstError = (data: unknown) => validateDataFile(data).errors.join("\n");

test("fixture flows file is valid", () => {
  assert.deepEqual(validateDataFile(flows()).errors, []);
});

test("rejects an unknown dataset", () => {
  assert.match(firstError({ dataset: "prices" }), /unknown dataset/);
});

test("rejects a null value that is not missing", () => {
  const f = flows();
  f.borders[0]!.series.values[0] = null;
  assert.match(firstError(f), /null must have state missing/);
});

test("rejects a missing state with a value", () => {
  const f = flows();
  f.borders[0]!.series.states[0] = "missing";
  assert.match(firstError(f), /null must have state missing/);
});

test("rejects arrays of different length", () => {
  const f = flows();
  f.borders[0]!.series.values.push(1);
  assert.match(firstError(f), /differ in length/);
});

test("rejects a planned state in a physical series", () => {
  const f = flows();
  const b = f.borders.find((x) => x.kind === "physical")!;
  b.series.states[0] = "planned";
  b.series.values[0] = 1;
  assert.match(firstError(f), /state planned not allowed/);
});

test("rejects modelled values without a method", () => {
  const f = flows();
  const b = f.borders.find((x) => x.kind === "physical")!;
  b.series.states[0] = "modelled";
  b.series.values[0] = 1;
  delete b.series.method;
  assert.match(firstError(f), /no method/);
});

test("rejects a border listed twice in opposite directions", () => {
  const f = flows();
  const b = f.borders[0]!;
  f.borders.push({ ...b, from_zone: b.to_zone, to_zone: b.from_zone });
  assert.match(firstError(f), /appears twice/);
});

test("rejects a non-UTC timestamp", () => {
  const f = flows();
  f.generated_at = "2026-11-25T12:00:00+01:00";
  assert.ok(!validateDataFile(f).ok);
});

test("rejects unknown fields", () => {
  const f = flows() as FlowsFile & { extra?: number };
  f.extra = 1;
  assert.ok(!validateDataFile(f).ok);
});

test("rejects one-way neighbours in zones", () => {
  const z = load<ZonesFile>("meta/zones.json");
  z.zones.find((x) => x.id === "PT")!.neighbours = [];
  assert.match(firstError(z), /neighbour PT does not list ES back/);
});

test("rejects flows between zones that are not neighbours", () => {
  const z = load<ZonesFile>("meta/zones.json");
  const f = flows();
  f.borders[0]!.to_zone = "PT";
  assert.match(checkZoneReferences(f, z).join("\n"), /not neighbours/);
});
