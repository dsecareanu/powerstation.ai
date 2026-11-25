import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeEnergyInHomes,
  describePowerInHomes,
  formatCount,
  formatEnergy,
  formatPower,
  HOUSEHOLD_EU,
  HOUSEHOLD_MWH_PER_YEAR,
  householdsFor,
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

test("formatPower moves up a unit when rounding reaches it", () => {
  assert.equal(formatPower(999.6), "1 GW");
  assert.equal(formatPower(999.4), "999 MW");
  assert.equal(formatPower(-999.6), "-1 GW");
  assert.equal(formatEnergy(999_999), "1 TWh");
});

test("formatEnergy picks MWh, GWh or TWh", () => {
  assert.equal(formatEnergy(500), "500 MWh");
  assert.equal(formatEnergy(3600), "3.6 GWh");
  assert.equal(formatEnergy(2_500_000), "2.5 TWh");
});

test("householdsFor returns a country value", () => {
  assert.deepEqual(householdsFor("DE"), {
    mwhPerYear: 3.176,
    year: 2024,
    area: "DE",
    isFallback: false,
  });
  assert.equal(householdsFor("ro").mwhPerYear, 1.838);
  assert.equal(Object.keys(HOUSEHOLD_MWH_PER_YEAR).length, 32);
});

test("householdsFor falls back to the EU value", () => {
  for (const code of ["CH", "", undefined, null]) {
    const h = householdsFor(code);
    assert.equal(h.isFallback, true);
    assert.equal(h.area, "EU");
    assert.equal(h.mwhPerYear, HOUSEHOLD_EU.mwhPerYear);
  }
  assert.equal(HOUSEHOLD_EU.mwhPerYear, 3.525);
});

test("Greece: Eurostat EL is stored as GR", () => {
  assert.equal(HOUSEHOLD_MWH_PER_YEAR.EL, undefined);
  assert.deepEqual(householdsFor("EL"), householdsFor("GR"));
  assert.equal(householdsFor("EL").area, "GR");
  assert.equal(householdsFor("EL").isFallback, false);
});

test("homes comparison text, country and fallback", () => {
  assert.ok(Math.abs(homesForPower(1, "DE") - 8760 / 3.176) < 1e-6);
  assert.equal(
    describePowerInHomes(1000, { countryCode: "DE", countryName: "Germany" }),
    "about as much as 2.8 million homes in Germany use on average",
  );
  assert.equal(
    describePowerInHomes(1000, { countryCode: "DE" }),
    "about as much as 2.8 million homes in this country use on average",
  );
  assert.equal(
    describePowerInHomes(1000, { countryCode: "CH", countryName: "Switzerland" }),
    "about as much as 2.5 million EU homes use on average",
  );
  assert.equal(describePowerInHomes(1000), "about as much as 2.5 million EU homes use on average");
  assert.equal(describeEnergyInHomes(3525), "about what 1,000 EU homes use in a year");
  assert.equal(describeEnergyInHomes(3.525), "about what 1 EU home uses in a year");
  assert.equal(
    describeEnergyInHomes(1838, { countryCode: "RO", countryName: "Romania" }),
    "about what 1,000 homes in Romania use in a year",
  );
});

test("tiny values never show 0 homes", () => {
  assert.equal(formatCount(0.3), "less than 1");
  assert.equal(formatCount(-0.3), "less than 1");
  assert.equal(describeEnergyInHomes(1), "less than what one EU home uses in a year");
  assert.equal(
    describePowerInHomes(0.0001, { countryCode: "DE", countryName: "Germany" }),
    "less than one home in Germany uses on average",
  );
  assert.equal(describePowerInHomes(0.0001), "less than one EU home uses on average");
  assert.doesNotMatch(describePowerInHomes(0.0001), /\b0 |less than 1/);
});

test("formatCount rounds to two significant figures", () => {
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(12_345), "12,000");
  assert.equal(formatCount(2_433_333), "2.4 million");
  assert.equal(formatCount(0), "0");
});
