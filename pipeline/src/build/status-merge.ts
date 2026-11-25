// Merges a fresh status.json into the one that is on R2.
// Each job (hourly, monthly) writes only its own files. Entries for files and
// sources that this run did not touch are kept from the old status, so one job
// does not remove the other job's entries.
import type { StatusFile } from "@powerstation/schema";

export function mergeStatus(fresh: StatusFile, old: StatusFile | null): StatusFile {
  if (!old) return fresh;
  const freshPaths = new Set(fresh.files.map((f) => f.path));
  const freshSources = new Set(fresh.sources.map((s) => s.id));
  return {
    ...fresh,
    files: [...fresh.files, ...old.files.filter((f) => !freshPaths.has(f.path))].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    sources: [...fresh.sources, ...old.sources.filter((s) => !freshSources.has(s.id))].sort(
      (a, b) => a.id.localeCompare(b.id),
    ),
  };
}
