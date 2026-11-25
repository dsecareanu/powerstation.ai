import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "preact-render-to-string";
import type { FlowsFile, StatusFile } from "@powerstation/schema";
import { AttributionPanel, DataDelayedBanner, DataStateBadge } from "../src/index";

const fixture = <T,>(path: string) =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), "utf8")) as T;
const status = fixture<StatusFile>("v1/meta/status.json");
const flows = fixture<FlowsFile>("v1/flows/rolling-7d.json");

test("DataStateBadge shows a text label for every state", () => {
  assert.match(render(<DataStateBadge state="measured" />), /Measured/);
  assert.match(render(<DataStateBadge state="missing" />), /No data/);
  assert.match(render(<DataStateBadge state="planned" label="Planned trade" />), /Planned trade/);
  const modelled = render(<DataStateBadge state="modelled" method="Linear fill" />);
  assert.match(modelled, /Modelled/);
  assert.match(modelled, /Linear fill/);
  assert.match(modelled, /ps-state--modelled/);
});

test("DataDelayedBanner renders only when delayed", () => {
  assert.equal(
    render(<DataDelayedBanner status={status} now={new Date("2026-11-25T13:00:00Z")} />),
    "",
  );
  const html = render(
    <DataDelayedBanner status={status} now={new Date("2026-11-25T17:30:00Z")} timeZone="UTC" />,
  );
  assert.match(html, /role="status"/);
  assert.match(html, /Data delayed/);
  assert.match(html, /25 Nov, 12:00/);
  assert.match(html, /5 hours ago/);
});

test("AttributionPanel lists unique sources and flags demo data", () => {
  const html = render(<AttributionPanel files={[status, flows, flows]} open />);
  assert.match(html, /Data sources \(1\)/);
  assert.match(html, /Demo data/);
  assert.match(html, /spdx\.org\/licenses\/AGPL-3\.0-only\.html/);
  const real = render(
    <AttributionPanel
      files={[
        {
          source: "ENTSO-E Transparency Platform",
          source_url: "https://transparency.entsoe.eu/",
          license: "CC-BY-4.0",
          attribution: "Contains ENTSO-E data.",
          mock: false,
        },
      ]}
    />,
  );
  assert.doesNotMatch(real, /Demo data/);
  assert.match(real, /href="https:\/\/transparency\.entsoe\.eu\/"/);
});
