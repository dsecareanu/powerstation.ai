// Small time chart over the timeline window: one path per series and data state, a zero line,
// a shaded part ahead of the measurements and a cursor at the selected hour. Click sets the hour.
import type { DataState, TimeSeries } from "@powerstation/schema";
import { toMs } from "./data/series";
import { dayTicks, formatDay } from "./format";
import type { Model } from "./model";
import { formatPower } from "@powerstation/ui";

export interface ChartLine {
  series: TimeSeries;
  /** Only the hours in this state are drawn; other hours leave a gap. */
  state: DataState;
  class: string;
  /** -1 draws the series below zero (e.g. capacity in the other direction). */
  sign?: 1 | -1;
  /** Hours from here on are not drawn. */
  until?: number;
}

interface Props {
  model: Model;
  hour: number;
  lines: ChartLine[];
  /** Accessible name of the chart. */
  label: string;
  onHour: (ms: number) => void;
  /** Short words next to the top and bottom of the axis, e.g. "imports" / "exports". */
  above?: string;
  below?: string;
}

const CW = 360;
const CH = 170;
const PAD = { l: 50, r: 6, t: 8, b: 22 };

export function Chart(props: Props) {
  const { model, hour, lines } = props;
  const hours = model.hours;
  const t0 = hours[0]!;
  const t1 = hours[hours.length - 1]!;
  const inWindow = (t: number) => t >= t0 && t <= t1;

  let max = 1;
  for (const l of lines)
    l.series.values.forEach((v, i) => {
      const t = toMs(l.series.start) + i * 3_600_000;
      if (v !== null && inWindow(t) && l.series.states[i] === l.state)
        max = Math.max(max, Math.abs(v));
    });
  const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0)) * (CW - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((max - v) / (2 * max)) * (CH - PAD.t - PAD.b);

  const path = (l: ChartLine) => {
    let d = "";
    let pen = false;
    l.series.values.forEach((v, i) => {
      const t = toMs(l.series.start) + i * 3_600_000;
      if (
        !inWindow(t) ||
        (l.until !== undefined && t >= l.until) ||
        v === null ||
        l.series.states[i] !== l.state
      )
        return void (pen = false);
      d += `${pen ? "L" : "M"}${x(t).toFixed(1)},${y((l.sign ?? 1) * v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      class="chart"
      role="img"
      aria-label={props.label}
      onClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ms =
          t0 + (((e.clientX - r.left) * (CW / r.width) - PAD.l) / (CW - PAD.l - PAD.r)) * (t1 - t0);
        props.onHour(ms);
      }}
    >
      <line x1={PAD.l} x2={CW - PAD.r} y1={y(0)} y2={y(0)} class="chart__zero" />
      <text x={PAD.l - 4} y={y(max) + 4} text-anchor="end" class="chart__axis">
        {formatPower(max)}
      </text>
      {props.above ? (
        <text x={PAD.l - 4} y={y(max) + 16} text-anchor="end" class="chart__axis">
          {props.above}
        </text>
      ) : null}
      {props.below ? (
        <text x={PAD.l - 4} y={y(-max) - 12} text-anchor="end" class="chart__axis">
          {props.below}
        </text>
      ) : null}
      <text x={PAD.l - 4} y={y(-max)} text-anchor="end" class="chart__axis">
        −{formatPower(max)}
      </text>
      {dayTicks(hours).map((d) => (
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
      {lines.map((l, i) => (
        <path key={i} d={path(l)} class={l.class} />
      ))}
      <line x1={x(hour)} x2={x(hour)} y1={PAD.t} y2={CH - PAD.b} class="chart__cursor" />
    </svg>
  );
}
