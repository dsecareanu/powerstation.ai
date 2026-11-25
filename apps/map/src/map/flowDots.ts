// Flow dots: size scale and direction. Sizes are in CSS pixels, so the map and the legend match
// at any map width (the map converts them to viewBox units).

/** Smallest and largest dot radius, CSS px. */
export const DOT_R_MIN = 2;
export const DOT_R_MAX = 8;
/** Area-true: radius = K × √MW, so dot area grows in step with MW. 2 GW → 4.5 px. */
const K = 4.5 / Math.sqrt(2000);

/** Dot radius for a flow, CSS px: area-true between the minimum and the maximum. */
export function dotRadius(mw: number): number {
  return Math.min(DOT_R_MAX, Math.max(DOT_R_MIN, K * Math.sqrt(Math.abs(mw))));
}

/** MW at which the scale reaches its limits (below: minimum dot; above: maximum dot). */
export const DOT_MW_AT_MIN = (DOT_R_MIN / K) ** 2;
export const DOT_MW_AT_MAX = (DOT_R_MAX / K) ** 2;

/** Dot sizes shown in the legend. */
export const DOT_LEGEND_MW = [1000, 3000, 6000] as const;

/** Distance from one dot to the next along the path, CSS px. Larger dots sit further apart. */
export const dotGap = (r: number): number => 2 * r + 12;

/** Dot speed along the path, CSS px per second (same for every flow). */
export const DOT_SPEED = 28;

/**
 * Path ends for a flow between two points: dots move from the exporting side to the importing
 * side. `value` is the flow from `a` to `b`; negative means b → a. Null (missing): a → b.
 */
export function flowEnds<P>(a: P, b: P, value: number | null): [P, P] {
  return value !== null && value < 0 ? [b, a] : [a, b];
}
