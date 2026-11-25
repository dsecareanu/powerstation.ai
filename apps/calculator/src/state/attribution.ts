// Everything the attribution panel lists. Pure function.
import type { Datacenter, EmissionFactorsFile } from "@powerstation/schema";
import { HOUSEHOLD_SOURCE, type AttributionSource } from "@powerstation/ui";

/**
 * `files` are the loaded data files. Added here: each data center record's source, each source
 * cited by the emission factors, and the household source (shown wherever a homes comparison is).
 * The panel lists each unique source once.
 */
export function buildAttribution(
  files: readonly AttributionSource[],
  datacenters: readonly Datacenter[],
  emissionFactors: EmissionFactorsFile | undefined,
): AttributionSource[] {
  return [
    ...files,
    ...datacenters.map((d) => ({
      source: d.source,
      source_url: d.source_url,
      license: d.license,
      attribution: `Data center records (as of ${d.as_of}).`,
      mock: false,
    })),
    ...(emissionFactors?.sources ?? []).map((s) => ({
      source: s.publisher,
      source_url: s.url,
      license: "See the publisher's terms",
      attribution: `${s.title} (${s.year}). Life-cycle emission factors.`,
      mock: false,
    })),
    {
      source: HOUSEHOLD_SOURCE.name,
      source_url: HOUSEHOLD_SOURCE.url,
      license: HOUSEHOLD_SOURCE.license,
      attribution: HOUSEHOLD_SOURCE.attribution,
      mock: false,
    },
  ];
}
