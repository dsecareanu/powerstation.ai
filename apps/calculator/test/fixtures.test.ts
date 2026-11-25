import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
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
  assert.ok(count >= 8);
});
