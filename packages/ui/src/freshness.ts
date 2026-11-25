import { DATA_DELAYED_AFTER_HOURS, type StatusFile } from "@powerstation/schema";

export interface Freshness {
  /** true if the measured data is older than the threshold, or if there is none. */
  delayed: boolean;
  /**
   * Newest measured time of the stalest file checked (UTC ISO string).
   * null if no checked file has measured values.
   */
  newestMeasuredAt: string | null;
  /** Hours between newestMeasuredAt and now. null if newestMeasuredAt is null. */
  ageHours: number | null;
}

export interface FreshnessOptions {
  /** Only check these file paths (e.g. DATA_PATHS.flows7d). Default: all files with measured data. */
  paths?: readonly string[];
  now?: Date;
  thresholdHours?: number;
}

/**
 * Reads status.json and decides if the UI must show "data delayed".
 * Each checked file must have measured data newer than the threshold.
 * Files with newest_measured_at = null (e.g. forecasts) are skipped.
 */
export function getFreshness(status: StatusFile, options: FreshnessOptions = {}): Freshness {
  const { paths, now = new Date(), thresholdHours = DATA_DELAYED_AFTER_HOURS } = options;
  const times = status.files
    .filter((f) => !paths || paths.includes(f.path))
    .map((f) => f.newest_measured_at)
    .filter((t): t is string => t !== null)
    .map((t) => Date.parse(t))
    .filter((t) => !Number.isNaN(t));

  if (times.length === 0) return { delayed: true, newestMeasuredAt: null, ageHours: null };

  const stalest = Math.min(...times);
  const ageHours = (now.getTime() - stalest) / 3_600_000;
  return {
    delayed: ageHours > thresholdHours,
    newestMeasuredAt: new Date(stalest).toISOString().replace(".000Z", "Z"),
    ageHours,
  };
}
