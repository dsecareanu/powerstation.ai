// Tests for the real emission-factor file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SCHEMA_VERSION } from "@powerstation/schema";
import { validateDataFile } from "@powerstation/schema/validate";
import { publishProblems } from "../src/build/publish-check";
import { EMISSION_FACTORS_LICENSE, emissionFactorsFile } from "../src/emission-factors";

const file = emissionFactorsFile(SCHEMA_VERSION, "2026-11-25T12:00:00Z");

test("the real emission-factor file is valid and not mock", () => {
  assert.deepEqual(validateDataFile(file).errors, []);
  assert.equal(file.mock, false);
  assert.equal(file.license, EMISSION_FACTORS_LICENSE);
  assert.deepEqual(publishProblems([{ path: "v1/meta/emission-factors.json", data: file }]), []);
});

test("oil cites SRREN; lignite is a hard-coal proxy", () => {
  assert.deepEqual(
    [file.factors.oil.value, file.factors.oil.match, file.factors.oil.source_id],
    [840, "direct", "ipcc-srren-annex-ii"],
  );
  assert.deepEqual(
    [file.factors.lignite.value, file.factors.lignite.match, file.factors.lignite.row],
    [820, "proxy", "Coal — PC"],
  );
});
