import type { DataState } from "@powerstation/schema";

export interface DataStateCopy {
  /** Short label for badges and legends. */
  label: string;
  /** One plain sentence for screen readers and legends. */
  description: string;
}

/**
 * Default UI copy per data state. "planned" covers both planned trade
 * (scheduled exchanges) and forecasts: pass a more exact label where you can,
 * e.g. "Planned trade". Never call planned flows "forecast flows".
 */
export const DATA_STATE_COPY: Record<DataState, DataStateCopy> = {
  measured: {
    label: "Measured",
    description: "Reported by the grid operator or the named source.",
  },
  planned: {
    label: "Planned",
    description: "A day-ahead plan or forecast, not a measurement.",
  },
  modelled: {
    label: "Modelled",
    description: "Estimated by powerstation.ai. See the method.",
  },
  missing: {
    label: "No data",
    description: "No value is available for this time.",
  },
};

export const DATA_STATES = [
  "measured",
  "planned",
  "modelled",
  "missing",
] as const satisfies readonly DataState[];
