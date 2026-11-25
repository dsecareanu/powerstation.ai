import assert from "node:assert/strict";
import { test } from "node:test";
import { DATA_PATHS, type DataFile } from "@powerstation/schema";
import {
  capacityFile,
  flowsFile,
  forecastsFile,
  generationFile,
  statusFile,
  type Series,
} from "../src/build/files";
import { publishProblems, type PublishFile } from "../src/build/publish-check";
import { Warnings } from "../src/build/warnings";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 25, 12, 0);
const AT = "2026-11-25T12:17:00Z";
const s: Series = { start: T0, values: [1, 2] };

const open: PublishFile[] = [
  {
    path: DATA_PATHS.flows7d,
    data: flowsFile([{ from: "BE", to: "FR", kind: "physical", series: s }], T0, T0 + 2 * H, AT),
  },
  {
    path: DATA_PATHS.capacity30d,
    data: capacityFile([{ from: "BE", to: "FR", series: s }], T0, T0 + 2 * H, AT),
  },
  {
    path: DATA_PATHS.forecasts24h,
    data: forecastsFile([{ zone: "FR", load: s, generation: {} }], T0, T0 + 2 * H, AT),
  },
  { path: DATA_PATHS.status, data: statusFile({}, AT, new Warnings()) },
];
const scheduled: PublishFile = {
  path: DATA_PATHS.flows30d,
  data: flowsFile([{ from: "BE", to: "FR", kind: "scheduled", series: s }], T0, T0 + 2 * H, AT),
};
const generation: PublishFile = {
  path: DATA_PATHS.generation7d,
  data: generationFile([{ zone: "FR", load: s, generation: {} }], T0, T0 + 2 * H, AT),
};
const windForecast: PublishFile = {
  path: DATA_PATHS.forecasts24h,
  data: forecastsFile([{ zone: "FR", load: s, generation: { solar: s } }], T0, T0 + 2 * H, AT),
};

test("open data only passes", () => {
  assert.deepEqual(publishProblems(open, {}), []);
});

test("scheduled exchanges are refused", () => {
  const p = publishProblems([...open, scheduled], {});
  assert.equal(p.length, 1);
  assert.match(p[0]!, /scheduled/);
});

test("a generation file is refused", () => {
  assert.match(publishProblems([...open, generation], {})[0]!, /generation/);
});

test("wind or solar forecasts are refused", () => {
  assert.match(publishProblems([windForecast], {})[0]!, /wind or solar/);
});

test("ENTSOE_RESTRICTED_PUBLISH_OK=yes allows restricted content", () => {
  const all = [...open, scheduled, generation, windForecast];
  assert.equal(publishProblems(all, {}).length, 3);
  assert.deepEqual(publishProblems(all, { ENTSOE_RESTRICTED_PUBLISH_OK: "yes" }), []);
  assert.equal(publishProblems(all, { ENTSOE_RESTRICTED_PUBLISH_OK: "true" }).length, 3);
});

test("mock files are always refused", () => {
  const mock: PublishFile = {
    path: DATA_PATHS.flows7d,
    data: { ...open[0]!.data, mock: true } as DataFile,
  };
  assert.match(publishProblems([mock], {})[0]!, /mock/);
  assert.match(publishProblems([mock], { ENTSOE_RESTRICTED_PUBLISH_OK: "yes" })[0]!, /mock/);
});
