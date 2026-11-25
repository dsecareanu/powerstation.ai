// Public entry point of the data contract.
// Types are generated from json/*.schema.json (see src/generated.ts).
import type {
  DatacentersFile,
  ForecastsFile,
  FlowsFile,
  GenerationFile,
  StatusFile,
  ZoneGeneration,
  ZonesFile,
} from "./generated";

export type * from "./generated";

/** Version of the data contract this package describes. */
export const SCHEMA_VERSION = "1.0.0" as const;

/** Any published data file. Narrow it with the `dataset` field. */
export type DataFile =
  StatusFile | ZonesFile | FlowsFile | GenerationFile | ForecastsFile | DatacentersFile;

export type Dataset = DataFile["dataset"];

/** Paths of the data files, relative to the public R2 base URL. */
export const DATA_PATHS = {
  status: "v1/meta/status.json",
  zones: "v1/meta/zones.json",
  flows7d: "v1/flows/rolling-7d.json",
  flows30d: "v1/flows/rolling-30d.json",
  generation7d: "v1/generation/rolling-7d.json",
  generation30d: "v1/generation/rolling-30d.json",
  forecasts24h: "v1/forecasts/next-24h.json",
  datacenters: "v1/datacenters/datacenters.json",
} as const;

export type FuelType = keyof ZoneGeneration["generation"];

/** All fuel types, in a stable display order. */
export const FUEL_TYPES = [
  "nuclear",
  "lignite",
  "hard_coal",
  "gas",
  "oil",
  "biomass",
  "waste",
  "geothermal",
  "hydro_run_of_river",
  "hydro_reservoir",
  "hydro_pumped_storage",
  "wind_onshore",
  "wind_offshore",
  "solar",
  "other_renewable",
  "other",
] as const satisfies readonly FuelType[];

// Compile-time check: FUEL_TYPES lists every fuel type in the schema.
type MissingFuel = Exclude<FuelType, (typeof FUEL_TYPES)[number]>;
const _allFuelsListed: MissingFuel extends never ? true : MissingFuel = true;
void _allFuelsListed;

/** Hours since the newest measured value after which the UI shows "data delayed". */
export const DATA_DELAYED_AFTER_HOURS = 2;
