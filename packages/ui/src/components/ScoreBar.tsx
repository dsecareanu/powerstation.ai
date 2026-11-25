import { getLevel, LEVELS, type Level } from "../score";
import { AnimatedNumber } from "./AnimatedNumber";

export interface ScoreBarProps {
  points: number;
  levels?: readonly Level[];
  class?: string;
}

const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n));

/** Points, level name and progress to the next level. Pair it with useScore(). */
export function ScoreBar({ points, levels = LEVELS, class: className }: ScoreBarProps) {
  const { level, next, progress } = getLevel(points, levels);
  const valueText = next
    ? `${fmt(points)} points. ${fmt(next.minPoints - points)} more to reach ${next.name}.`
    : `${fmt(points)} points. Top level reached.`;
  return (
    <div class={["ps-score", className].filter(Boolean).join(" ")}>
      <div class="ps-score__row">
        <span class="ps-score__level">{level.name}</span>
        <span class="ps-score__points">
          <AnimatedNumber value={points} /> points
        </span>
      </div>
      <div
        class="ps-score__track"
        role="progressbar"
        aria-label={next ? `Progress to ${next.name}` : "Level progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={valueText}
      >
        <div class="ps-score__fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div class="ps-score__next">
        {next ? `Next: ${next.name} at ${fmt(next.minPoints)}` : "Top level"}
      </div>
    </div>
  );
}
