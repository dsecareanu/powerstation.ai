import type { StatusFile } from "@powerstation/schema";
import { getFreshness, type FreshnessOptions } from "../freshness";

export interface DataDelayedBannerProps extends FreshnessOptions {
  status: StatusFile;
  /** IANA time zone for the shown time. Default: the browser's. */
  timeZone?: string;
  class?: string;
}

function formatLocalTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatAge(hours: number): string {
  if (hours < 48) {
    const h = Math.floor(hours);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(hours / 24);
  return `${d} days ago`;
}

/**
 * Shows "Data delayed" when the newest measured data in status.json is older
 * than DATA_DELAYED_AFTER_HOURS. Renders nothing when data is fresh.
 */
export function DataDelayedBanner({
  status,
  timeZone,
  class: className,
  ...options
}: DataDelayedBannerProps) {
  const freshness = getFreshness(status, options);
  if (!freshness.delayed) return null;

  const detail =
    freshness.newestMeasuredAt && freshness.ageHours !== null
      ? `The newest measured data is from ${formatLocalTime(freshness.newestMeasuredAt, timeZone)} (${formatAge(freshness.ageHours)}). The data source may be late.`
      : "No measured data is available right now. The data source may be late.";

  return (
    <div class={["ps-banner", className].filter(Boolean).join(" ")} role="status">
      <span class="ps-banner__icon" aria-hidden="true">
        !
      </span>
      <p style={{ margin: 0 }}>
        <span class="ps-banner__title">Data delayed. </span>
        {detail}
      </p>
    </div>
  );
}
