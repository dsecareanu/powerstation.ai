// Fetches the public data files. No validation in the browser: the pipeline validates every
// file against the schema before upload (pnpm validate --deploy), and ajv would add ~100 KB.
import {
  DATA_PATHS,
  type DataFile,
  type FlowsFile,
  type GenerationFile,
  type StatusFile,
  type ZonesFile,
} from "@powerstation/schema";
import { toMs } from "./series";

const BASE = import.meta.env.VITE_DATA_BASE_URL ?? "/data/";

async function fetchFile<T extends DataFile>(path: string, dataset: T["dataset"]): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  const data = (await res.json()) as DataFile;
  if (data.dataset !== dataset) throw new Error(`${path}: expected dataset ${dataset}`);
  return data as T;
}

export interface DefaultData {
  status: StatusFile;
  zones: ZonesFile;
  flows: FlowsFile;
  generation: GenerationFile;
}

/** The files the default (7-day) view needs. */
export async function loadDefault(): Promise<DefaultData> {
  const [status, zones, flows, generation] = await Promise.all([
    fetchFile<StatusFile>(DATA_PATHS.status, "status"),
    fetchFile<ZonesFile>(DATA_PATHS.zones, "zones"),
    fetchFile<FlowsFile>(DATA_PATHS.flows7d, "flows"),
    fetchFile<GenerationFile>(DATA_PATHS.generation7d, "generation"),
  ]);
  return { status, zones, flows, generation };
}

/** Loaded only when the user turns on the 30-day view. */
export async function load30d(): Promise<Pick<DefaultData, "flows" | "generation">> {
  const [flows, generation] = await Promise.all([
    fetchFile<FlowsFile>(DATA_PATHS.flows30d, "flows"),
    fetchFile<GenerationFile>(DATA_PATHS.generation30d, "generation"),
  ]);
  return { flows, generation };
}

/** Current time. In dev and demo builds it is fixed to the fixtures' "now"; `?now=<ISO>` overrides it. */
export function clockNow(): number {
  if (!import.meta.env.DEV && !__DEV_NOW__) return Date.now();
  const param = new URLSearchParams(location.search).get("now");
  return toMs(param ?? __DEV_NOW__);
}
