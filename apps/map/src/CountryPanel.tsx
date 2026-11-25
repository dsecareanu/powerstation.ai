// Country panel: generation mix, load, net imports/exports at the selected hour.
import { FUEL_TYPES } from "@powerstation/schema";
import { generationAt, netImportAt, type FlowAt } from "./data/metrics";
import type { Point } from "./data/series";
import { FUEL_LABELS, formatHour, formatPercent } from "./format";
import type { Model } from "./model";
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
  flows: FlowAt[];
  onSelectNode: (id: string | null) => void;
}

export function CountryPanel(props: Props) {
  const { model, nodeId, hour, flows } = props;
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
  const net = netImportAt(node.id, flows);
  const future = hour >= model.measuredEnd;
  // One country: its own household figure. Shared zone (DE-LU): no single country, so EU homes.
  const homes: HomesTextOptions =
    node.countries.length === 1 ? { countryCode: node.countries[0], countryName: node.name } : {};
  const fuels = gen
    ? FUEL_TYPES.filter((f) => gen.byFuel[f]).map((f) => ({ fuel: f, p: gen.byFuel[f]! }))
    : [];
  const sorted = [...fuels].sort((a, b) => (b.p.value ?? -Infinity) - (a.p.value ?? -Infinity));
  const total = gen?.total.value ?? null;

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
              ? "Imports / exports"
              : net.value >= 0
                ? "Net imports"
                : "Net exports"
          }
          point={net}
          stateLabel={net.state === "planned" ? "Planned trade" : undefined}
        />
        <Fact label="Electricity use (load)" point={gen?.load ?? null} homes={homes} />
        <Fact label="Generation" point={gen?.total ?? null} homes={homes} />
        {gen ? (
          <div class="fact">
            <dt>Renewables share</dt>
            <dd>
              {gen.renewableShare.value === null ? "–" : formatPercent(gen.renewableShare.value)}{" "}
              <DataStateBadge state={gen.renewableShare.state} method={gen.renewableShare.method} />
            </dd>
          </div>
        ) : null}
      </dl>

      {future ? (
        <p class="panel__note">
          Generation and load are measured values, so they stop at the latest measured hour. Move
          the timeline back to see them.
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
      ) : null}
    </section>
  );
}

function Fact(props: {
  label: string;
  point: Point | null;
  stateLabel?: string;
  homes: HomesTextOptions;
}) {
  const p = props.point;
  const homes = p?.value != null ? describePowerInHomes(Math.abs(p.value), props.homes) : "";
  return (
    <div class="fact">
      <dt>{props.label}</dt>
      <dd>
        {p?.value == null ? "–" : formatPower(Math.abs(p.value))}{" "}
        {p ? <DataStateBadge state={p.state} label={props.stateLabel} method={p.method} /> : null}
        {homes ? <span class="fact__homes">{homes}</span> : null}
      </dd>
    </div>
  );
}
