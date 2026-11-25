// Placeholder from session 0: proves the schema types import cleanly.
// Replace or delete it when this app gets real code.
import { DATA_PATHS, type DataFile, type FlowsFile, type TimeSeries } from "@powerstation/schema";

export const flowsPath: string = DATA_PATHS.flows7d;

export function firstValue(file: DataFile): TimeSeries["values"][number] | undefined {
  if (file.dataset !== "flows") return undefined;
  const flows: FlowsFile = file;
  return flows.borders[0]?.series.values[0];
}
