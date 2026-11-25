import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DATA_PATHS } from "@powerstation/schema";
import { validateDataFile } from "@powerstation/schema/validate";
import { fixtureDir, readFixture } from "./helpers";

test("all fixtures pass validateDataFile", () => {
  let count = 0;
  for (const dir of readdirSync(fixtureDir)) {
    for (const file of readdirSync(join(fixtureDir, dir))) {
      const path = `${dir}/${file}`;
      const result = validateDataFile(readFixture(path));
      assert.deepEqual(result.errors, [], path);
      count++;
    }
  }
  assert.ok(count >= 10);
});

test("the capacity and emission-factors fixtures exist and validate", () => {
  for (const [path, dataset] of [
    [DATA_PATHS.capacity30d, "capacity"],
    [DATA_PATHS.emissionFactors, "emission_factors"],
  ] as const) {
    const file = readFixture<{ dataset: string; schema_version: string }>(
      path.replace(/^v1\//, ""),
    );
    assert.equal(file.dataset, dataset);
    assert.equal(file.schema_version, "1.2.0");
    assert.deepEqual(validateDataFile(file).errors, [], path);
  }
});
