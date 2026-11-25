import type { EmissionFactorsFile } from "@powerstation/schema";
import { AnimatedNumber, DataStateBadge, HOUSEHOLD_SOURCE, formatPower } from "@powerstation/ui";
import type { CalcResult } from "../calc/types";
import {
  directionLabel,
  formatInt,
  formatShare,
  formatUtc,
  fuelLabel,
  homesInfo,
  hours,
} from "../format";
import { sourceLabel } from "../state/summary";
import { CarbonChart } from "./CarbonChart";

export interface ResultColumnProps {
  heading: string;
  /** Country used for the homes comparison. */
  countryCode: string;
  countryName: string;
  result: CalcResult | null;
  /** The emission-factors file, or undefined when it could not be loaded. */
  emissionFactors: EmissionFactorsFile | undefined;
  /** True when any loaded file is mock data. */
  mock: boolean;
}

function Block(props: { title: string; method: string; children: preact.ComponentChildren }) {
  return (
    <section class="block modelled">
      <header class="block-head">
        <h4>{props.title}</h4>
        <DataStateBadge state="modelled" />
      </header>
      {props.children}
      <p class="method">Method: {props.method}</p>
    </section>
  );
}

export function ResultColumn(props: ResultColumnProps) {
  const { heading, countryCode, countryName, result: r, emissionFactors, mock } = props;
  if (!r) {
    return (
      <article class="column">
        <h3>{heading}</h3>
        <p class="error">This grid zone has no generation data in the loaded files.</p>
      </article>
    );
  }
  const pressure = r.pressure;
  const homes = homesInfo(r.sizeMw, countryCode, countryName);
  return (
    <article class="column" aria-label={heading}>
      <h3>{heading}</h3>
      <p class="size-line">
        A <strong>{formatPower(r.sizeMw)}</strong> data center would use {homes.text}.
      </p>
      <p class="hint">
        {homes.isFallback
          ? `No household figure for ${countryName}: this uses the average EU household. `
          : ""}
        {HOUSEHOLD_SOURCE.attribution}
      </p>
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
              Average load {formatPower(r.load.meanMw)}. Peak load {formatPower(r.load.maxMw)}. The
              data center would be {formatShare(r.load.shareOfMax)} of the peak.
            </p>
          </Block>

          <Block
            title="Hours that need imports"
            method="load plus data center minus the zone's own generation. A positive result means imports. Pressure on interconnectors: (net imports + data center) divided by planned import capacity."
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
            <PressureNote pressure={pressure} />
          </Block>

          <Block
            title="Carbon intensity"
            method="life-cycle emission factors weighted by output, for fuels that have a factor. Imports are not included."
          >
            <CarbonNote carbon={r.carbon} file={emissionFactors} />
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
                : `${r.datacenters.withKnownPower} with known power, ${formatPower(r.datacenters.knownPowerMw)} in total. ${r.datacenters.unknownPower} with unknown power.`}
              {mock && r.datacenters.records.length > 0 ? " These data centers are fictional." : ""}
            </p>
            {r.datacenters.records.length > 0 ? (
              <ul class="plain-list">
                {r.datacenters.records.map((d) => (
                  <li key={d.id}>
                    {d.name}: {d.power_mw === null ? "power unknown" : formatPower(d.power_mw)} (
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

function PressureNote(props: { pressure: CalcResult["pressure"] }) {
  const { pressure } = props;
  if (!pressure) return <p class="hint">Interconnector capacity data is not available.</p>;
  if (!pressure.available) {
    return pressure.missingDirections.length === 0 ? (
      <p class="hint">
        Interconnector pressure is not calculated: this zone has no physical borders in the data.
      </p>
    ) : (
      <p class="hint">
        Interconnector pressure is not calculated. Capacity is not published for{" "}
        {pressure.missingDirections.map(directionLabel).join(", ")}. Some borders use flow-based
        market coupling, which publishes no single capacity figure.
      </p>
    );
  }
  return (
    <p>
      Interconnectors (worst case: all extra load is imported): above{" "}
      {Math.round(pressure.threshold * 100)}% of capacity in {hours(pressure.hoursAboveThreshold)}
      {pressure.maxPressure !== null ? `, at most ${formatShare(pressure.maxPressure)}` : ""}.{" "}
      {pressure.meanCapacityMw !== null
        ? `Planned import capacity: about ${formatPower(pressure.meanCapacityMw)} on average. `
        : ""}
      {pressure.hoursLeftOut > 0
        ? `${hours(pressure.hoursLeftOut)} left out here: a flow or capacity value is missing.`
        : ""}{" "}
      <DataStateBadge state="planned" label="Planned capacity" />
    </p>
  );
}

function CarbonNote(props: {
  carbon: CalcResult["carbon"];
  file: EmissionFactorsFile | undefined;
}) {
  const { carbon, file } = props;
  if (!carbon || !file) return <p class="hint">Carbon intensity data is not available.</p>;
  if (carbon.mean === null || carbon.min === null || carbon.max === null) {
    return (
      <p class="hint">No hour has generation with an emission factor, so there is no result.</p>
    );
  }
  const sources = file.sources.map((s) => `${s.publisher}, ${s.year}`).join("; ");
  const names = carbon.noFactor.fuels.map((f) => fuelLabel(f.fuel).toLowerCase()).join(", ");
  return (
    <>
      <p class="big">
        <AnimatedNumber value={carbon.mean} format={(n) => formatInt(n)} />{" "}
        <span class="big-label">{file.unit} on average</span>
      </p>
      <p>
        Lowest {formatInt(carbon.min)}, highest {formatInt(carbon.max)} {file.unit}. Life-cycle
        factors from {sources}.{" "}
        {carbon.excludedHours > 0
          ? `${hours(carbon.excludedHours)} left out: no generation with an emission factor.`
          : ""}
      </p>
      {carbon.noFactor.fuels.length > 0 ? (
        <p>
          No emission factor: {names}. They are {formatShare(carbon.noFactor.share)} of generation
          and are left out of this average.
        </p>
      ) : null}
      {carbon.proxyFuels.length > 0 ? (
        <ul class="plain-list hint">
          {carbon.proxyFuels.map((f) => (
            <li key={f.fuel}>
              {fuelLabel(f.fuel)} (proxy, {formatInt(f.value)} {file.unit}): {f.note}
            </li>
          ))}
        </ul>
      ) : null}
      <CarbonChart hourly={carbon.hourly} />
    </>
  );
}
