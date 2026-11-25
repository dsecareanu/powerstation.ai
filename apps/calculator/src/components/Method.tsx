import {
  DATA_DELAYED_AFTER_HOURS,
  FUEL_TYPES,
  type EmissionFactorsFile,
} from "@powerstation/schema";
import { PRESSURE_THRESHOLD } from "../calc/calculate";
import { formatInt, fuelLabel } from "../format";

export function Method(props: { emissionFactors: EmissionFactorsFile | undefined }) {
  const factors = props.emissionFactors;
  return (
    <section class="panel" aria-labelledby="method-title">
      <h2 id="method-title">How we calculate this</h2>
      <p>
        Every number on this page is <strong>modelled</strong>. It is an estimate, not a measurement
        and not a forecast.
      </p>
      <h3>Assumptions</h3>
      <ul>
        <li>
          Flat load: the data center uses the same power every hour, around the clock. The extra
          load equals its size.
        </li>
        <li>
          We use past hours only. Each hour has its own data. Hours with a missing value are left
          out of all results, and the page counts them.
        </li>
        <li>
          Hours with a modelled input value (one the pipeline filled in, with a stated method) stay
          in. The page counts them separately.
        </li>
        <li>Times are UTC. Power is the hourly average in MW.</li>
      </ul>
      <h3>Share of load</h3>
      <p>
        Data center size divided by the zone's average load, and by its peak load, over the hours
        with data. The homes comparison is size x 8,760 hours, divided by the yearly electricity use
        of an average household in that country (Eurostat, 2024). Without a figure for the country,
        we use the average EU household and say so.
      </p>
      <h3>Hours that need imports</h3>
      <p>
        The zone's own generation is the sum of all fuel types. Pumped storage is net: it can be
        negative. Import need = load + data center size - own generation. A positive value means the
        zone needs imports that hour. We also count the hours that need imports without the data
        center.
      </p>
      <h3>Interconnector pressure</h3>
      <p>
        Worst case: we assume all extra load is imported. Net physical imports are the measured
        flows on the zone's physical borders (into the zone is positive, out of it is negative).
        Import capacity is the sum of the planned day-ahead capacity, in the direction into the
        zone, over those borders. Pressure = (net imports + data center size) divided by import
        capacity, hour by hour. We flag hours above {Math.round(PRESSURE_THRESHOLD * 100)}%. An hour
        is left out of this number only if a flow or a capacity value is missing, or if the capacity
        is 0. The page counts those hours.
      </p>
      <p>
        If one of the zone's borders has no published capacity in the import direction, we do not
        calculate pressure for the zone and we list the borders. Some borders use flow-based market
        coupling, which publishes no single capacity figure. Capacity is planned, not forecast.
        Pressure itself is modelled.
      </p>
      <h3>Carbon intensity</h3>
      <p>
        Attributional and domestic only. Each hour, we weight the life-cycle emission factor of
        every running fuel by its output. Average mix of the zone's own power plants, modelled.
        Imports are not included. A fuel with no emission factor is left out of the weighting. It is
        never counted as 0. The page shows which fuels are left out and their share of generation.
        An hour with no generation that has a factor is left out and counted.
      </p>
      {factors ? (
        <>
          <p>
            Factors in {factors.unit}, life-cycle. Source:{" "}
            {factors.sources.map((src) => `${src.publisher}, ${src.year}`).join("; ")}.
          </p>
          <ul>
            {FUEL_TYPES.map((fuel) => {
              const f = factors.factors[fuel];
              return (
                <li key={fuel}>
                  <strong>{fuelLabel(fuel)}:</strong>{" "}
                  {f.value === null ? "no factor" : `${formatInt(f.value)} (${f.match})`}
                  {f.note ? `. ${f.note}` : ""}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <h3>Likely extra source</h3>
      <p>
        A fixed rule, in this order: gas, hard coal, lignite, oil, reservoir hydro, imports. In each
        hour, a fuel qualifies if it produces power that hour and if its highest output in the
        period minus its output that hour is at least the data center size. The first fuel that
        qualifies is the likely source. If none qualifies, the likely source is imports. The result
        is the share of hours for each source.
      </p>
      <h3>Data centers in the zone</h3>
      <p>
        Listed for context. We show how many have a known power figure, their total, and how many
        have an unknown power. They are not part of the load data.
      </p>
      <h3>Freshness</h3>
      <p>
        The page shows "data delayed" when the newest measured data is more than{" "}
        {DATA_DELAYED_AFTER_HOURS} hours old.
      </p>
    </section>
  );
}
