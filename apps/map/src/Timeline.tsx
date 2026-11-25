// Hourly timeline: slider, play/pause, step buttons, 7/30-day toggle.
// Measured hours sit left of the "latest measured" mark, planned trade to the right.
import { useEffect } from "preact/hooks";
import { dayTicks, formatClock, formatDay, formatHour } from "./format";

interface Props {
  hours: number[];
  index: number;
  /** Index of the newest measured hour. */
  latestIndex: number;
  measuredEnd: number;
  /** False when no planned trade is published: hours ahead are only "ahead of measurements". */
  hasPlanned: boolean;
  now: number;
  playing: boolean;
  range: "7d" | "30d";
  loading30d: boolean;
  reducedMotion: boolean;
  onIndex: (i: number) => void;
  onPlaying: (p: boolean) => void;
  onRange: (r: "7d" | "30d") => void;
}

export function Timeline(props: Props) {
  const { hours, index, measuredEnd, playing } = props;
  const last = hours.length - 1;
  const hour = hours[index] ?? hours[0]!;
  const planned = hour >= measuredEnd;
  const aheadText = props.hasPlanned ? "planned trade" : "ahead of measurements";
  const pct = (ms: number) => ((ms - hours[0]!) / (hours[last]! - hours[0]!)) * 100;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      props.onPlaying(false);
      return;
    }
    // Slower steps with reduced motion: the map still changes, but calmly.
    const id = setTimeout(() => props.onIndex(index + 1), props.reducedMotion ? 1200 : 500);
    return () => clearTimeout(id);
  }, [playing, index, last]);

  const days = dayTicks(hours);
  const nowHour = Math.floor(props.now / 3_600_000) * 3_600_000;

  return (
    <section class="timeline" aria-label="Timeline">
      <div class="timeline__top">
        <p class="timeline__time" aria-live="polite">
          <strong>{formatHour(hour)}</strong>{" "}
          <span class={`timeline__kind timeline__kind--${planned ? "planned" : "measured"}`}>
            {planned
              ? props.hasPlanned
                ? "planned trade (ahead of measurements)"
                : "ahead of measurements"
              : "measured"}
          </span>
        </p>
        {index < props.latestIndex ? (
          <p class="timeline__behind">
            Not the newest hour.{" "}
            <button type="button" onClick={() => props.onIndex(props.latestIndex)}>
              Go to latest hour ({formatClock(hours[props.latestIndex]!)})
            </button>
          </p>
        ) : null}
        <div class="timeline__range" role="group" aria-label="Time range">
          {(["7d", "30d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={props.range === r}
              disabled={props.loading30d}
              onClick={() => props.onRange(r)}
            >
              {r === "7d" ? "7 days" : props.loading30d ? "Loading…" : "30 days"}
            </button>
          ))}
        </div>
      </div>
      <div class="timeline__controls">
        <button
          type="button"
          onClick={() => props.onIndex(Math.max(0, index - 1))}
          aria-label="One hour back"
        >
          ◀
        </button>
        <button
          type="button"
          class="timeline__play"
          onClick={() => props.onPlaying(!playing)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => props.onIndex(Math.min(last, index + 1))}
          aria-label="One hour forward"
        >
          ▶|
        </button>
        <div class="timeline__track">
          <div
            class="timeline__future"
            style={{ left: `${pct(measuredEnd)}%` }}
            aria-hidden="true"
            title="Planned trade: no measurements yet"
          />
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            aria-label="Hour"
            aria-valuetext={`${formatHour(hour)}, ${planned ? aheadText : "measured"}`}
            onInput={(e) => props.onIndex(Number((e.target as HTMLInputElement).value))}
          />
          <div class="timeline__marks" aria-hidden="true">
            <span
              class={`timeline__mark${pct(measuredEnd) > 75 ? " timeline__mark--end" : ""}`}
              style={{ left: `${pct(measuredEnd)}%` }}
            >
              latest measured
            </span>
            {nowHour !== measuredEnd && nowHour >= hours[0]! && nowHour <= hours[last]! ? (
              <span class="timeline__now" style={{ left: `${pct(nowHour)}%` }} title="Now" />
            ) : null}
            {days.map((d) => (
              <span key={d} class="timeline__day" style={{ left: `${pct(d)}%` }}>
                {formatDay(d)}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          class="timeline__jump"
          onClick={() => props.onIndex(props.latestIndex)}
        >
          Latest hour
        </button>
      </div>
    </section>
  );
}
