import type { DataState } from "@powerstation/schema";
import { DATA_STATE_COPY } from "../dataStates";

export interface DataStateBadgeProps {
  state: DataState;
  /** Overrides the default label, e.g. "Planned trade". */
  label?: string;
  /** How a modelled value was made, e.g. "Linear fill between two measured hours". Shown after the label. */
  method?: string;
  class?: string;
}

/**
 * Label for a data state: a patterned swatch plus text, so color is never the
 * only signal. For modelled values, pass `method`.
 */
export function DataStateBadge({ state, label, method, class: className }: DataStateBadgeProps) {
  const copy = DATA_STATE_COPY[state];
  const classes = ["ps-badge", `ps-badge--${state}`, `ps-state--${state}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span class={classes} data-state={state} title={copy.description}>
      <span class="ps-swatch" aria-hidden="true" />
      <span class="ps-badge__label">{label ?? copy.label}</span>
      {method ? <span class="ps-badge__method">· {method}</span> : null}
    </span>
  );
}
