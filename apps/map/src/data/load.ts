// Fetches the public data files. No validation in the browser: the pipeline validates every
// file against the schema before upload (pnpm validate --deploy), and ajv would add ~100 KB.
import {
  type CapacityFile,
  DATA_PATHS,
  type DataFile,
  type FlowsFile,
  type ForecastsFile,
  type GenerationFile,
  type StatusFile,
  type ZonesFile,
} from "@powerstation/schema";
import { toMs } from "./series";

// `env` is undefined outside Vite (unit tests).
const BASE = import.meta.env?.VITE_DATA_BASE_URL ?? "/data/";

async function fetchFile<T extends DataFile>(path: string, dataset: T["dataset"]): Promise<T> {
  const file = await fetchOptional<T>(null, path, dataset);
  if (!file) throw new Error(`Could not load ${path} (HTTP 404)`);
  return file;
}

/** True when status.json lists the file. The pipeline lists every file it publishes. */
export function isListed(status: StatusFile, path: string): boolean {
  return status.files.some((f) => f.path === path);
}

/**
 * A file the live pipeline may not publish (yet). It is requested only when status.json lists it,
 * so an unpublished file costs no request and no 404. Not listed, or HTTP 404 → null, and the
 * views show its values as missing. Example: generation and actual load are restricted ENTSO-E
 * data (CLAUDE.md rule 7).
 */
async function fetchOptional<T extends DataFile>(
  status: StatusFile | null,
  path: string,
  dataset: T["dataset"],
): Promise<T | null> {
  if (status && !isListed(status, path)) return null;
  const res = await fetch(BASE + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  const data = (await res.json()) as DataFile;
  if (data.dataset !== dataset) throw new Error(`${path}: expected dataset ${dataset}`);
  return data as T;
}

export interface DefaultData {
  status: StatusFile;
  zones: ZonesFile;
  flows: FlowsFile;
  /** Restricted data: null until it is published. */
  generation: GenerationFile | null;
  /** Day-ahead transfer capacity (open data). */
  capacity: CapacityFile | null;
  /** Day-ahead load forecast (open data); wind and solar only with permission. */
  forecasts: ForecastsFile | null;
}

/** The files the default (7-day) view needs. status.json comes first: it says what exists. */
export async function loadDefault(): Promise<DefaultData> {
  const status = await fetchFile<StatusFile>(DATA_PATHS.status, "status");
  const [zones, flows, generation, capacity, forecasts] = await Promise.all([
    fetchFile<ZonesFile>(DATA_PATHS.zones, "zones"),
    fetchFile<FlowsFile>(DATA_PATHS.flows7d, "flows"),
    fetchOptional<GenerationFile>(status, DATA_PATHS.generation7d, "generation"),
    fetchOptional<CapacityFile>(status, DATA_PATHS.capacity30d, "capacity"),
    fetchOptional<ForecastsFile>(status, DATA_PATHS.forecasts24h, "forecasts"),
  ]);
  return { status, zones, flows, generation, capacity, forecasts };
}

/** Loaded only when the user turns on the 30-day view. */
export async function load30d(
  status: StatusFile,
): Promise<Pick<DefaultData, "flows" | "generation">> {
  const [flows, generation] = await Promise.all([
    fetchFile<FlowsFile>(DATA_PATHS.flows30d, "flows"),
    fetchOptional<GenerationFile>(status, DATA_PATHS.generation30d, "generation"),
  ]);
  return { flows, generation };
}

/** Current time. In dev and demo builds it is fixed to the fixtures' "now"; `?now=<ISO>` overrides it. */
export function clockNow(): number {
  if (!import.meta.env.DEV && !__DEV_NOW__) return Date.now();
  const param = new URLSearchParams(location.search).get("now");
  return toMs(param ?? __DEV_NOW__);
}
