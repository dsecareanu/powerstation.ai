// Tests for mergeStatus: one job must not remove the other job's entries.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StatusFile } from "@powerstation/schema";
import { validateDataFile } from "@powerstation/schema/validate";
import { mergeStatus } from "../src/build/status-merge";

const base = {
  schema_version: "1.1.0",
  dataset: "status",
  mock: false,
  source: "test",
  license: "AGPL-3.0-only",
  attribution: "test",
} as const;
const fileEntry = (path: string, dataset: "flows" | "datacenters", at: string) => ({
  path,
  dataset,
  updated_at: at,
  newest_measured_at: null,
  ok: true,
});
const sourceEntry = (id: string, at: string) => ({
  id,
  name: id,
  last_success_at: at,
  last_attempt_at: at,
  ok: true,
});

const old: StatusFile = {
  ...base,
  generated_at: "2026-11-01T00:00:00Z",
  files: [
    fileEntry("v1/datacenters/datacenters.json", "datacenters", "2026-11-01T00:00:00Z"),
    fileEntry("v1/flows/rolling-7d.json", "flows", "2026-11-01T00:00:00Z"),
  ],
  sources: [
    sourceEntry("entsoe", "2026-11-01T00:00:00Z"),
    sourceEntry("epoch-ai", "2026-11-01T00:00:00Z"),
  ],
};
const fresh: StatusFile = {
  ...base,
  generated_at: "2026-11-25T12:00:00Z",
  files: [fileEntry("v1/flows/rolling-7d.json", "flows", "2026-11-25T12:00:00Z")],
  sources: [sourceEntry("entsoe", "2026-11-25T12:00:00Z")],
};

test("keeps entries the fresh run did not write", () => {
  const m = mergeStatus(fresh, old);
  assert.deepEqual(validateDataFile(m).errors, []);
  assert.deepEqual(
    m.files.map((f) => [f.path, f.updated_at]),
    [
      ["v1/datacenters/datacenters.json", "2026-11-01T00:00:00Z"],
      ["v1/flows/rolling-7d.json", "2026-11-25T12:00:00Z"],
    ],
  );
  assert.deepEqual(
    m.sources.map((s) => [s.id, s.last_success_at]),
    [
      ["entsoe", "2026-11-25T12:00:00Z"],
      ["epoch-ai", "2026-11-01T00:00:00Z"],
    ],
  );
  assert.equal(m.generated_at, "2026-11-25T12:00:00Z");
});

test("without an old status, the fresh one is used as it is", () => {
  assert.deepEqual(mergeStatus(fresh, null), fresh);
});
