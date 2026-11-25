// Tests for the Epoch AI data-center builder. Synthetic rows only.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ZonesFile } from "@powerstation/schema";
import { checkZoneReferences, validateDataFile } from "@powerstation/schema/validate";
import { buildDatacenters, parseCsv } from "../src/datacenters";

const zones = {
  schema_version: "1.2.0",
  dataset: "zones",
  generated_at: "2026-11-25T12:00:00Z",
  mock: false,
  source: "test",
  license: "AGPL-3.0-only",
  attribution: "test",
  zones: [
    {
      id: "FR",
      name: "France",
      eic: "10YFR-RTE------C",
      countries: ["FR"],
      centroid: { lat: 46.55, lon: 2.55 },
      neighbours: ["IT-North"],
    },
    {
      id: "IT-North",
      name: "Italy North",
      eic: "10Y1001A1001A73I",
      countries: ["IT"],
      centroid: { lat: 45.38, lon: 10.19 },
      neighbours: ["FR", "IT-Centre-North"],
    },
    {
      id: "IT-Centre-North",
      name: "Italy Centre-North",
      eic: "10Y1001A1001A70O",
      countries: ["IT"],
      centroid: { lat: 43.42, lon: 11.71 },
      neighbours: ["IT-North"],
    },
  ],
  countries: [
    { code: "FR", name: "France", zones: ["FR"] },
    { code: "IT", name: "Italy", zones: ["IT-North", "IT-Centre-North"] },
  ],
} as ZonesFile;

// Boxes, not real shapes: North above 44.0 N, Centre-North below.
const shapes = {
  "IT-North": [
    [
      [6, 44],
      [14, 44],
      [14, 47],
      [6, 47],
      [6, 44],
    ],
  ] as [number, number][][],
  "IT-Centre-North": [
    [
      [9, 42.5],
      [14, 42.5],
      [14, 44],
      [9, 44],
      [9, 42.5],
    ],
  ] as [number, number][][],
};

const header =
  "Name,Status,Country,Owner,Power Capacity (MW),latitude,longitude,Superseded by,Exclude,Possible Duplicate,Decommissioned Date (if applicable)";
const csv = [
  header,
  '"Site, Paris",Existing,France,Owner A,12.345,48.85,2.35,,,,',
  "Bologna HPC,Existing,Italy,Owner B,10,44.5,11.34,,,,",
  "Florence HPC,Planned,Italy,,,43.77,11.25,,,,",
  "Old phase,Existing,France,Owner A,5,48.8,2.3,Site Paris,,,",
  "No coords,Existing,France,Owner C,4,,,,,,",
  "US site,Existing,United States,Owner D,100,40,-100,,,,",
  "Dup,Existing,France,Owner E,3,45,4,,,Yes,",
].join("\r\n");

test("parseCsv handles quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",2\r\n'), [{ a: 'x, "y"', b: "2" }]);
});

test("builds a valid data-center file and drops the right rows", () => {
  const { file, dropped } = buildDatacenters(
    parseCsv(csv),
    zones,
    "2026-11-25T12:00:00Z",
    "2026-11-25",
    shapes,
  );
  assert.deepEqual(validateDataFile(file).errors, []);
  assert.deepEqual(checkZoneReferences(file, zones), []);
  const byName = Object.fromEntries(file.datacenters.map((d) => [d.name, d]));
  assert.equal(byName["Site, Paris"]!.zone, "FR");
  assert.equal(byName["Site, Paris"]!.power_mw, 12.3);
  assert.equal(byName["Bologna HPC"]!.zone, "IT-North");
  assert.equal(byName["Florence HPC"]!.zone, "IT-Centre-North");
  assert.equal(byName["Florence HPC"]!.power_mw, null);
  assert.equal(byName["Florence HPC"]!.power_state, "missing");
  assert.equal(byName["Florence HPC"]!.status, "planned");
  assert.equal(byName["Florence HPC"]!.operator, null);
  assert.equal(file.datacenters.length, 3);
  assert.deepEqual(dropped, {
    "superseded by a later phase": 1,
    "no coordinates": 1,
    "country outside v1": 1,
    "excluded or possible duplicate in source": 1,
  });
});

test("without shapes, a split country uses the nearest label point", () => {
  const rows = parseCsv([header, "Bologna HPC,Existing,Italy,,10,44.5,11.34,,,,"].join("\n"));
  const { file, dropped } = buildDatacenters(rows, zones, "2026-11-25T12:00:00Z", "2026-11-25");
  assert.equal(file.datacenters[0]!.zone, "IT-Centre-North");
  assert.equal(dropped["zone by nearest label point (kept)"], 1);
});

test("ids stay unique for equal names", () => {
  const rows = parseCsv(
    [header, "Same,Existing,France,,1,48,2,,,,", "Same,Existing,France,,1,47,2,,,,"].join("\n"),
  );
  const { file } = buildDatacenters(rows, zones, "2026-11-25T12:00:00Z", "2026-11-25");
  assert.deepEqual(file.datacenters.map((d) => d.id).sort(), ["same", "same-2"]);
});
