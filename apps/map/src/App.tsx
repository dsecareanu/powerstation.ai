// Step 1 — Watch: the map with a timeline.
import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useState } from "preact/hooks";
import { BorderPanel } from "./BorderPanel";
import { CountryPanel } from "./CountryPanel";
import { clockNow, type DefaultData, load30d, loadDefault } from "./data/load";
import { Guide } from "./Guide";
import type { LayerId } from "./layers";
import { Legend } from "./Legend";
import { MapView } from "./map/MapView";
import { toggleNode } from "./selection";
import { buildModel, flowsAt, fullestPair, loadForecastAt, pairKey } from "./model";
import { AttributionPanel, type AttributionSource, DataDelayedBanner } from "@powerstation/ui";
import { Timeline } from "./Timeline";
import "./app.css";

type Geo = FeatureCollection<Geometry, { code: string; name: string }>;

const CALCULATOR_URL = import.meta.env.VITE_CALCULATOR_URL ?? "/calculator/";

const SHAPES_SOURCE: AttributionSource = {
  source: "Natural Earth",
  source_url: "https://www.naturalearthdata.com/",
  license: "Public domain",
  attribution: "Country shapes: Natural Earth 1:50m admin-0 countries, simplified.",
  mock: false,
};

export function App() {
  const [data, setData] = useState<DefaultData | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [data30, setData30] = useState<Pick<DefaultData, "flows" | "generation"> | null>(null);
  const [loading30d, setLoading30d] = useState(false);
  const [hourMs, setHourMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [layer, setLayer] = useState<LayerId | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const [tab, setTab] = useState<"country" | "border">("country");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setNode(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const now = useMemo(() => clockNow(), []);

  useEffect(() => {
    loadDefault().then(setData, (e: Error) => setError(e.message));
    fetch(`${import.meta.env.BASE_URL}countries.geojson`)
      .then((r) => r.json() as Promise<Geo>)
      .then(setGeo, () => setError("Could not load the country shapes."));
  }, []);

  const files = range === "30d" && data30 ? { ...data!, ...data30 } : data;
  const model = useMemo(
    () =>
      files
        ? buildModel(files.zones, files.flows, files.generation, files.capacity, files.forecasts)
        : null,
    [files?.zones, files?.flows, files?.generation, files?.capacity, files?.forecasts],
  );

  // Defaults once the data is in: newest measured hour, fullest border, and renewables only when
  // generation data is published (it is restricted ENTSO-E data).
  useEffect(() => {
    if (!model) return;
    if (hourMs === null) setHourMs(model.measuredEnd - 3_600_000);
    if (layer === null) setLayer(model.hasGeneration ? "renewables" : "netImport");
    if (pair === null) {
      const p = fullestPair(model);
      if (p) setPair(pairKey(p));
    }
  }, [model]);

  const onRange = async (r: "7d" | "30d") => {
    if (r === "30d" && !data30) {
      setLoading30d(true);
      try {
        setData30(await load30d());
      } catch (e) {
        setError((e as Error).message);
        setLoading30d(false);
        return;
      }
      setLoading30d(false);
    }
    setRange(r);
  };

  if (error)
    return (
      <p class="app-error" role="alert">
        Sorry, the map could not load. {error}
      </p>
    );
  if (!data || !geo || !model || hourMs === null || layer === null)
    return <p class="app-loading">Loading the grid…</p>;

  const index = nearestIndex(model.hours, hourMs);
  const hour = model.hours[index]!;
  const latestIndex = nearestIndex(model.hours, model.measuredEnd - 3_600_000);
  const flows = flowsAt(model, hour);
  const sources: AttributionSource[] = [
    data.status,
    data.zones,
    files!.flows,
    files!.generation,
    data.capacity,
    data.forecasts,
    SHAPES_SOURCE,
  ].filter((f): f is AttributionSource => f !== null);
  const forecastHere = model.index.nodes.some(
    (n) => loadForecastAt(model, n.id, hour).value !== null,
  );

  return (
    <div class="app">
      <header class="app__header">
        <h1>Watch the grid</h1>
        <p>See how electricity moves between European countries, hour by hour.</p>
        <a class="app__next" href={CALCULATOR_URL}>
          Next: place a data center →
        </a>
      </header>
      <DataDelayedBanner status={data.status} now={new Date(now)} />
      <main class="app__main">
        <div class="app__map">
          <MapView
            geo={geo}
            model={model}
            hour={hour}
            flows={flows}
            layer={layer}
            selectedNode={node}
            selectedPair={tab === "border" ? pair : null}
            onSelectNode={(id) => {
              setNode((cur) => toggleNode(cur, id));
              setTab("country");
            }}
            onSelectPair={(k) => {
              setPair(k);
              setTab("border");
            }}
          />
        </div>
        <div class="app__timeline">
          <Timeline
            hours={model.hours}
            index={index}
            latestIndex={latestIndex}
            measuredEnd={model.measuredEnd}
            hasPlanned={model.hasPlanned}
            now={now}
            playing={playing}
            range={range}
            loading30d={loading30d}
            reducedMotion={reducedMotion}
            onIndex={(i) => setHourMs(model.hours[i]!)}
            onPlaying={setPlaying}
            onRange={onRange}
          />
        </div>
        <div class="app__legend">
          <Legend
            layer={layer}
            future={hour >= model.measuredEnd}
            hasGeneration={model.hasGeneration}
            hasPlanned={model.hasPlanned}
            forecastHere={forecastHere}
            onLayer={setLayer}
          />
        </div>
        <aside class="app__side">
          <div class="tabs" role="tablist" aria-label="Details">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "country"}
              onClick={() => setTab("country")}
            >
              Country
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "border"}
              onClick={() => setTab("border")}
            >
              Border
            </button>
          </div>
          {tab === "country" ? (
            <CountryPanel
              model={model}
              nodeId={node}
              hour={hour}
              onSelectNode={setNode}
              onHour={setHourMs}
            />
          ) : (
            <BorderPanel
              model={model}
              pairKey={pair}
              hour={hour}
              onSelectPair={setPair}
              onHour={setHourMs}
            />
          )}
        </aside>
      </main>
      <footer class="app__footer">
        <Guide />
        <AttributionPanel files={sources} />
      </footer>
    </div>
  );
}

function nearestIndex(hours: number[], ms: number): number {
  const i = hours.findIndex((h) => h >= ms);
  if (i === -1) return hours.length - 1;
  if (i > 0 && ms - hours[i - 1]! < hours[i]! - ms) return i - 1;
  return i;
}

function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return match;
}
