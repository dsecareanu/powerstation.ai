import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatacentersFile, EmissionFactorsFile, StatusFile } from "@powerstation/schema";
import { HOUSEHOLD_SOURCE, uniqueSources } from "@powerstation/ui";
import { buildAttribution } from "../src/state/attribution";
import { readFixture } from "./helpers";

test("attribution lists every loaded file, each data center source, factor sources and homes", () => {
  const status = readFixture<StatusFile>("meta/status.json");
  const dc = readFixture<DatacentersFile>("datacenters/datacenters.json");
  const ef = readFixture<EmissionFactorsFile>("meta/emission-factors.json");
  const list = buildAttribution([status, ef], dc.datacenters, ef);
  const sources = uniqueSources(list);
  const text = JSON.stringify(sources);
  assert.ok(sources.some((s) => s.attribution === status.attribution));
  assert.ok(sources.some((s) => s.attribution === ef.attribution));
  for (const d of dc.datacenters) assert.ok(text.includes(d.source), d.source);
  for (const s of ef.sources) assert.ok(text.includes(s.publisher), s.publisher);
  assert.ok(sources.some((s) => s.attribution === HOUSEHOLD_SOURCE.attribution));
});

test("attribution without an emission-factors file adds no factor source", () => {
  const status = readFixture<StatusFile>("meta/status.json");
  const list = buildAttribution([status], [], undefined);
  assert.equal(list.length, 2); // the file and the household source
});
