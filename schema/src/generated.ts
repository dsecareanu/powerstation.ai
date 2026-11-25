/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: schema/json/*.schema.json. Regenerate with: pnpm schema:types
 */

/**
 * v1/meta/status.json. Last update per source and per file. The UI shows 'data delayed' when newest_measured_at is more than 2 hours old.
 */
export type StatusFile = Envelope & {
  dataset: "status";
  files: FileStatus[];
  sources: SourceStatus[];
};
/**
 * Version of the data contract. Bump it on every schema change.
 */
export type SchemaVersion = "1.0.0";
/**
 * UTC time in ISO 8601 with a Z suffix, e.g. 2026-11-25T12:00:00Z.
 */
export type UtcTimestamp = string;
/**
 * v1/meta/zones.json. Bidding zones (data is stored per zone) and countries (the UI shows countries), with the mapping between them.
 */
export type ZonesFile = Envelope & {
  dataset: "zones";
  zones: Zone[];
  countries: Country[];
};
/**
 * Bidding zone id, e.g. DE-LU, FR, IT-North, NO1. Defined in v1/meta/zones.json.
 */
export type ZoneId = string;
/**
 * ISO 3166-1 alpha-2 country code, e.g. DE.
 */
export type CountryCode = string;
/**
 * v1/flows/rolling-7d.json and v1/flows/rolling-30d.json. Hourly cross-border flows per border. Physical (measured) flows and scheduled exchanges (planned trade) are separate series.
 */
export type FlowsFile = Envelope & {
  dataset: "flows";
  window: Window;
  borders: BorderSeries[];
};
/**
 * ISO 8601 duration of one step. v1 publishes hourly data only: the pipeline aggregates 15- and 30-minute source data to hourly averages.
 */
export type Resolution = "PT1H";
/**
 * measured = reported by a grid operator or the named source. planned = day-ahead schedule or forecast. modelled = inferred by powerstation.ai (needs a method). missing = no value (the value is null).
 */
export type DataState = "measured" | "planned" | "modelled" | "missing";
/**
 * v1/generation/rolling-7d.json and v1/generation/rolling-30d.json. Hourly actual generation by fuel type and actual load, per zone.
 */
export type GenerationFile = Envelope & {
  dataset: "generation";
  window: Window;
  zones: ZoneGeneration[];
};
/**
 * v1/forecasts/next-24h.json. Day-ahead wind and solar generation forecasts and load forecast, per zone. All values have state planned or missing.
 */
export type ForecastsFile = Envelope & {
  dataset: "forecasts";
  window: Window;
  zones: ZoneForecast[];
};
/**
 * v1/datacenters/datacenters.json. Data center points. Each record names its own source and license, because records can come from different sources (e.g. Epoch AI, OSM).
 */
export type DatacentersFile = Envelope & {
  dataset: "datacenters";
  datacenters: Datacenter[];
};

export interface AllDataFiles {
  status?: StatusFile;
  zones?: ZonesFile;
  flows?: FlowsFile;
  generation?: GenerationFile;
  forecasts?: ForecastsFile;
  datacenters?: DatacentersFile;
}
/**
 * Fields that every data file has.
 */
export interface Envelope {
  schema_version: SchemaVersion;
  /**
   * Kind of file. Selects the schema.
   */
  dataset: "status" | "zones" | "flows" | "generation" | "forecasts" | "datacenters";
  generated_at: UtcTimestamp;
  /**
   * true for fixtures and demo data. The deploy step refuses files with mock: true.
   */
  mock: boolean;
  /**
   * Name of the data source, e.g. ENTSO-E Transparency Platform.
   */
  source: string;
  source_url?: string;
  /**
   * License of the data, e.g. CC-BY-4.0 or ODbL-1.0.
   */
  license: string;
  /**
   * Text the attribution panel shows.
   */
  attribution: string;
}
/**
 * updated_at = when the pipeline last wrote the file. newest_measured_at = end of the newest step with a measured value; null if the file has no measured values (e.g. forecasts). ok = false if the last update failed.
 */
export interface FileStatus {
  /**
   * R2 path, e.g. v1/flows/rolling-7d.json.
   */
  path: string;
  dataset: "zones" | "flows" | "generation" | "forecasts" | "datacenters";
  updated_at: UtcTimestamp;
  newest_measured_at: UtcTimestamp | null;
  ok: boolean;
  message?: string;
}
export interface SourceStatus {
  id: string;
  name: string;
  last_success_at: UtcTimestamp | null;
  last_attempt_at: UtcTimestamp | null;
  ok: boolean;
  message?: string;
}
export interface Zone {
  id: ZoneId;
  name: string;
  /**
   * ENTSO-E EIC area code, e.g. 10Y1001A1001A82H.
   */
  eic?: string;
  /**
   * Countries this zone is part of. Usually one; DE-LU has two.
   *
   * @minItems 1
   */
  countries: [CountryCode, ...CountryCode[]];
  centroid: LatLon;
  /**
   * Zones with a direct interconnection. Only zones listed in this file.
   */
  neighbours: ZoneId[];
}
export interface LatLon {
  lat: number;
  lon: number;
}
export interface Country {
  code: CountryCode;
  name: string;
  /**
   * Bidding zones in this country. Italy and Norway have several.
   *
   * @minItems 1
   */
  zones: [ZoneId, ...ZoneId[]];
}
/**
 * Time range the file covers. start is inclusive, end is exclusive.
 */
export interface Window {
  start: UtcTimestamp;
  end: UtcTimestamp;
}
/**
 * One series for one border. Value in MW (hourly average). Positive = net flow from from_zone to to_zone; negative = the other way. Each border appears once per kind, in one direction only.
 */
export interface BorderSeries {
  from_zone: ZoneId;
  to_zone: ZoneId;
  /**
   * physical = measured cross-border physical flow (states measured, modelled or missing). scheduled = day-ahead scheduled commercial exchange, shown as 'planned trade' (states planned or missing).
   */
  kind: "physical" | "scheduled";
  series: TimeSeries;
}
/**
 * Columnar time series. Value i covers [start + i*resolution, start + (i+1)*resolution). values and states have the same length. A null value has state missing, and a missing state has a null value.
 */
export interface TimeSeries {
  start: UtcTimestamp;
  resolution: Resolution;
  /**
   * MW = average power over the step.
   */
  unit: "MW";
  values: (number | null)[];
  states: DataState[];
  /**
   * How modelled values were made, in plain English. Required when any state is modelled.
   */
  method?: string;
}
/**
 * load = actual total load in MW. generation = one series per fuel type the zone has. A fuel type the zone does not have is left out (that is not a gap). hydro_pumped_storage is net (generation minus pumping) and can be negative.
 */
export interface ZoneGeneration {
  zone: ZoneId;
  load: TimeSeries;
  generation: {
    biomass?: TimeSeries;
    lignite?: TimeSeries;
    hard_coal?: TimeSeries;
    gas?: TimeSeries;
    oil?: TimeSeries;
    nuclear?: TimeSeries;
    hydro_run_of_river?: TimeSeries;
    hydro_reservoir?: TimeSeries;
    hydro_pumped_storage?: TimeSeries;
    wind_onshore?: TimeSeries;
    wind_offshore?: TimeSeries;
    solar?: TimeSeries;
    geothermal?: TimeSeries;
    waste?: TimeSeries;
    other_renewable?: TimeSeries;
    other?: TimeSeries;
  };
}
/**
 * load = day-ahead total load forecast in MW. generation = day-ahead wind and solar forecasts; a type the zone does not have is left out.
 */
export interface ZoneForecast {
  zone: ZoneId;
  load: TimeSeries;
  generation: {
    wind_onshore?: TimeSeries;
    wind_offshore?: TimeSeries;
    solar?: TimeSeries;
  };
}
export interface Datacenter {
  id: string;
  name: string;
  operator: string | null;
  lat: number;
  lon: number;
  zone: ZoneId;
  country: CountryCode;
  /**
   * Power demand or grid connection in MW, as the source gives it. null if unknown.
   */
  power_mw: number | null;
  /**
   * measured = published by the source. modelled = estimated by powerstation.ai. missing = power_mw is null.
   */
  power_state: "measured" | "modelled" | "missing";
  status: "operating" | "under_construction" | "planned" | "cancelled" | "unknown";
  source: string;
  source_url?: string;
  license: string;
  /**
   * Date the source data refers to (YYYY-MM-DD).
   */
  as_of: string;
}
