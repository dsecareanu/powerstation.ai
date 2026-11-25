import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeFromSelect, toggleNode } from "../src/selection";

test("map click on the selected country clears it", () => {
  assert.equal(toggleNode("FR", "FR"), null);
});

test("map click on another country selects it", () => {
  assert.equal(toggleNode("FR", "DE"), "DE");
  assert.equal(toggleNode(null, "DE"), "DE");
});

test("dropdown empty option clears the selection", () => {
  assert.equal(nodeFromSelect(""), null);
  assert.equal(nodeFromSelect("ES"), "ES");
});
