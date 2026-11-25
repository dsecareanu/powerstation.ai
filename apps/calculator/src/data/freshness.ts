import { DATA_DELAYED_AFTER_HOURS, type StatusFile } from "@powerstation/schema";

/** Newest `newest_measured_at` across all status files, in ms. Null if none has a value. */
export function newestMeasuredMs(status: StatusFile): number | null {
  let newest: number | null = null;
  for (const f of status.files) {
    if (f.newest_measured_at === null) continue;
    const ms = Date.parse(f.newest_measured_at);
    if (newest === null || ms > newest) newest = ms;
  }
  return newest;
}

/** True when the newest measured data is older than DATA_DELAYED_AFTER_HOURS (or unknown). */
export function isDataDelayed(status: StatusFile, nowMs: number): boolean {
  const newest = newestMeasuredMs(status);
  if (newest === null) return true;
  return nowMs - newest > DATA_DELAYED_AFTER_HOURS * 3_600_000;
}
