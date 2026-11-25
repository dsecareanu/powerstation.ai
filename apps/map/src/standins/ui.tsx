// TODO(D): temporary stand-ins for @powerstation/ui (session D, PR #3).
// Same export names and props as PR #3, so the switch is an import change:
//   import { ... } from "@powerstation/ui"; import "@powerstation/ui/styles.css";
// Then delete this folder. Do not add features here.
import {
  DATA_DELAYED_AFTER_HOURS,
  type DataState,
  type Envelope,
  type FuelType,
  type StatusFile,
} from "@powerstation/schema";
import "./ui.css";

export const DATA_STATE_COPY: Record<DataState, { label: string; description: string }> = {
  measured: {
    label: "Measured",
    description: "Reported by the grid operator or the named source.",
  },
  planned: { label: "Planned", description: "A day-ahead plan or forecast, not a measurement." },
  modelled: { label: "Modelled", description: "Estimated by powerstation.ai. See the method." },
  missing: { label: "No data", description: "No value is available for this time." },
};

export function DataStateBadge(props: { state: DataState; label?: string; method?: string }) {
  const copy = DATA_STATE_COPY[props.state];
  return (
    <span class={`ps-badge ps-state--${props.state}`} title={copy.description}>
      <span class="ps-swatch" aria-hidden="true" />
      <span>{props.label ?? copy.label}</span>
      {props.method ? <span class="ps-badge__method">· {props.method}</span> : null}
    </span>
  );
}

export function getFreshness(status: StatusFile, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const times = status.files
    .map((f) => f.newest_measured_at)
    .filter((t): t is string => t !== null)
    .map(Date.parse);
  if (!times.length) return { delayed: true, newestMeasuredAt: null, ageHours: null };
  const stalest = Math.min(...times);
  const ageHours = (now.getTime() - stalest) / 3_600_000;
  return {
    delayed: ageHours > DATA_DELAYED_AFTER_HOURS,
    newestMeasuredAt: new Date(stalest).toISOString(),
    ageHours,
  };
}

export function DataDelayedBanner(props: { status: StatusFile; now?: Date }) {
  const f = getFreshness(props.status, { now: props.now });
  if (!f.delayed) return null;
  return (
    <div class="ps-banner" role="status">
      <strong>Data delayed. </strong>
      {f.newestMeasuredAt
        ? `The newest measured data is from ${new Date(f.newestMeasuredAt).toLocaleString("en-GB")}.`
        : "No measured data is available right now."}
    </div>
  );
}

export type AttributionSource = Pick<
  Envelope,
  "source" | "source_url" | "license" | "attribution" | "mock"
>;

export function AttributionPanel(props: { files: readonly AttributionSource[] }) {
  const seen = new Map<string, AttributionSource>();
  for (const f of props.files) seen.set([f.source, f.license, f.attribution].join("|"), f);
  return (
    <details class="ps-attribution">
      <summary>Data sources ({seen.size})</summary>
      {props.files.some((f) => f.mock) ? (
        <p>Demo data: some values on this page are not real grid data.</p>
      ) : null}
      <ul>
        {[...seen.values()].map((s) => (
          <li key={s.source + s.license}>
            <div>{s.source_url ? <a href={s.source_url}>{s.source}</a> : s.source}</div>
            <div>{s.attribution}</div>
            <div class="ps-muted">License: {s.license}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function fuelColorVar(fuel: FuelType): string {
  return `--ps-fuel-${fuel.replaceAll("_", "-")}`;
}

/** 950 → "950 MW", 1200 → "1.2 GW". */
export function formatPower(mw: number): string {
  const abs = Math.abs(mw);
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }).format(v);
  return abs >= 1000 ? `${fmt(mw / 1000)} GW` : `${fmt(mw)} MW`;
}

/**
 * TODO(D): PR #3 has the sourced household figure. Until it merges, show no comparison
 * (we do not use a figure from memory).
 */
export function describePowerInHomes(mw: number): string {
  void mw;
  return "";
}
