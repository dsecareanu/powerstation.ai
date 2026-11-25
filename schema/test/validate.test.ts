// Checks that the validator accepts the fixtures and rejects broken files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type {
  CapacityFile,
  EmissionFactorsFile,
  FlowsFile,
  NewsFile,
  ZonesFile,
} from "../src/index";
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

// ---------- capacity (schema 1.1.0) ----------
const capacity = () => load<CapacityFile>("capacity/rolling-30d.json");

test("fixture capacity file is valid", () => {
  assert.deepEqual(validateDataFile(capacity()).errors, []);
});

test("rejects a measured state in capacity", () => {
  const c = capacity();
  c.borders[0]!.series.states[0] = "measured";
  c.borders[0]!.series.values[0] = 1;
  assert.match(firstError(c), /state measured not allowed/);
});

test("rejects negative capacity", () => {
  const c = capacity();
  c.borders[0]!.series.states[0] = "planned";
  c.borders[0]!.series.values[0] = -5;
  assert.match(firstError(c), /is negative/);
});

test("rejects the same capacity direction twice", () => {
  const c = capacity();
  c.borders.push(structuredClone(c.borders[0]!));
  assert.match(firstError(c), /direction appears twice/);
});

test("accepts both directions of one border in capacity", () => {
  const c = capacity();
  const [a, b] = [c.borders[0]!, c.borders[1]!];
  assert.equal(a.from_zone, b.to_zone);
  assert.equal(a.to_zone, b.from_zone);
  assert.deepEqual(validateDataFile(c).errors, []);
});

test("rejects capacity between zones that are not neighbours", () => {
  const z = load<ZonesFile>("meta/zones.json");
  const c = capacity();
  c.borders[0]!.to_zone = "PT";
  assert.match(checkZoneReferences(c, z).join("\n"), /not neighbours/);
});

// ---------- emission factors (schema 1.1.0) ----------
const factors = () => load<EmissionFactorsFile>("meta/emission-factors.json");

test("fixture emission factors file is valid", () => {
  assert.deepEqual(validateDataFile(factors()).errors, []);
});

test("rejects a missing fuel type in emission factors", () => {
  const f = factors() as { factors: Partial<EmissionFactorsFile["factors"]> };
  delete f.factors.nuclear;
  assert.match(firstError(f), /must have required property 'nuclear'/);
});

test("rejects an unknown source id", () => {
  const f = factors();
  f.factors.nuclear.source_id = "nope";
  assert.match(firstError(f), /source_id nope is not in sources/);
});

test("rejects a proxy factor without a note", () => {
  const f = factors();
  delete f.factors.lignite.note;
  assert.match(firstError(f), /match proxy needs a note/);
});

test("rejects match none with a value", () => {
  const f = factors();
  f.factors.waste.value = 650;
  assert.match(firstError(f), /match none needs value/);
});

test("rejects a direct factor without a value", () => {
  const f = factors();
  f.factors.nuclear.value = null;
  assert.match(firstError(f), /match direct needs value/);
});

// ---------- news (schema 1.2.0) ----------
const news = () => load<NewsFile>("meta/news.json");

test("fixture news file is valid", () => {
  assert.deepEqual(validateDataFile(news()).errors, []);
});

test("rejects article text in a news item", () => {
  const f = news() as unknown as { items: Record<string, unknown>[] };
  f.items[0]!["summary"] = "Article text must never be stored.";
  assert.match(firstError(f), /must NOT have additional properties/);
});

test("rejects a news link that is not http(s)", () => {
  const f = news();
  f.items[0]!.url = "javascript:alert(1)";
  assert.match(firstError(f), /url/);
});

test("rejects duplicate news titles", () => {
  const f = news();
  f.items[1]!.title = f.items[0]!.title.toUpperCase();
  f.items[1]!.source = "Another publisher";
  assert.match(firstError(f), /duplicate title/);
});

test("rejects more than 2 news items from one source", () => {
  const f = news();
  for (const i of f.items) i.source = "One publisher";
  assert.match(firstError(f), /more than 2 items from One publisher/);
});

test("rejects more than 8 news items", () => {
  const f = news();
  f.items = Array.from({ length: 9 }, (_, i) => ({
    title: `Headline ${i}`,
    url: `https://example.org/${i}`,
    source: `Publisher ${i}`,
    published_at: null,
  }));
  assert.match(firstError(f), /9 items, at most 8/);
});

test("rejects news that is not newest first", () => {
  const f = news();
  [f.items[0], f.items[1]] = [f.items[1]!, f.items[0]!];
  assert.match(firstError(f), /not newest first/);
});

test("rejects a dated news item after an undated one", () => {
  const f = news();
  const undated = f.items.pop()!;
  f.items.unshift(undated);
  assert.match(firstError(f), /not newest first/);
});
