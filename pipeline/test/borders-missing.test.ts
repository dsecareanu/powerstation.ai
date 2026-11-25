// Before the first "Discover borders" run, borders.json is absent. The scripts
// must then stop with a message that names the workflow.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readBorders } from "../src/zones";

const bordersFile = join(import.meta.dirname, "..", "reference", "borders.json");

test(
  "a missing borders.json gives a clear message",
  { skip: existsSync(bordersFile) ? "borders.json exists" : false },
  () => {
    assert.throws(() => readBorders(), /Discover borders.*Run workflow/);
  },
);
