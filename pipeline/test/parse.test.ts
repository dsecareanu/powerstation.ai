import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { toHourly } from "../src/build/hourly";
import { parseDocument, type StepMap } from "../src/entsoe/parse";
import { ackXml, docXml, type PeriodSpec } from "./helpers";

const T0 = Date.UTC(2026, 0, 1, 0, 0);
const H = 3_600_000;

function steps(period: PeriodSpec, curve?: string): StepMap {
  const doc = parseDocument(docXml([{ curve, periods: [period] }]));
  return doc.series[0]!.steps;
}
const values = (m: StepMap) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s.value);

test("A01: a missing position is a missing step", () => {
  const m = steps({
    start: "2026-01-01T00:00Z",
    end: "2026-01-01T04:00Z",
    res: "PT60M",
    points: [
      [1, 10],
      [2, 20],
      [4, 40],
    ],
  });
  assert.deepEqual(toHourly(m, T0, T0 + 4 * H), [10, 20, null, 40]);
});

test("A03: a value holds until the next position; the last runs to the period end", () => {
  const m = steps(
    {
      start: "2026-01-01T00:00Z",
      end: "2026-01-01T06:00Z",
      res: "PT60M",
      points: [
        [1, 5],
        [3, 7],
        [4, 9],
      ],
    },
    "A03",
  );
  assert.deepEqual(toHourly(m, T0, T0 + 6 * H), [5, 5, 7, 9, 9, 9]);
});

test("two periods that do not touch leave a gap (missing)", () => {
  const doc = parseDocument(
    docXml([
      {
        periods: [
          {
            start: "2026-01-01T00:00Z",
            end: "2026-01-01T02:00Z",
            res: "PT60M",
            points: [
              [1, 1],
              [2, 2],
            ],
          },
          {
            start: "2026-01-01T04:00Z",
            end: "2026-01-01T06:00Z",
            res: "PT60M",
            points: [
              [1, 5],
              [2, 6],
            ],
          },
        ],
      },
    ]),
  );
  assert.deepEqual(toHourly(doc.series[0]!.steps, T0, T0 + 6 * H), [1, 2, null, null, 5, 6]);
});

test("PT15M is averaged to hours and rounded", () => {
  const m = steps({
    start: "2026-01-01T00:00Z",
    end: "2026-01-01T01:00Z",
    res: "PT15M",
    points: [
      [1, 100],
      [2, 101],
      [3, 101],
      [4, 101],
    ],
  });
  assert.deepEqual(toHourly(m, T0, T0 + H), [101]); // 100.75 rounds to 101
});

test("PT30M is averaged to hours", () => {
  const m = steps({
    start: "2026-01-01T00:00Z",
    end: "2026-01-01T02:00Z",
    res: "PT30M",
    points: [
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 50],
    ],
  });
  assert.deepEqual(toHourly(m, T0, T0 + 2 * H), [15, 40]);
});

test("one missing 15-minute step makes the whole hour missing", () => {
  const m = steps({
    start: "2026-01-01T00:00Z",
    end: "2026-01-01T02:00Z",
    res: "PT15M",
    points: [1, 2, 3, 4, 5, 6, 8].map((p) => [p, 10] as [number, number]),
  });
  assert.deepEqual(toHourly(m, T0, T0 + 2 * H), [10, null]);
});

test("hours outside the data are missing", () => {
  const m = steps({
    start: "2026-01-01T01:00Z",
    end: "2026-01-01T02:00Z",
    res: "PT60M",
    points: [[1, 3]],
  });
  assert.deepEqual(toHourly(m, T0, T0 + 3 * H), [null, 3, null]);
  assert.deepEqual(values(m), [3]);
});

test("an unsupported resolution leaves the period out, without an error", () => {
  const doc = parseDocument(
    docXml([
      {
        periods: [
          { start: "2026-01-01T00:00Z", end: "2026-01-01T01:00Z", res: "PT5M", points: [[1, 1]] },
        ],
      },
    ]),
  );
  assert.equal(doc.series[0]!.steps.size, 0);
  assert.match(doc.series[0]!.problems.join(), /unsupported resolution "PT5M"/);
});

// Saved, self-written document (test/data). It has Points without a quantity.
const saved = () =>
  parseDocument(
    readFileSync(join(import.meta.dirname, "data", "point-without-quantity.xml"), "utf8"),
  );

test("saved XML: a Point without a quantity is a missing hour, not an error", () => {
  const s = saved().series[0]!;
  assert.deepEqual(toHourly(s.steps, T0, T0 + 5 * H), [100, 110, null, null, 140]);
  assert.deepEqual(s.problems, ["2 Point(s) without a quantity left out"]);
});

test("saved XML: with A03, a value does not run on into a Point without a quantity", () => {
  const s = saved().series[1]!;
  assert.deepEqual(toHourly(s.steps, T0, T0 + 6 * H), [200, 200, null, null, 300, 300]);
  assert.deepEqual(s.problems, ["1 Point(s) without a quantity left out"]);
});

test("saved XML: unknown unit and empty series give no values and no error", () => {
  const doc = saved();
  assert.equal(doc.series[2]!.steps.size, 0);
  assert.match(doc.series[2]!.problems.join(), /unsupported unit "MWH"/);
  assert.equal(doc.series[3]!.steps.size, 0);
  assert.deepEqual(doc.series[3]!.problems, []);
});

test("a Point without a valid position is left out", () => {
  const xml = docXml([
    {
      periods: [
        {
          start: "2026-01-01T00:00Z",
          end: "2026-01-01T02:00Z",
          res: "PT60M",
          points: [
            [1, 5],
            [0, 9],
          ],
        },
      ],
    },
  ]);
  const s = parseDocument(xml).series[0]!;
  assert.deepEqual(toHourly(s.steps, T0, T0 + 2 * H), [5, null]);
  assert.deepEqual(s.problems, ["1 Point(s) without a valid position left out"]);
});

test("acknowledgement with reason 999 is an empty result", () => {
  const doc = parseDocument(ackXml("999"));
  assert.equal(doc.empty, true);
  assert.equal(doc.series.length, 0);
});

test("another acknowledgement reason throws with the reason text", () => {
  assert.throws(() => parseDocument(ackXml("400", "Bad parameter")), /400: Bad parameter/);
});

test("GL_MarketDocument roots are read too", () => {
  const doc = parseDocument(
    docXml(
      [
        {
          inBz: "10YTEST",
          psr: "B16",
          periods: [
            {
              start: "2026-01-01T00:00Z",
              end: "2026-01-01T01:00Z",
              res: "PT60M",
              points: [[1, 8]],
            },
          ],
        },
      ],
      "GL_MarketDocument",
    ),
  );
  assert.equal(doc.series[0]!.psrType, "B16");
  assert.equal(doc.series[0]!.inBiddingZone, "10YTEST");
});
