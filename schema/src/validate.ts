// Validates data files against the JSON Schema, plus rules that JSON Schema
// cannot express (equal array lengths, null <-> missing, allowed states per
// series, references between files). Runs in Node and in the browser.
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import capacity from "../json/capacity.schema.json" with { type: "json" };
import common from "../json/common.schema.json" with { type: "json" };
import datacenters from "../json/datacenters.schema.json" with { type: "json" };
import emissionFactors from "../json/emission-factors.schema.json" with { type: "json" };
import flows from "../json/flows.schema.json" with { type: "json" };
import forecasts from "../json/forecasts.schema.json" with { type: "json" };
import generation from "../json/generation.schema.json" with { type: "json" };
import news from "../json/news.schema.json" with { type: "json" };
import status from "../json/status.schema.json" with { type: "json" };
import zones from "../json/zones.schema.json" with { type: "json" };
import type { DataFile, DataState, Dataset, TimeSeries, ZonesFile } from "./index";

export interface ValidationResult {
  ok: boolean;
  dataset: Dataset | null;
  errors: string[];
}

const SCHEMAS = {
  status,
  zones,
  flows,
  generation,
  forecasts,
  datacenters,
  capacity,
  emission_factors: emissionFactors,
  news,
} as const;

// ajv-formats is CommonJS; its default export shape differs between bundlers.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(common);
const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)]),
) as Record<Dataset, ValidateFunction>;

const HOUR_MS = 3_600_000;
const MEASURED_SERIES: readonly DataState[] = ["measured", "modelled", "missing"];
const PLANNED_SERIES: readonly DataState[] = ["planned", "missing"];

function formatAjvError(e: ErrorObject): string {
  return `${e.instancePath || "/"} ${e.message ?? "is invalid"}`;
}

function checkSeries(
  s: TimeSeries,
  path: string,
  allowed: readonly DataState[],
  errors: string[],
): void {
  if (s.values.length !== s.states.length) {
    errors.push(
      `${path}: values (${s.values.length}) and states (${s.states.length}) differ in length`,
    );
    return;
  }
  if (Date.parse(s.start) % HOUR_MS !== 0) {
    errors.push(`${path}/start: ${s.start} is not on a full hour`);
  }
  let modelled = false;
  for (let i = 0; i < s.values.length; i++) {
    const v = s.values[i];
    const st = s.states[i]!;
    if ((v === null) !== (st === "missing")) {
      errors.push(
        `${path}[${i}]: value ${v} with state ${st} (null must have state missing, and missing must be null)`,
      );
    }
    if (!allowed.includes(st)) {
      errors.push(`${path}[${i}]: state ${st} not allowed here (allowed: ${allowed.join(", ")})`);
    }
    if (st === "modelled") modelled = true;
  }
  if (modelled && !s.method) {
    errors.push(`${path}: has modelled values but no method`);
  }
}

function checkSemantics(file: DataFile, errors: string[]): void {
  switch (file.dataset) {
    case "zones": {
      const ids = new Set(file.zones.map((z) => z.id));
      const codes = new Set(file.countries.map((c) => c.code));
      if (ids.size !== file.zones.length) errors.push("/zones: duplicate zone id");
      if (codes.size !== file.countries.length) errors.push("/countries: duplicate country code");
      for (const z of file.zones) {
        for (const n of z.neighbours) {
          if (!ids.has(n)) errors.push(`/zones/${z.id}: neighbour ${n} is not in this file`);
          else if (!file.zones.find((o) => o.id === n)!.neighbours.includes(z.id)) {
            errors.push(`/zones/${z.id}: neighbour ${n} does not list ${z.id} back`);
          }
        }
        for (const c of z.countries) {
          const country = file.countries.find((x) => x.code === c);
          if (!country) errors.push(`/zones/${z.id}: country ${c} is not in countries`);
          else if (!country.zones.includes(z.id)) {
            errors.push(`/countries/${c}: does not list zone ${z.id}`);
          }
        }
      }
      for (const c of file.countries) {
        for (const id of c.zones) {
          if (!ids.has(id)) errors.push(`/countries/${c.code}: zone ${id} is not in zones`);
        }
      }
      break;
    }
    case "flows": {
      const seen = new Set<string>();
      file.borders.forEach((b, i) => {
        const p = `/borders/${i} (${b.from_zone}->${b.to_zone} ${b.kind})`;
        if (b.from_zone === b.to_zone) errors.push(`${p}: from_zone equals to_zone`);
        const key = [b.from_zone, b.to_zone].sort().join("|") + "|" + b.kind;
        if (seen.has(key)) errors.push(`${p}: border appears twice for this kind`);
        seen.add(key);
        checkSeries(b.series, p, b.kind === "physical" ? MEASURED_SERIES : PLANNED_SERIES, errors);
      });
      break;
    }
    case "generation":
      file.zones.forEach((z) => {
        checkSeries(z.load, `/zones/${z.zone}/load`, MEASURED_SERIES, errors);
        for (const [fuel, s] of Object.entries(z.generation)) {
          checkSeries(s, `/zones/${z.zone}/generation/${fuel}`, MEASURED_SERIES, errors);
        }
      });
      break;
    case "forecasts":
      file.zones.forEach((z) => {
        checkSeries(z.load, `/zones/${z.zone}/load`, PLANNED_SERIES, errors);
        for (const [kind, s] of Object.entries(z.generation)) {
          checkSeries(s, `/zones/${z.zone}/generation/${kind}`, PLANNED_SERIES, errors);
        }
      });
      break;
    case "datacenters": {
      const ids = new Set<string>();
      for (const d of file.datacenters) {
        if (ids.has(d.id)) errors.push(`/datacenters/${d.id}: duplicate id`);
        ids.add(d.id);
        if ((d.power_mw === null) !== (d.power_state === "missing")) {
          errors.push(
            `/datacenters/${d.id}: power_mw ${d.power_mw} with power_state ${d.power_state}`,
          );
        }
      }
      break;
    }
    case "capacity": {
      const seen = new Set<string>();
      file.borders.forEach((b, i) => {
        const p = `/borders/${i} (${b.from_zone}->${b.to_zone})`;
        if (b.from_zone === b.to_zone) errors.push(`${p}: from_zone equals to_zone`);
        const key = `${b.from_zone}|${b.to_zone}`;
        if (seen.has(key)) errors.push(`${p}: direction appears twice`);
        seen.add(key);
        checkSeries(b.series, p, PLANNED_SERIES, errors);
        b.series.values.forEach((v, j) => {
          if (v !== null && v < 0) errors.push(`${p}[${j}]: capacity ${v} is negative`);
        });
      });
      break;
    }
    case "emission_factors": {
      const sourceIds = new Set<string>();
      for (const s of file.sources) {
        if (sourceIds.has(s.id)) errors.push(`/sources/${s.id}: duplicate id`);
        sourceIds.add(s.id);
      }
      for (const [fuel, f] of Object.entries(file.factors)) {
        const p = `/factors/${fuel}`;
        const cited = [f.value, f.source_id, f.table, f.row];
        if (f.match === "none") {
          if (cited.some((x) => x !== null)) {
            errors.push(`${p}: match none needs value, source_id, table and row all null`);
          }
        } else {
          if (cited.some((x) => x === null)) {
            errors.push(`${p}: match ${f.match} needs value, source_id, table and row`);
          }
          if (f.source_id !== null && !sourceIds.has(f.source_id)) {
            errors.push(`${p}: source_id ${f.source_id} is not in sources`);
          }
        }
        if (f.match !== "direct" && !f.note) errors.push(`${p}: match ${f.match} needs a note`);
      }
      break;
    }
    case "news": {
      const titles = new Set<string>();
      const perSource = new Map<string, number>();
      if (file.items.length > 8) errors.push(`/items: ${file.items.length} items, at most 8`);
      file.items.forEach((item, i) => {
        const key = item.title.trim().toLowerCase();
        if (titles.has(key)) errors.push(`/items/${i}: duplicate title`);
        titles.add(key);
        const n = (perSource.get(item.source) ?? 0) + 1;
        perSource.set(item.source, n);
        if (n > 2) errors.push(`/items/${i}: more than 2 items from ${item.source}`);
      });
      for (let i = 1; i < file.items.length; i++) {
        const prev = file.items[i - 1]!.published_at;
        const cur = file.items[i]!.published_at;
        if (cur !== null && (prev === null || Date.parse(cur) > Date.parse(prev))) {
          errors.push(`/items/${i}: not newest first (items without a date go last)`);
        }
      }
      break;
    }
    case "status":
      break;
  }
}

/** Validates one parsed data file. */
export function validateDataFile(data: unknown): ValidationResult {
  const dataset = (data as { dataset?: unknown } | null)?.dataset;
  if (typeof dataset !== "string" || !(dataset in validators)) {
    return {
      ok: false,
      dataset: null,
      errors: [`/dataset: unknown dataset ${JSON.stringify(dataset)}`],
    };
  }
  const ds = dataset as Dataset;
  const validate = validators[ds];
  if (!validate(data)) {
    return { ok: false, dataset: ds, errors: (validate.errors ?? []).map(formatAjvError) };
  }
  const errors: string[] = [];
  checkSemantics(data as DataFile, errors);
  return { ok: errors.length === 0, dataset: ds, errors };
}

/** Zone ids a file refers to, for cross-checks against zones.json. */
function referencedZones(file: DataFile): { path: string; zone: string }[] {
  switch (file.dataset) {
    case "flows":
    case "capacity":
      return file.borders.flatMap((b, i) => [
        { path: `/borders/${i}/from_zone`, zone: b.from_zone },
        { path: `/borders/${i}/to_zone`, zone: b.to_zone },
      ]);
    case "generation":
    case "forecasts":
      return file.zones.map((z, i) => ({ path: `/zones/${i}/zone`, zone: z.zone }));
    case "datacenters":
      return file.datacenters.map((d) => ({ path: `/datacenters/${d.id}/zone`, zone: d.zone }));
    default:
      return [];
  }
}

/**
 * Checks that a valid file only refers to zones in zones.json, and that each
 * flow border is between neighbours. Run it after validateDataFile.
 */
export function checkZoneReferences(file: DataFile, zonesFile: ZonesFile): string[] {
  const zonesById = new Map(zonesFile.zones.map((z) => [z.id, z]));
  const errors = referencedZones(file)
    .filter((r) => !zonesById.has(r.zone))
    .map((r) => `${r.path}: zone ${r.zone} is not in zones.json`);
  if (file.dataset === "flows" || file.dataset === "capacity") {
    file.borders.forEach((b, i) => {
      const from = zonesById.get(b.from_zone);
      if (from && zonesById.has(b.to_zone) && !from.neighbours.includes(b.to_zone)) {
        errors.push(
          `/borders/${i}: ${b.from_zone} and ${b.to_zone} are not neighbours in zones.json`,
        );
      }
    });
  }
  if (file.dataset === "datacenters") {
    for (const d of file.datacenters) {
      const z = zonesById.get(d.zone);
      if (z && !z.countries.includes(d.country)) {
        errors.push(`/datacenters/${d.id}: country ${d.country} is not in zone ${d.zone}`);
      }
    }
  }
  return errors;
}
