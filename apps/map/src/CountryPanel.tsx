// Country panel: generation mix, load, net imports/exports at the selected hour.
import { FUEL_TYPES } from "@powerstation/schema";
import { Chart } from "./Chart";
import { generationAt } from "./data/metrics";
import { MISSING, type Point, toIso } from "./data/series";
import { FUEL_LABELS, formatHour, formatPercent } from "./format";
import { type Model, netPhysicalAt } from "./model";
import { nodeFromSelect } from "./selection";
import {
  DataStateBadge,
  describePowerInHomes,
  formatPower,
  fuelColorVar,
  type HomesTextOptions,
} from "@powerstation/ui";

interface Props {
  model: Model;
  nodeId: string | null;
  hour: number;
  onSelectNode: (id: string | null) => void;
  onHour: (ms: number) => void;
}

export function CountryPanel(props: Props) {
  const { model, nodeId, hour } = props;
  const node = nodeId ? model.index.byId.get(nodeId) : undefined;

  const picker = (
    <label class="panel__picker">
      <span class="panel__label">Country</span>
      <select
        value={nodeId ?? ""}
        onChange={(e) => props.onSelectNode(nodeFromSelect((e.target as HTMLSelectElement).value))}
      >
        <option value="">Choose a country</option>
        {model.index.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (!node) {
    return (
      <section class="panel" aria-label="Country details">
        {picker}
        <p class="panel__lead">What one country uses, makes and trades at the selected hour.</p>
        <p class="panel__hint">Tap a country on the map, or choose one here.</p>
      </section>
    );
  }

  const gen = generationAt(model.gen, node.id, hour);
  // Net position from measured physical flows only (open data); planned trade is not used here.
  const net = netPhysicalAt(model, node.id, hour);
  const netPoints = model.hours.map((h) => netPhysicalAt(model, node.id, h));
  const netSeries = {
    start: toIso(model.hours[0]!),
    resolution: "PT1H" as const,
    unit: "MW" as const,
    values: netPoints.map((p) => p.value),
    states: netPoints.map((p) => p.state),
  };
  const future = hour >= model.measuredEnd;
  // One country: its own household figure. Shared zone (DE-LU): no single country, so EU homes.
  const homes: HomesTextOptions =
    node.countries.length === 1 ? { countryCode: node.countries[0], countryName: node.name } : {};
  const fuels = gen
    ? FUEL_TYPES.filter((f) => gen.byFuel[f]).map((f) => ({ fuel: f, p: gen.byFuel[f]! }))
    : [];
  const sorted = [...fuels].sort((a, b) => (b.p.value ?? -Infinity) - (a.p.value ?? -Infinity));
  const total = gen?.total.value ?? null;
  const share = gen?.renewableShare ?? MISSING;

  return (
    <section class="panel" aria-label={`${node.name} details`}>
      {picker}
      <h2 class="panel__title">{node.name}</h2>
      <p class="panel__lead">What one country uses, makes and trades at the selected hour.</p>
      {node.countries.length > 1 ? (
        <p class="panel__note">
          These countries share one bidding zone ({node.zones.join(", ")}), so the data covers them
          together.
        </p>
      ) : node.zones.length > 1 ? (
        <p class="panel__note">
          Sum of {node.zones.length} bidding zones. Flows between them are not shown.
        </p>
      ) : null}
      <p class="panel__time">{formatHour(hour)}</p>

      <dl class="facts">
        <Fact
          homes={homes}
          label={
            net.value === null
              ? "Net imports / exports"
              : net.value >= 0
                ? "Net importer"
                : "Net exporter"
          }
          point={net}
        />
        <Fact label="Electricity use (load)" point={gen?.load ?? MISSING} homes={homes} />
        <Fact label="Generation" point={gen?.total ?? MISSING} homes={homes} />
        <div class="fact">
          <dt>Renewables share</dt>
          <dd>
            {share.value === null ? "–" : formatPercent(share.value)}{" "}
            <DataStateBadge state={share.state} method={share.method} />
          </dd>
        </div>
      </dl>

      <h3 class="panel__sub">Net imports and exports</h3>
      <p class="panel__note">
        The sum of the measured flows on all of its borders. Above zero: it takes in more power than
        it sends out.
      </p>
      <Chart
        model={model}
        hour={hour}
        lines={[
          { series: netSeries, state: "measured", class: "chart__measured" },
          { series: netSeries, state: "modelled", class: "chart__modelled" },
        ]}
        label={`Chart of the net imports and exports of ${node.name}, from measured flows.`}
        above="imports"
        below="exports"
        onHour={props.onHour}
      />

      {future ? (
        <p class="panel__note">
          Flows, generation and load are measured values, so they stop at the latest measured hour.
          Move the timeline back to see them.
        </p>
      ) : null}

      {sorted.length && !future ? (
        <>
          <h3 class="panel__sub">Generation mix</h3>
          <ul class="mix">
            {sorted.map(({ fuel, p }) => {
              const share = p.value !== null && total ? Math.max(0, p.value) / total : 0;
              return (
                <li key={fuel}>
                  <span class="mix__name">{FUEL_LABELS[fuel]}</span>
                  <span class="mix__bar" aria-hidden="true">
                    <span
                      style={{ width: `${share * 100}%`, background: `var(${fuelColorVar(fuel)})` }}
                    />
                  </span>
                  <span class="mix__value">
                    {p.value === null ? "–" : formatPower(p.value)}
                    {p.state !== "measured" ? (
                      <>
                        {" "}
                        <DataStateBadge state={p.state} method={p.method} />
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : !future ? (
        <>
          <h3 class="panel__sub">Generation mix</h3>
          <p>
            – <DataStateBadge state="missing" />
          </p>
        </>
      ) : null}
    </section>
  );
}

function Fact(props: { label: string; point: Point; homes: HomesTextOptions }) {
  const p = props.point;
  const homes = p.value !== null ? describePowerInHomes(Math.abs(p.value), props.homes) : "";
  return (
    <div class="fact">
      <dt>{props.label}</dt>
      <dd>
        {p.value === null ? "–" : formatPower(Math.abs(p.value))}{" "}
        <DataStateBadge state={p.state} method={p.method} />
        {homes ? <span class="fact__homes">{homes}</span> : null}
      </dd>
    </div>
  );
}
