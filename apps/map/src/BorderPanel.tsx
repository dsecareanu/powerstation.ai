// Planned vs measured for one border: the day-ahead planned trade next to the measured flow.
import type { DataState } from "@powerstation/schema";
import { pointAt, toMs } from "./data/series";
import { dayTicks, formatDay, formatHour } from "./format";
import { type Model, pairKey } from "./model";
import { DataStateBadge, formatPower } from "./standins/ui"; // TODO(D)

interface Props {
  model: Model;
  pairKey: string | null;
  hour: number;
  onSelectPair: (key: string) => void;
  onHour: (ms: number) => void;
}

const CW = 600;
const CH = 260;
const PAD = { l: 60, r: 8, t: 10, b: 24 };

export function BorderPanel(props: Props) {
  const { model, hour } = props;
  const pair = model.pairs.find((p) => pairKey(p) === props.pairKey);
  const name = (id: string) => model.index.byId.get(id)!.name;

  const picker = (
    <label class="panel__picker">
      Border{" "}
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

  const hours = model.hours;
  const t0 = hours[0]!;
  const t1 = hours[hours.length - 1]!;
  const phys = pair.physical?.series;
  const sched = pair.scheduled?.series;
  const vals = [...(phys?.values ?? []), ...(sched?.values ?? [])].filter(
    (v): v is number => v !== null,
  );
  const max = Math.max(1, ...vals.map(Math.abs));
  const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0)) * (CW - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((max - v) / (2 * max)) * (CH - PAD.t - PAD.b);

  /** SVG path of the hours in one state; gaps elsewhere. */
  const line = (s: typeof phys, want: DataState, until?: number) => {
    if (!s) return "";
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      const t = toMs(s.start) + i * 3_600_000;
      if (
        t < t0 ||
        t > t1 ||
        (until !== undefined && t >= until) ||
        v === null ||
        s.states[i] !== want
      )
        return void (pen = false);
      d += `${pen ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const a = phys ? pointAt(phys, hour) : null;
  const s = sched ? pointAt(sched, hour) : null;
  const diff = a?.value != null && s?.value != null ? a.value - s.value : null;
  const days = dayTicks(hours);

  return (
    <section class="panel" aria-label="Planned trade compared with measured flow">
      {picker}
      <h2 class="panel__title">Planned vs measured</h2>
      <p class="panel__note">
        Each day, traders plan how much power crosses each border the next day. The grid does not
        always follow the plan. Above zero: power flows from {name(pair.from)} to {name(pair.to)}.
        Below zero: the other way.
      </p>
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        class="chart"
        role="img"
        aria-label={`Chart of planned trade and measured flow between ${name(pair.from)} and ${name(pair.to)}.`}
        onClick={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const ms =
            t0 +
            (((e.clientX - r.left) * (CW / r.width) - PAD.l) / (CW - PAD.l - PAD.r)) * (t1 - t0);
          props.onHour(ms);
        }}
      >
        <line x1={PAD.l} x2={CW - PAD.r} y1={y(0)} y2={y(0)} class="chart__zero" />
        <text x={PAD.l - 4} y={y(max) + 4} text-anchor="end" class="chart__axis">
          {formatPower(max)}
        </text>
        <text x={PAD.l - 4} y={y(-max)} text-anchor="end" class="chart__axis">
          −{formatPower(max)}
        </text>
        {days.map((d) => (
          <text key={d} x={x(d)} y={CH - 6} class="chart__axis" text-anchor="middle">
            {formatDay(d)}
          </text>
        ))}
        <rect
          x={x(model.measuredEnd)}
          y={PAD.t}
          width={Math.max(0, x(t1) - x(model.measuredEnd))}
          height={CH - PAD.t - PAD.b}
          class="chart__future"
        />
        <path d={line(sched, "planned")} class="chart__planned" />
        <path d={line(phys, "measured", model.measuredEnd)} class="chart__measured" />
        <path d={line(phys, "modelled", model.measuredEnd)} class="chart__modelled" />
        <line x1={x(hour)} x2={x(hour)} y1={PAD.t} y2={CH - PAD.b} class="chart__cursor" />
      </svg>
      <ul class="chart__key">
        <li>
          <span class="key-line key-line--measured" aria-hidden="true" /> Measured flow
        </li>
        <li>
          <span class="key-line key-line--planned" aria-hidden="true" /> Planned trade
        </li>
        <li>
          <span class="key-line key-line--modelled" aria-hidden="true" /> Modelled
          {phys?.method ? ` (${phys.method})` : ""}
        </li>
        <li>Gaps: no data. Shaded: ahead of measurements.</li>
      </ul>
      <p class="panel__time">{formatHour(hour)}</p>
      <dl class="facts">
        <div class="fact">
          <dt>Measured</dt>
          <dd>
            {hour >= model.measuredEnd ? (
              "Not measured yet"
            ) : (
              <>
                {a?.value == null ? "–" : signed(a.value)}{" "}
                {a ? <DataStateBadge state={a.state} method={a.method} /> : null}
              </>
            )}
          </dd>
        </div>
        <div class="fact">
          <dt>Planned</dt>
          <dd>
            {s?.value == null ? "–" : signed(s.value)}{" "}
            {s ? (
              <DataStateBadge
                state={s.state}
                label={s.state === "planned" ? "Planned trade" : undefined}
              />
            ) : null}
          </dd>
        </div>
        <div class="fact">
          <dt>Difference</dt>
          <dd>{diff === null ? "–" : signed(diff)}</dd>
        </div>
      </dl>
    </section>
  );
}

const signed = (v: number) => `${v < 0 ? "−" : ""}${formatPower(Math.abs(v))}`;
