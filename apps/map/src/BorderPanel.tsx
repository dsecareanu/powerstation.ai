// "How full is this border?": the measured flow next to the day-ahead capacity offered for the
// same direction (both open ENTSO-E data). Planned trade is drawn only when it is published.
import { Chart, type ChartLine } from "./Chart";
import { formatHour, formatPercent } from "./format";
import { borderUseAt, type Model, pairKey } from "./model";
import { DataStateBadge, formatPower } from "@powerstation/ui";
import { pointAt } from "./data/series";

interface Props {
  model: Model;
  pairKey: string | null;
  hour: number;
  onSelectPair: (key: string) => void;
  onHour: (ms: number) => void;
}

export function BorderPanel(props: Props) {
  const { model, hour } = props;
  const pair = model.pairs.find((p) => pairKey(p) === props.pairKey);
  const name = (id: string) => model.index.byId.get(id)!.name;

  const picker = (
    <label class="panel__picker">
      <span class="panel__label">Border</span>
      <select
        value={props.pairKey ?? ""}
        onChange={(e) => props.onSelectPair((e.target as HTMLSelectElement).value)}
      >
        {model.pairs.map((p) => (
          <option key={pairKey(p)} value={pairKey(p)}>
            {name(p.from)} – {name(p.to)}
          </option>
        ))}
      </select>
    </label>
  );
  if (!pair) return <section class="panel">{picker}</section>;

  const phys = pair.physical?.series;
  const sched = pair.scheduled?.series;
  const capAB = model.capacity.get(`${pair.from}>${pair.to}`);
  const capBA = model.capacity.get(`${pair.to}>${pair.from}`);
  const hasPlanned = !!sched?.states.some((s) => s !== "missing");
  const hasModelled = !!phys?.states.includes("modelled");
  const hasCapacity = !!(capAB ?? capBA);

  const lines: ChartLine[] = [];
  if (capAB) lines.push({ series: capAB, state: "planned", class: "chart__capacity" });
  if (capBA) lines.push({ series: capBA, state: "planned", class: "chart__capacity", sign: -1 });
  if (sched && hasPlanned) lines.push({ series: sched, state: "planned", class: "chart__planned" });
  if (phys) {
    lines.push({
      series: phys,
      state: "measured",
      class: "chart__measured",
      until: model.measuredEnd,
    });
    lines.push({
      series: phys,
      state: "modelled",
      class: "chart__modelled",
      until: model.measuredEnd,
    });
  }

  const use = borderUseAt(model, pair, hour);
  const planned = sched && hasPlanned ? pointAt(sched, hour) : null;
  const diff =
    planned?.value != null && use.flow.value !== null ? use.flow.value - planned.value : null;
  const future = hour >= model.measuredEnd;
  const towards =
    use.flow.value !== null && use.flow.value < 0
      ? `${name(pair.to)} → ${name(pair.from)}`
      : `${name(pair.from)} → ${name(pair.to)}`;

  return (
    <section class="panel" aria-label="How full this border is">
      {picker}
      <h2 class="panel__title">How full is this border?</h2>
      <p class="panel__lead">
        How much power crosses one border, against the capacity offered for it.
      </p>
      <p class="panel__note">
        Each day, grid operators publish how much power they can let cross each border the next day
        (day-ahead capacity). The measured flow shows how much of it was used. Above zero: power
        flows from {name(pair.from)} to {name(pair.to)}. Below zero: the other way.
      </p>
      <Chart
        model={model}
        hour={hour}
        lines={lines}
        label={`Chart of measured flow and offered capacity between ${name(pair.from)} and ${name(pair.to)}.`}
        onHour={props.onHour}
      />
      <ul class="chart__key">
        <li>
          <span class="key-line key-line--measured" aria-hidden="true" /> Measured flow
        </li>
        {hasCapacity ? (
          <li>
            <span class="key-line key-line--capacity" aria-hidden="true" /> Offered capacity
            (day-ahead), each direction
          </li>
        ) : null}
        {hasPlanned ? (
          <li>
            <span class="key-line key-line--planned" aria-hidden="true" /> Planned trade
          </li>
        ) : null}
        {hasModelled ? (
          <li>
            <span class="key-line key-line--modelled" aria-hidden="true" /> Modelled
            {phys?.method ? ` (${phys.method})` : ""}
          </li>
        ) : null}
        <li>Gaps: no data. Shaded: ahead of measurements.</li>
      </ul>
      <p class="panel__time">{formatHour(hour)}</p>
      <dl class="facts">
        <div class="fact">
          <dt>Measured flow</dt>
          <dd>
            {future ? (
              "Not measured yet"
            ) : (
              <>
                {use.flow.value === null
                  ? "–"
                  : `${formatPower(Math.abs(use.flow.value))}, ${towards}`}{" "}
                <DataStateBadge state={use.flow.state} method={use.flow.method} />
              </>
            )}
          </dd>
        </div>
        <div class="fact">
          <dt>Offered capacity</dt>
          <dd>
            {use.capacity.value === null ? "–" : formatPower(use.capacity.value)}{" "}
            <DataStateBadge
              state={use.capacity.state}
              label={use.capacity.state === "planned" ? "Planned capacity" : undefined}
            />
          </dd>
        </div>
        <div class="fact">
          <dt>How full</dt>
          <dd>
            {use.share.value === null
              ? "–"
              : `${formatPercent(use.share.value)} of offered capacity`}{" "}
            <DataStateBadge state={use.share.state} method={use.share.method} />
          </dd>
        </div>
        {planned ? (
          <>
            <div class="fact">
              <dt>Planned trade</dt>
              <dd>
                {planned.value === null ? "–" : signed(planned.value)}{" "}
                <DataStateBadge
                  state={planned.state}
                  label={planned.state === "planned" ? "Planned trade" : undefined}
                />
              </dd>
            </div>
            <div class="fact">
              <dt>Measured − planned</dt>
              <dd>{diff === null ? "–" : signed(diff)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {use.share.value !== null && use.share.value > 1 ? (
        <p class="panel__note">
          The flow is above the day-ahead capacity figure. This can happen: capacity can be added
          later in the day, and power can loop through neighbouring grids.
        </p>
      ) : null}
    </section>
  );
}

const signed = (v: number) => `${v < 0 ? "−" : ""}${formatPower(Math.abs(v))}`;
