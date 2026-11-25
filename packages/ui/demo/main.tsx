// Usage examples for every component. Uses the committed fixtures.
import { render } from "preact";
import { useState } from "preact/hooks";
import { FUEL_TYPES, type FlowsFile, type StatusFile } from "@powerstation/schema";
import flowsJson from "../../../fixtures/v1/flows/rolling-7d.json";
import statusJson from "../../../fixtures/v1/meta/status.json";
import {
  AttributionPanel,
  DATA_STATES,
  DataDelayedBanner,
  DataStateBadge,
  describeEnergyInHomes,
  describePowerInHomes,
  formatEnergy,
  formatPower,
  fuelColorVar,
  HOUSEHOLD_ELECTRICITY,
} from "../src/index";
import "../src/styles.css";

const status = statusJson as StatusFile;
const flows = flowsJson as unknown as FlowsFile;

function Demo() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [delayed, setDelayed] = useState(true);

  const setDocTheme = (t: typeof theme) => {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };

  return (
    <main
      style={{
        maxWidth: "48rem",
        margin: "0 auto",
        padding: "var(--ps-space-4)",
        display: "grid",
        gap: "var(--ps-space-6)",
      }}
    >
      <header>
        <h1
          style={{
            font: "var(--ps-font-weight-display) var(--ps-text-display)/var(--ps-line-height-tight) var(--ps-font-sans)",
            margin: 0,
          }}
        >
          @powerstation/ui
        </h1>
        <label>
          Theme{" "}
          <select
            value={theme}
            onChange={(e) => setDocTheme(e.currentTarget.value as typeof theme)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>

      <section>
        <h2>DataStateBadge</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ps-space-2)" }}>
          {DATA_STATES.map((s) => (
            <DataStateBadge key={s} state={s} />
          ))}
          <DataStateBadge state="planned" label="Planned trade" />
          <DataStateBadge state="modelled" method="Linear fill between measured hours" />
        </div>
      </section>

      <section>
        <h2>DataDelayedBanner</h2>
        <label>
          <input
            type="checkbox"
            checked={delayed}
            onChange={(e) => setDelayed(e.currentTarget.checked)}
          />{" "}
          Pretend the time is 5 hours after the fixture time
        </label>
        <DataDelayedBanner
          status={status}
          now={new Date(delayed ? "2026-11-25T17:00:00Z" : "2026-11-25T12:30:00Z")}
        />
        {!delayed ? <p>Data is fresh: the banner renders nothing.</p> : null}
      </section>

      <section>
        <h2>AttributionPanel</h2>
        <AttributionPanel files={[status, flows]} />
      </section>

      <section>
        <h2>Units</h2>
        <ul>
          {[100, 500, 1000].map((mw) => (
            <li key={mw}>
              {formatPower(mw)}: {describePowerInHomes(mw)}
            </li>
          ))}
          <li>
            {formatEnergy(876_000)}: {describeEnergyInHomes(876_000)}
          </li>
        </ul>
        <p style={{ color: "var(--ps-color-text-muted)", fontSize: "var(--ps-text-sm)" }}>
          Source: <a href={HOUSEHOLD_ELECTRICITY.sourceUrl}>{HOUSEHOLD_ELECTRICITY.source}</a>,{" "}
          {HOUSEHOLD_ELECTRICITY.scope}: {HOUSEHOLD_ELECTRICITY.mwhPerYear} MWh per year.
        </p>
      </section>

      <section>
        <h2>Fuel colors</h2>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 1fr))",
            gap: "var(--ps-space-2)",
          }}
        >
          {FUEL_TYPES.map((f) => (
            <li key={f} style={{ display: "flex", gap: "var(--ps-space-2)", alignItems: "center" }}>
              <span
                class="ps-swatch"
                style={{ background: `var(${fuelColorVar(f)})` }}
                aria-hidden="true"
              />
              {f.replaceAll("_", " ")}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

document.body.style.cssText =
  "margin:0;background:var(--ps-color-bg);color:var(--ps-color-text);font-family:var(--ps-font-sans)";
render(<Demo />, document.getElementById("app")!);
