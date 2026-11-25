import {
  DATA_PATHS,
  type CapacityFile,
  type DataFile,
  type DatacentersFile,
  type EmissionFactorsFile,
  type FlowsFile,
  type GenerationFile,
  type StatusFile,
  type ZonesFile,
} from "@powerstation/schema";
import type { Period } from "../state/url";

export function dataBaseUrl(): string {
  const configured = import.meta.env.VITE_DATA_BASE_URL;
  const base = configured || (import.meta.env.DEV ? "/data/" : "");
  if (!base) {
    throw new Error("The data address is not set. Set VITE_DATA_BASE_URL when you build the site.");
  }
  return base.endsWith("/") ? base : base + "/";
}

const cache = new Map<string, Promise<DataFile>>();

/** Fetch one data file. Checks `dataset` and the major schema version. Caches in memory. */
export function loadFile<D extends DataFile["dataset"]>(
  path: string,
  dataset: D,
): Promise<Extract<DataFile, { dataset: D }>> {
  let p = cache.get(path);
  if (!p) {
    p = fetchFile(path, dataset);
    cache.set(path, p);
    // Do not cache failures: allow a retry.
    p.catch(() => cache.delete(path));
  }
  return p as Promise<Extract<DataFile, { dataset: D }>>;
}

async function fetchFile(path: string, dataset: DataFile["dataset"]): Promise<DataFile> {
  const url = dataBaseUrl() + path;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Could not load ${path}. Check your connection and try again.`);
  }
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}).`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`The file ${path} is not valid JSON.`);
  }
  const file = json as Partial<DataFile>;
  if (file.dataset !== dataset) {
    throw new Error(`The file ${path} has the wrong content (expected "${dataset}").`);
  }
  if (typeof file.schema_version !== "string" || !file.schema_version.startsWith("1.")) {
    throw new Error(`The file ${path} uses a data version this page does not support.`);
  }
  return file as DataFile;
}

export const loadStatus = (): Promise<StatusFile> => loadFile(DATA_PATHS.status, "status");
export const loadZones = (): Promise<ZonesFile> => loadFile(DATA_PATHS.zones, "zones");
export const loadDatacenters = (): Promise<DatacentersFile> =>
  loadFile(DATA_PATHS.datacenters, "datacenters");

export interface PeriodData {
  generation: GenerationFile;
  flows: FlowsFile;
}

export async function loadPeriod(period: Period): Promise<PeriodData> {
  const [generation, flows] = await Promise.all([
    loadFile(period === "7d" ? DATA_PATHS.generation7d : DATA_PATHS.generation30d, "generation"),
    loadFile(period === "7d" ? DATA_PATHS.flows7d : DATA_PATHS.flows30d, "flows"),
  ]);
  return { generation, flows };
}

/**
 * Day-ahead capacity per direction (30-day file). Undefined when the file cannot be loaded:
 * the page then says "not available" for interconnector pressure and works for the rest.
 */
export async function loadCapacity(): Promise<CapacityFile | undefined> {
  try {
    return await loadFile(DATA_PATHS.capacity30d, "capacity");
  } catch {
    return undefined;
  }
}

/** Emission factors per fuel. Undefined when the file cannot be loaded (carbon is then "not available"). */
export async function loadEmissionFactors(): Promise<EmissionFactorsFile | undefined> {
  try {
    return await loadFile(DATA_PATHS.emissionFactors, "emission_factors");
  } catch {
    return undefined;
  }
}
