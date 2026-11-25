import type { DatacentersFile, StatusFile, ZonesFile } from "@powerstation/schema";
import { useEffect, useMemo, useState } from "preact/hooks";
import { calculate } from "./calc/calculate";
import type { CalcResult, EmissionFactors, ImportCapacity } from "./calc/types";
import { CopyButton } from "./components/CopyButton";
import { Method } from "./components/Method";
import { PeriodPicker } from "./components/PeriodPicker";
import { ResultColumn } from "./components/ResultColumn";
import { SizePicker } from "./components/SizePicker";
import { ZonePicker, type Place } from "./components/ZonePicker";
import {
  HOUSEHOLD_KWH_PER_YEAR,
  HOUSEHOLD_SOURCE,
  annualKwhPerHousehold,
  homesEquivalent,
} from "./constants/households";
import { nowMs } from "./data/clock";
import { isDataDelayed } from "./data/freshness";
import {
  loadDatacenters,
  loadEmissionFactors,
  loadImportCapacities,
  loadPeriod,
  loadStatus,
  loadZones,
  type PeriodData,
} from "./data/loader";
import { summarise } from "./state/summary";
import { buildSearch, parseUrlState, type Period, type UrlState } from "./state/url";
import { AttributionPanel, type Attribution } from "./ui-standins/AttributionPanel";
import { Banner } from "./ui-standins/Banner";

interface Base {
  status: StatusFile;
  zones: ZonesFile;
  datacenters: DatacentersFile;
  capacities: ImportCapacity[] | undefined;
  emissionFactors: EmissionFactors | undefined;
}

type Loaded<T> =
  { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [value, setValue] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    setValue({ state: "loading" });
    load().then(
      (data) => live && setValue({ state: "ready", data }),
      (e: unknown) =>
        live &&
        setValue({
          state: "error",
          message: e instanceof Error ? e.message : "Data could not be loaded.",
        }),
    );
    return () => {
      live = false;
    };
  }, deps);
  return value;
}

const loadBase = async (): Promise<Base> => {
  const [status, zones, datacenters, capacities, emissionFactors] = await Promise.all([
    loadStatus(),
    loadZones(),
    loadDatacenters(),
    loadImportCapacities(),
    loadEmissionFactors(),
  ]);
  return { status, zones, datacenters, capacities, emissionFactors };
};

export function App() {
  const base = useLoaded(loadBase, []);
  return (
    <main class="page">
      <header class="hero">
        <p class="eyebrow">powerstation.ai</p>
        <h1>What happens to the grid if a data center goes here?</h1>
        <p class="lead">
          Pick a place, a size and a period. We use real European grid data to estimate what a flat,
          around-the-clock load would do to one grid zone. All results are modelled estimates.
        </p>
      </header>
      {base.state === "loading" ? <p role="status">Loading grid data…</p> : null}
      {base.state === "error" ? (
        <div class="banner banner-warn" role="alert">
          <strong>The grid data could not be loaded.</strong> {base.message}
        </div>
      ) : null}
      {base.state === "ready" ? <Calculator base={base.data} /> : null}
    </main>
  );
}

function Calculator({ base }: { base: Base }) {
  const { zones, status, datacenters } = base;
  const [state, setState] = useState<UrlState>(() => parseUrlState(location.search, zones));
  const [compareOn, setCompareOn] = useState(state.compare !== undefined);

  useEffect(() => {
    history.replaceState(null, "", buildSearch(state, zones));
  }, [state, zones]);

  const period = useLoaded(() => loadPeriod(state.period), [state.period]);
  const set = (patch: Partial<UrlState>) => setState((s) => ({ ...s, ...patch }));

  const zoneName = (id: string) => zones.zones.find((z) => z.id === id)?.name ?? id;
  const countryName = (code: string) => zones.countries.find((c) => c.code === code)?.name ?? code;

  const delayed = isDataDelayed(status, nowMs());

  const columns = useMemo(() => {
    if (period.state !== "ready") return null;
    const places: Place[] = [state, ...(compareOn && state.compare ? [state.compare] : [])];
    return places.map((p) => {
      const result = runZone(p.zone, state.size, period.data, base);
      const homes = homesEquivalent(state.size, annualKwhPerHousehold(p.country));
      return { place: p, result, homes };
    });
  }, [period, state, compareOn, base]);

  const files =
    period.state === "ready"
      ? [status, zones, datacenters, period.data.generation, period.data.flows]
      : [status, zones, datacenters];
  const mock = files.some((f) => f.mock);

  const attributionAll: Attribution[] = [
    ...files.map((f) => ({
      name: f.source,
      license: f.license,
      text: f.attribution,
      url: f.source_url,
    })),
    ...datacenters.datacenters.map((d) => ({
      name: d.source,
      license: d.license,
      text: `Data center records (as of ${d.as_of}).`,
      url: d.source_url,
    })),
    ...(Object.keys(HOUSEHOLD_KWH_PER_YEAR).length > 0
      ? [
          {
            name: HOUSEHOLD_SOURCE.name,
            text: `Household electricity use, ${HOUSEHOLD_SOURCE.dataset}, retrieved ${HOUSEHOLD_SOURCE.retrieved}.`,
            url: HOUSEHOLD_SOURCE.url,
          },
        ]
      : []),
  ];

  // The same source can appear many times (for example one per data center): list it once.
  const attribution = [
    ...new Map(
      attributionAll.map((a) => [`${a.name}|${a.license}|${a.text}|${a.url}`, a]),
    ).values(),
  ];

  const periodLabel = state.period === "7d" ? "last 7 days" : "last 30 days";
  const getSummary = () =>
    summarise(
      (columns ?? []).flatMap((c) =>
        c.result ? [{ name: zoneName(c.place.zone), result: c.result, homes: c.homes }] : [],
      ),
      location.href,
      periodLabel,
      mock,
    );

  return (
    <>
      {delayed ? (
        <Banner tone="warn">
          Data delayed: the newest measured data is more than 2 hours old.
        </Banner>
      ) : null}
      {mock ? <Banner tone="info">Demo data: these numbers are not real.</Banner> : null}

      <section class="panel" aria-labelledby="inputs-title">
        <h2 id="inputs-title" class="sr-only">
          Your inputs
        </h2>
        <ol class="steps">
          <li>
            <h3>1. Pick a place</h3>
            <ZonePicker idPrefix="main" zones={zones} value={state} onChange={(p) => set(p)} />
            <label class="check">
              <input
                type="checkbox"
                checked={compareOn}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setCompareOn(on);
                  if (!on) setState((s) => ({ ...s, compare: undefined }));
                  else if (!state.compare) {
                    const other = zones.zones.find((z) => z.id !== state.zone);
                    if (other) set({ compare: { zone: other.id, country: other.countries[0] } });
                  }
                }}
              />
              <span>Compare with another zone</span>
            </label>
            {compareOn && state.compare ? (
              <>
                <ZonePicker
                  idPrefix="compare"
                  zones={zones}
                  value={state.compare}
                  onChange={(p) => set({ compare: p })}
                />
                {state.compare.zone === state.zone ? (
                  <p class="hint">Pick a different zone to compare.</p>
                ) : null}
              </>
            ) : null}
          </li>
          <li>
            <h3>2. Pick a size</h3>
            <SizePicker value={state.size} onChange={(size) => set({ size })} />
            <p class="hint">
              Load profile: flat. The data center uses the same power every hour, around the clock.
            </p>
          </li>
          <li>
            <h3>3. Pick a period</h3>
            <PeriodPicker value={state.period} onChange={(p: Period) => set({ period: p })} />
          </li>
        </ol>
      </section>

      <section aria-labelledby="results-title" aria-busy={period.state === "loading"}>
        <h2 id="results-title">Results</h2>
        {period.state === "loading" ? (
          <p role="status">Loading data for the {periodLabel}…</p>
        ) : null}
        {period.state === "error" ? (
          <div class="banner banner-warn" role="alert">
            <strong>The data for this period could not be loaded.</strong> {period.message}
          </div>
        ) : null}
        {columns ? (
          <>
            <div class={`columns ${columns.length > 1 ? "columns-2" : ""}`}>
              {columns.map((c, i) => (
                <ResultColumn
                  key={`${c.place.zone}-${i}`}
                  heading={zoneName(c.place.zone)}
                  countryName={countryName(c.place.country)}
                  result={c.result}
                  homes={c.homes}
                  mock={mock}
                />
              ))}
            </div>
            <CopyButton getText={getSummary} />
          </>
        ) : null}
        <p class="scope-note">
          This is a zone-level estimate. It cannot tell whether a specific site can connect to the
          grid. Local grid capacity is not public in most countries.
        </p>
      </section>

      <Method />
      <AttributionPanel items={attribution} />
    </>
  );
}

function runZone(zone: string, sizeMw: number, data: PeriodData, base: Base): CalcResult | null {
  const generation = data.generation.zones.find((z) => z.zone === zone);
  if (!generation) return null;
  return calculate({
    zone,
    sizeMw,
    generation,
    window: data.generation.window,
    borders: data.flows.borders,
    capacity: base.capacities?.find((c) => c.zone === zone),
    emissionFactors: base.emissionFactors,
    datacenters: base.datacenters.datacenters.filter((d) => d.zone === zone),
  });
}
