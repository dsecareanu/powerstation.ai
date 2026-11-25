import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeEnergyInHomes,
  describePowerInHomes,
  formatCount,
  formatEnergy,
  formatPower,
  homesForPower,
} from "../src/units";

test("formatPower picks MW or GW", () => {
  assert.equal(formatPower(950), "950 MW");
  assert.equal(formatPower(1200), "1.2 GW");
  assert.equal(formatPower(1000), "1 GW");
  assert.equal(formatPower(12500), "13 GW");
  assert.equal(formatPower(0.4), "0.4 MW");
  assert.equal(formatPower(-1500), "-1.5 GW");
});

test("formatEnergy picks MWh, GWh or TWh", () => {
  assert.equal(formatEnergy(500), "500 MWh");
  assert.equal(formatEnergy(3600), "3.6 GWh");
  assert.equal(formatEnergy(2_500_000), "2.5 TWh");
});

test("homes comparison uses 3.6 MWh per year", () => {
  assert.ok(Math.abs(homesForPower(1) - 8760 / 3.6) < 1e-6);
  assert.equal(describePowerInHomes(1000), "about as much as 2.4 million homes use on average");
  assert.equal(describePowerInHomes(100), "about as much as 240,000 homes use on average");
  assert.equal(describeEnergyInHomes(3600), "about what 1,000 homes use in a year");
  assert.equal(describeEnergyInHomes(3.6), "about what 1 home uses in a year");
});

test("formatCount rounds to two significant figures", () => {
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(12_345), "12,000");
  assert.equal(formatCount(2_433_333), "2.4 million");
  assert.equal(formatCount(0), "0");
});
