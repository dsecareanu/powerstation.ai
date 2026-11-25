// Optional files that are not published (HTTP 404): generation and data centers.
// The page must render, show the `missing` state with a plain reason, and never invent values.
import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "preact-render-to-string";
import type {
  CapacityFile,
  DatacentersFile,
  EmissionFactorsFile,
  FlowsFile,
  GenerationFile,
} from "@powerstation/schema";
import { runZone } from "../src/App";
import { ResultColumn } from "../src/components/ResultColumn";
import { DATACENTERS_MISSING_REASON, GENERATION_MISSING_REASON } from "../src/format";
import { summariseZone } from "../src/state/summary";
import { readFixture } from "./helpers";

const flows = readFixture<FlowsFile>("flows/rolling-7d.json");
const generation = readFixture<GenerationFile>("generation/rolling-7d.json");
const capacity = readFixture<CapacityFile>("capacity/rolling-30d.json");
const emissionFactors = readFixture<EmissionFactorsFile>("meta/emission-factors.json");
const datacenters = readFixture<DatacentersFile>("datacenters/datacenters.json");

const column = (result: ReturnType<typeof runZone>) =>
  render(
    <ResultColumn
      heading="Germany-Luxembourg"
      countryCode="DE"
      countryName="Germany"
      result={result}
      emissionFactors={emissionFactors}
      mock={false}
    />,
  );

test("generation 404: load, imports, carbon and extra source are missing, never zero", () => {
  const r = runZone(
    "DE-LU",
    100,
    { generation: undefined, flows },
    {
      capacity,
      emissionFactors,
      datacenters,
    },
  );
  assert.ok(r);
  assert.equal(r.generationMissing, true);
  assert.equal(r.load, null);
  assert.equal(r.imports, null);
  assert.equal(r.carbon, null);
  assert.deepEqual(r.extraSource, []);
  // Pressure needs no generation: it uses flows and capacity over the flows window.
  assert.ok(r.pressure?.available);
  assert.ok(r.pressure.hoursCounted > 0);
  assert.ok(r.datacenters && r.datacenters.records.length > 0);

  const html = column(r);
  assert.equal(html.match(/data-state="missing"/g)?.length, 4);
  assert.equal(html.split(GENERATION_MISSING_REASON).length - 1, 4);
  assert.match(html, /No data/);
  assert.match(html, /Pressure on interconnectors/);
  assert.doesNotMatch(html, /gCO2eq\/kWh on average/);
  assert.doesNotMatch(html, /of the average load/);

  assert.match(summariseZone({ name: "DE-LU", result: r, homesText: "x" }), /no data/);
});

test("generation 404 without capacity: pressure says capacity is not available", () => {
  const r = runZone(
    "DE-LU",
    100,
    { generation: undefined, flows },
    {
      capacity: undefined,
      emissionFactors,
      datacenters,
    },
  );
  assert.ok(r);
  assert.equal(r.pressure, null);
  assert.match(column(r), /Interconnector capacity data is not available/);
});

test("datacenters 404: the list shows the missing state; other results still compute", () => {
  const r = runZone(
    "DE-LU",
    100,
    { generation, flows },
    {
      capacity,
      emissionFactors,
      datacenters: undefined,
    },
  );
  assert.ok(r);
  assert.equal(r.datacenters, null);
  assert.ok(r.load);
  const html = column(r);
  assert.match(html, /Data centers already in this zone/);
  assert.equal(html.match(/data-state="missing"/g)?.length, 1);
  assert.match(html, new RegExp(DATACENTERS_MISSING_REASON));
  assert.doesNotMatch(html, /No data centers are listed/);
});

test("generation and datacenters 404 together render", () => {
  const r = runZone(
    "DE-LU",
    100,
    { generation: undefined, flows },
    {
      capacity,
      emissionFactors,
      datacenters: undefined,
    },
  );
  const html = column(r);
  assert.equal(html.match(/data-state="missing"/g)?.length, 5);
});
