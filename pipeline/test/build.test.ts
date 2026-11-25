import assert from "node:assert/strict";
import { test } from "node:test";
import { capacityFile, netBorder } from "../src/build/files";
import { buildFuelSeries } from "../src/build/fuels";
import { Warnings } from "../src/build/warnings";
import { mergeSeries, parseDocument } from "../src/entsoe/parse";
import { docXml, hourlyPeriod, type SeriesSpec } from "./helpers";

const T0 = Date.UTC(2026, 0, 1, 0, 0);
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";

test("netting: both directions give A to B minus B to A", () => {
  const net = netBorder([100, null, 50], [30, 10, 80]);
  assert.deepEqual(net, { values: [70, null, -30] });
});

test("netting: one direction not published uses the other alone", () => {
  assert.deepEqual(netBorder([5, 6], null), { values: [5, 6], oneSided: "a_to_b" });
  assert.deepEqual(netBorder(null, [5, 6]), { values: [-5, -6], oneSided: "b_to_a" });
});

test("netting: no data in either direction leaves the border out", () => {
  assert.equal(netBorder(null, null), null);
});

test("a later TimeSeries wins on a conflict, and a warning is counted", () => {
  const spec = (v: number): SeriesSpec => ({ periods: [hourlyPeriod(T0, T0 + 2 * H, () => v)] });
  const doc = parseDocument(docXml([spec(1), spec(2)]));
  const warnings = new Warnings();
  const merged = mergeSeries(doc.series, warnings, "test");
  assert.equal(merged.get(T0)!.value, 2);
  assert.equal(warnings.size, 1);
});

test("capacity: a negative value throws", () => {
  assert.throws(
    () =>
      capacityFile(
        [{ from: "A", to: "B", series: { start: T0, values: [10, -1] } }],
        T0,
        T0 + 2 * H,
        "x",
      ),
    /Negative capacity/,
  );
});

test("psr mapping: sums, B10 net of pumping, unknown psr warned", () => {
  const p = (f: (i: number) => number) => hourlyPeriod(T0, T0 + 3 * H, f);
  const doc = parseDocument(
    docXml(
      [
        { inBz: "Z", psr: "B04", periods: [p(() => 100)] }, // gas
        { inBz: "Z", psr: "B03", periods: [p(() => 10)] }, // other
        { inBz: "Z", psr: "B20", periods: [p((i) => (i === 1 ? 0 : 5))] }, // other
        { inBz: "Z", psr: "B10", periods: [p(() => 60)] }, // pumped storage generation
        {
          outBz: "Z",
          psr: "B10",
          periods: [
            {
              ...p(() => 80),
              points: [
                [1, 80],
                [3, 20],
              ],
            },
          ],
        }, // pumping
        { inBz: "Z", psr: "B99", periods: [p(() => 1)] }, // unknown
        { outBz: "Z", psr: "B04", periods: [p(() => 1)] }, // ignored consumption
      ],
      "GL_MarketDocument",
    ),
  );
  const warnings = new Warnings();
  const fuels = buildFuelSeries(doc.series, T0, T0 + 3 * H, warnings, "Z");
  assert.deepEqual(fuels.gas, [100, 100, 100]);
  assert.deepEqual(fuels.other, [15, 10, 15]);
  assert.deepEqual(fuels.hydro_pumped_storage, [-20, null, 40]);
  assert.equal(fuels.nuclear, undefined); // a fuel the zone never reports is left out
  assert.equal(Object.keys(fuels).includes("B99"), false);
  const messages = warnings.list().map((w) => w.message);
  assert.ok(messages.some((m) => m.includes("B99")));
  assert.ok(messages.some((m) => m.includes("Consumption") && m.includes("B04")));
});

test("psr mapping: B10 without a consumption series uses generation only", () => {
  const doc = parseDocument(
    docXml(
      [{ inBz: "Z", psr: "B10", periods: [hourlyPeriod(T0, T0 + H, () => 60)] }],
      "GL_MarketDocument",
    ),
  );
  const fuels = buildFuelSeries(doc.series, T0, T0 + H, new Warnings(), "Z");
  assert.deepEqual(fuels.hydro_pumped_storage, [60]);
});

test("psr mapping: a null in one contributing psr makes the fuel hour missing", () => {
  const doc = parseDocument(
    docXml(
      [
        { inBz: "Z", psr: "B03", periods: [hourlyPeriod(T0, T0 + 2 * H, () => 1)] },
        {
          inBz: "Z",
          psr: "B20",
          periods: [{ start: iso(T0), end: iso(T0 + H), res: "PT60M", points: [[1, 2]] }],
        },
      ],
      "GL_MarketDocument",
    ),
  );
  const fuels = buildFuelSeries(doc.series, T0, T0 + 2 * H, new Warnings(), "Z");
  assert.deepEqual(fuels.other, [3, null]);
});
