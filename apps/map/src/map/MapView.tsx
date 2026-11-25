// SVG map: countries shaded by the chosen layer, arrows for flows between countries.
import type { DataState } from "@powerstation/schema";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo, useRef, useState } from "preact/hooks";
import type { FlowAt } from "../data/metrics";
import { binFor, LAYERS, type LayerId } from "../layers";
import { layerValue, type Model, pairKey } from "../model";
import { formatPower } from "../standins/ui"; // TODO(D)
import { flowLabel, stateText } from "./labels";

export type CountryFeature = Feature<Geometry, { code: string; name: string }>;

const W = 800;
const H = 640;

interface Props {
  geo: FeatureCollection<Geometry, { code: string; name: string }>;
  model: Model;
  hour: number;
  flows: FlowAt[];
  layer: LayerId;
  selectedNode: string | null;
  selectedPair: string | null;
  onSelectNode: (id: string) => void;
  onSelectPair: (key: string) => void;
}

interface View {
  k: number;
  x: number;
  y: number;
}
const HOME: View = { k: 1, x: 0, y: 0 };

export function MapView(props: Props) {
  const { geo, model, hour, flows, layer } = props;
  const [view, setView] = useState<View>(HOME);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);

  // Projection: Lambert azimuthal equal-area centred on Europe (as EPSG:3035), fitted to the
  // countries that have data. Equal-area keeps shaded areas comparable.
  const { path, project, features } = useMemo(() => {
    const withData = geo.features.filter((f) => model.index.nodeOfCountry.has(f.properties.code));
    const proj = geoAzimuthalEqualArea()
      .rotate([-10, -52])
      .fitExtent(
        [
          [16, 16],
          [W - 16, H - 16],
        ],
        { type: "FeatureCollection", features: withData.length ? withData : geo.features },
      );
    // Draw order = tab order: countries without data first (not focusable), then A to Z.
    const rest = geo.features.filter((f) => !model.index.nodeOfCountry.has(f.properties.code));
    const sorted = [...withData].sort((a, b) => a.properties.name.localeCompare(b.properties.name));
    return {
      path: geoPath(proj),
      project: (lon: number, lat: number) => proj([lon, lat]) ?? [0, 0],
      features: [...rest, ...sorted],
    };
  }, [geo, model]);

  const toScreen = ([x, y]: [number, number]): [number, number] => [
    x * view.k + view.x,
    y * view.k + view.y,
  ];

  const zoom = (factor: number) =>
    setView((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor));
      // Zoom around the centre of the view.
      const cx = W / 2;
      const cy = H / 2;
      return k === 1 ? HOME : { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg || view.k === 1) return;
    const scale = W / svg.getBoundingClientRect().width;
    const dx = (e.clientX - d.x) * scale;
    const dy = (e.clientY - d.y) * scale;
    if (Math.abs(dx) + Math.abs(dy) > 6) {
      d.moved = true;
      if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId);
    }
    if (d.moved) setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const onPointerUp = () => {
    // Keep `moved` until the click event has run, so a drag does not select a country.
    setTimeout(() => (drag.current = null), 0);
  };
  const wasDrag = () => drag.current?.moved === true;

  const activate = (fn: () => void) => ({
    onClick: () => !wasDrag() && fn(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  });

  const L = LAYERS[layer];
  const nodeValues = useMemo(() => {
    const out = new Map<string, ReturnType<typeof layerValue>>();
    for (const n of model.index.nodes) out.set(n.id, layerValue(model, layer, n.id, hour, flows));
    return out;
  }, [model, layer, hour, flows]);

  return (
    <div class="mapview">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`Map of European countries. Shading: ${L.name}. Arrows: power flows between countries.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        class={view.k > 1 ? "pannable" : undefined}
      >
        <MapPatterns />
        <rect width={W} height={H} class="sea" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {features.map((f) => {
            const code = f.properties.code;
            const nodeId = model.index.nodeOfCountry.get(code);
            const d = path(f) ?? "";
            if (!nodeId)
              return <path key={code} d={d} class="country country--nodata" aria-hidden="true" />;
            const node = model.index.byId.get(nodeId)!;
            const p = nodeValues.get(nodeId)!;
            const bin = binFor(L, p);
            const selected = props.selectedNode === nodeId;
            const label = `${f.properties.name}${node.countries.length > 1 ? ` (one bidding zone: ${node.name})` : ""}. ${L.name}: ${
              p.value === null ? "no data" : bin!.label
            }, ${stateText(p.state)}.`;
            return (
              <g key={code}>
                <path
                  d={d}
                  class={`country${selected ? " country--selected" : ""}`}
                  style={{ fill: bin?.color ?? "var(--map-missing-fill)" }}
                  role="button"
                  tabindex={0}
                  aria-pressed={selected}
                  aria-label={label}
                  {...activate(() => props.onSelectNode(nodeId))}
                >
                  <title>{label}</title>
                </path>
                {p.state !== "measured" ? (
                  <path
                    d={d}
                    class={`country-state country-state--${p.state}`}
                    aria-hidden="true"
                  />
                ) : null}
              </g>
            );
          })}
        </g>
        <g class="flows">
          {flows.map((f) => {
            const a = model.index.byId.get(f.from)!.centroid;
            const b = model.index.byId.get(f.to)!.centroid;
            const key = pairKey(f);
            return (
              <Arrow
                key={key}
                flow={f}
                a={toScreen(project(a.lon, a.lat) as [number, number])}
                b={toScreen(project(b.lon, b.lat) as [number, number])}
                maxAbs={model.maxAbsFlow}
                selected={props.selectedPair === key}
                label={flowLabel(model, f)}
                {...activate(() => props.onSelectPair(key))}
              />
            );
          })}
        </g>
      </svg>
      <div class="zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoom(1.5)} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          onClick={() => zoom(1 / 1.5)}
          aria-label="Zoom out"
          disabled={view.k === 1}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setView(HOME)}
          aria-label="Reset map view"
          disabled={view.k === 1}
        >
          ⟲
        </button>
      </div>
    </div>
  );
}

function Arrow(props: {
  flow: FlowAt;
  a: [number, number];
  b: [number, number];
  maxAbs: number;
  selected: boolean;
  label: string;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  const { flow, maxAbs } = props;
  const v = flow.point.value;
  const state: DataState = flow.point.state;
  // Draw in the direction of the flow.
  const [p, q] = v !== null && v < 0 ? [props.b, props.a] : [props.a, props.b];
  const t0 = 0.2;
  const t1 = 0.8;
  const x1 = p[0] + (q[0] - p[0]) * t0;
  const y1 = p[1] + (q[1] - p[1]) * t0;
  const x2 = p[0] + (q[0] - p[0]) * t1;
  const y2 = p[1] + (q[1] - p[1]) * t1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const width = v === null ? 2 : 1.5 + 6.5 * Math.sqrt(Math.abs(v) / maxAbs);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const head = width * 1.6 + 8;
  const line = `M${x1},${y1}L${x2},${y2}`;
  return (
    <g
      class={`flow flow--${state}${props.selected ? " flow--selected" : ""}`}
      role="button"
      tabindex={-1}
      aria-pressed={props.selected}
      aria-label={props.label}
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
    >
      <title>{props.label}</title>
      <path d={line} class="flow__hit" />
      <path d={line} class="flow__halo" style={{ strokeWidth: width + 4 }} />
      <path d={line} class="flow__line" style={{ strokeWidth: width }} />
      {state === "measured" ? (
        <path d={line} class="flow__pulse" style={{ strokeWidth: Math.max(1.5, width / 3) }} />
      ) : null}
      {v === null ? (
        <g transform={`translate(${mx} ${my})`} class="flow__nodata">
          <circle r="8" />
          <text dy="4" text-anchor="middle" aria-hidden="true">
            ?
          </text>
        </g>
      ) : (
        <path
          class="flow__head"
          d={`M0,0L${-head},${-head * 0.6}L${-head},${head * 0.6}Z`}
          transform={`translate(${x2} ${y2}) rotate(${angle})`}
        />
      )}
      {props.selected && v !== null ? (
        <text x={mx} y={my - width - 6} class="flow__value" text-anchor="middle">
          {formatPower(Math.abs(v))}
          {state === "planned" ? " planned" : ""}
        </text>
      ) : null}
    </g>
  );
}

/** Patterns: data states are never shown by colour alone. */
function MapPatterns() {
  return (
    <defs>
      <pattern
        id="pat-modelled"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" class="pat-modelled-bg" />
        <line x1="0" y1="0" x2="0" y2="6" class="pat-modelled-line" />
      </pattern>
      <pattern id="pat-missing" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1" class="pat-missing-dot" />
      </pattern>
      <pattern id="pat-planned" width="8" height="8" patternUnits="userSpaceOnUse">
        <line x1="0" y1="4" x2="4" y2="4" class="pat-planned-line" />
      </pattern>
    </defs>
  );
}
