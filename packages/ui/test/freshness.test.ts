import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { StatusFile } from "@powerstation/schema";
import { getFreshness } from "../src/freshness";

const status = JSON.parse(
  readFileSync(new URL("../../../fixtures/v1/meta/status.json", import.meta.url), "utf8"),
) as StatusFile;

test("fresh within 2 hours of the fixture time", () => {
  const f = getFreshness(status, { now: new Date("2026-11-25T13:30:00Z") });
  assert.equal(f.delayed, false);
  assert.equal(f.newestMeasuredAt, "2026-11-25T12:00:00Z");
  assert.equal(f.ageHours, 1.5);
});

test("delayed after 2 hours", () => {
  const f = getFreshness(status, { now: new Date("2026-11-25T14:00:01Z") });
  assert.equal(f.delayed, true);
});

test("uses the stalest of the checked files", () => {
  const s: StatusFile = {
    ...status,
    files: [
      {
        path: "a",
        dataset: "flows",
        updated_at: "2026-11-25T12:00:00Z",
        newest_measured_at: "2026-11-25T12:00:00Z",
        ok: true,
      },
      {
        path: "b",
        dataset: "generation",
        updated_at: "2026-11-25T12:00:00Z",
        newest_measured_at: "2026-11-25T08:00:00Z",
        ok: false,
      },
      {
        path: "c",
        dataset: "forecasts",
        updated_at: "2026-11-25T12:00:00Z",
        newest_measured_at: null,
        ok: true,
      },
    ],
  };
  const now = new Date("2026-11-25T12:30:00Z");
  assert.equal(getFreshness(s, { now }).delayed, true);
  assert.equal(getFreshness(s, { now }).newestMeasuredAt, "2026-11-25T08:00:00Z");
  assert.equal(getFreshness(s, { now, paths: ["a", "c"] }).delayed, false);
});

test("no measured data counts as delayed", () => {
  const f = getFreshness(status, { paths: ["v1/forecasts/next-24h.json"] });
  assert.deepEqual(f, { delayed: true, newestMeasuredAt: null, ageHours: null });
});
