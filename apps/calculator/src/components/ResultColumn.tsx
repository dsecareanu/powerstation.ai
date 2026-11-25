import type { CalcResult } from "../calc/types";
import { formatHomes, formatInt, formatMw, formatShare, formatUtc, hours } from "../format";
import { sourceLabel } from "../state/summary";
import { StateBadge } from "../ui-standins/StateBadge";
import { AnimatedNumber } from "./AnimatedNumber";
import { CarbonChart } from "./CarbonChart";

export interface ResultColumnProps {
  heading: string;
  /** Plain-English name of the country used for the homes comparison. */
  countryName: string;
  result: CalcResult | null;
  /** Homes equivalent of the size, or null when no sourced figure exists. */
  homes: number | null;
  /** True when any loaded file is mock data. */
  mock: boolean;
}

function Block(props: { title: string; method: string; children: preact.ComponentChildren }) {
  return (
    <section class="block modelled">
      <header class="block-head">
        <h4>{props.title}</h4>
        <StateBadge state="modelled" />
      </header>
      {props.children}
      <p class="method">Method: {props.method}</p>
    </section>
  );
}

export function ResultColumn(props: ResultColumnProps) {
  const { heading, countryName, result: r, homes, mock } = props;
  if (!r) {
    return (
      <article class="column">
        <h3>{heading}</h3>
        <p class="error">This grid zone has no generation data in the loaded files.</p>
      </article>
    );
  }
  const pressure = r.pressure;
  return (
    <article class="column" aria-label={heading}>
      <h3>{heading}</h3>
      <p class="size-line">
        {homes !== null ? (
          <>
            A <strong>{formatMw(r.sizeMw)}</strong> data center uses about as much electricity as{" "}
            <strong>{formatHomes(homes)}</strong> homes.
          </>
        ) : (
          <>
            Data center size: <strong>{formatMw(r.sizeMw)}</strong>.
          </>
        )}
      </p>
      {homes === null ? (
        <p class="hint">
          Home comparison hidden: we have no sourced household figure for {countryName} yet.
        </p>
      ) : null}

      {r.validHours === 0 || !r.load || !r.imports || !r.dataWindow ? (
        <p class="error">
          No hour has complete data in this period, so there is no result.{" "}
          {hours(r.hoursWithoutData)} without data.
        </p>
      ) : (
        <>
          <Block
            title="Share of the zone's load"
            method="size divided by the mean and the peak load of the zone, over hours with data."
          >
            <p class="big">
              <AnimatedNumber
                value={r.load.shareOfMean * 100}
                format={(n) => formatShare(n / 100)}
              />{" "}
              <span class="big-label">of the average load</span>
            </p>
            <p>
              Average load {formatMw(r.load.meanMw)}. Peak load {formatMw(r.load.maxMw)}. The data
              center would be {formatShare(r.load.shareOfMax)} of the peak.
            </p>
          </Block>

          <Block
            title="Hours that need imports"
            method="load plus data center minus the zone's own generation. A positive result means imports."
          >
            <p class="big">
              <AnimatedNumber
                value={r.imports.hoursWith}
                format={(n) => formatInt(Math.round(n))}
              />{" "}
              <span class="big-label">of {formatInt(r.validHours)} hours</span>
            </p>
            <p>
              Without the data center, the zone would need imports in{" "}
              {hours(r.imports.hoursWithout)}.
            </p>
            {pressure ? (
              <p>
                Interconnectors (worst case: all extra load is imported): above{" "}
                {Math.round(pressure.threshold * 100)}% of capacity in{" "}
                {hours(pressure.hoursAboveThreshold)}
                {pressure.maxPressure !== null
                  ? `, at most ${formatShare(pressure.maxPressure)}`
                  : ""}
                .{" "}
                {pressure.hoursWithoutBorderData > 0
                  ? `${hours(pressure.hoursWithoutBorderData)} left out here: a border has no data.`
                  : ""}
              </p>
            ) : (
              <p class="hint">Interconnector capacity data is not available yet.</p>
            )}
          </Block>

          <Block
            title="Carbon intensity"
            method="average mix of the zone's own power plants, weighted by output. Imports are not included."
          >
            {r.carbon &&
            r.carbon.mean !== null &&
            r.carbon.min !== null &&
            r.carbon.max !== null ? (
              <>
                <p class="big">
                  <AnimatedNumber value={r.carbon.mean} format={(n) => formatInt(n)} />{" "}
                  <span class="big-label">gCO2/kWh on average</span>
                </p>
                <p>
                  Lowest {formatInt(r.carbon.min)}, highest {formatInt(r.carbon.max)} gCO2/kWh.{" "}
                  {r.carbon.excludedHours > 0
                    ? `${hours(r.carbon.excludedHours)} left out: no emission factor.`
                    : ""}
                </p>
                <CarbonChart hourly={r.carbon.hourly} />
              </>
            ) : (
              <p class="hint">Carbon intensity data is not available yet.</p>
            )}
            <p class="hint">
              Average mix of the zone's own power plants, modelled. Imports are not included.
            </p>
          </Block>

          <Block
            title="Likely extra source"
            method="fixed merit-order rule (see How we calculate this). It is a rule, not a market simulation."
          >
            <ul class="bars">
              {r.extraSource.map((s) => (
                <li key={s.source}>
                  <span class="bar-label">
                    {sourceLabel(s.source)}: {formatShare(s.share)} ({hours(s.hours)})
                  </span>
                  <span class="bar-track" aria-hidden="true">
                    <span class="bar-fill" style={{ width: `${Math.max(2, s.share * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Block>

          <section class="block">
            <header class="block-head">
              <h4>Data centers already in this zone</h4>
            </header>
            <p>
              {r.datacenters.records.length === 0
                ? "No data centers are listed for this zone."
                : `${r.datacenters.withKnownPower} with known power, ${formatMw(r.datacenters.knownPowerMw)} in total. ${r.datacenters.unknownPower} with unknown power.`}
              {mock && r.datacenters.records.length > 0 ? " These data centers are fictional." : ""}
            </p>
            {r.datacenters.records.length > 0 ? (
              <ul class="plain-list">
                {r.datacenters.records.map((d) => (
                  <li key={d.id}>
                    {d.name}: {d.power_mw === null ? "power unknown" : formatMw(d.power_mw)} (
                    {d.status.replace("_", " ")})
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <p class="data-notes">
            Data from {formatUtc(r.dataWindow.firstValidHour)} to{" "}
            {formatUtc(r.dataWindow.lastValidHour)} (hours start at these times).
            <br />
            {hours(r.hoursWithoutData)} without data. {hours(r.modelledInputHours)} use modelled
            input data.
          </p>
        </>
      )}
    </article>
  );
}
